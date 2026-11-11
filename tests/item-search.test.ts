import { it, expect, vi, afterEach } from "vitest";
import { serveItemSearch } from "../server/items";
afterEach(() => vi.unstubAllGlobals());
function cache() {
  const records = new Map<string, Response>();
  return {
    match: vi.fn(async (r: Request) => records.get(r.url)?.clone()),
    put: vi.fn(async (r: Request, v: Response) => {
      records.set(r.url, v.clone());
    }),
  } as unknown as Pick<Cache, "match" | "put">;
}
it("searches only Forever items, preserves duplicate names by ID, strips markup and caches normalized queries", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      results: [
        {
          type: 3,
          id: 13928,
          name: "Grilled Squid",
          icon: "inv_misc_fish_13",
          quality: 1,
          pinFooterText: "Food",
        },
        {
          type: 3,
          id: 287974,
          name: "Grilled Squid",
          icon: "https://evil.invalid/a",
          quality: 1,
        },
        { type: 6, id: 99, name: "Spell" },
        { type: 3, id: 42, name: "<b>Item</b>", icon: "inv_test", quality: 2 },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const c = cache(),
    rate = vi.fn(async () => {});
  const result = await (
    await serveItemSearch(
      new Request(
        "https://gateway.example/api/items/search?q=Grilled%20%20Squid",
      ),
      c,
      rate,
    )
  ).json();
  expect(result.results.map((r: any) => r.id)).toEqual([13928, 287974, 42]);
  expect(result.results[1].icon).toBe("inv_misc_questionmark");
  expect(result.results[2].name).toBe("Item");
  expect(fetch.mock.calls[0][0]).toBe(
    "https://www.wowhead.com/forever/search/suggestions-template?q=grilled%20squid",
  );
  expect(fetch.mock.calls[0][1]).not.toHaveProperty("headers.Authorization");
  await serveItemSearch(
    new Request("https://gateway.example/api/items/search?q=grilled%20squid"),
    c,
    rate,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(rate).toHaveBeenCalledTimes(1);
});
it("rejects malformed searches without upstream calls and bounds outage caching", async () => {
  const upstream = vi.fn(async () => {
    throw new Error("provider details");
  });
  vi.stubGlobal("fetch", upstream);
  const c = cache(),
    rate = async () => {};
  expect(
    (
      await serveItemSearch(
        new Request("https://gateway.example/api/items/search?q=a"),
        c,
        rate,
      )
    ).status,
  ).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
  const r = await serveItemSearch(
    new Request("https://gateway.example/api/items/search?q=dreamfoil"),
    c,
    rate,
  );
  expect(r.headers.get("Cache-Control")).toContain("max-age=60");
  expect(await r.json()).toMatchObject({
    available: false,
    results: [],
    retryAfter: 60,
  });
  const again = await serveItemSearch(
    new Request("https://gateway.example/api/items/search?q=dreamfoil"),
    c,
    rate,
  );
  expect(again.headers.get("Cache-Control")).toContain("max-age=60");
});
it("uses a credential-free Forever fallback with attribution when Wowhead declines requests", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("Unavailable", { status: 403 }))
    .mockResolvedValueOnce(
      Response.json({
        version: "forever",
        results: [
          {
            kind: "item",
            version: "forever",
            id: 13463,
            name: "Dreamfoil",
            quality: "common",
          },
          { kind: "item", version: "retail", id: 999, name: "Wrong version" },
        ],
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const c = cache(),
    r = await serveItemSearch(
      new Request("https://gateway.example/api/items/search?q=dreamfoil"),
      c,
      async () => {},
    ),
    data = await r.json();
  expect(data).toMatchObject({
    available: true,
    provider: "thewowdb",
    results: [{ id: 13463, name: "Dreamfoil", source: "thewowdb" }],
  });
  expect(r.headers.get("Cache-Control")).toContain("max-age=3600");
  expect(fetch.mock.calls[1][0]).toBe(
    "https://thewowdb.com/api/v1/forever/item/?q=dreamfoil&per_page=100",
  );
  expect(fetch.mock.calls[1][1].headers).toEqual({
    Accept: "application/json",
  });
});
it("respects fallback rate-limit backoff in cached errors", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("Unavailable", { status: 403 }))
    .mockResolvedValueOnce(
      new Response("Slow down", {
        status: 429,
        headers: { "Retry-After": "180" },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const c = cache(),
    req = new Request("https://gateway.example/api/items/search?q=flask"),
    r = await serveItemSearch(req, c, async () => {});
  expect(r.headers.get("Cache-Control")).toContain("max-age=180");
  expect((await r.json()).available).toBe(false);
  expect(
    (await serveItemSearch(req, c, async () => {})).headers.get(
      "Cache-Control",
    ),
  ).toContain("max-age=180");
  expect(fetch).toHaveBeenCalledTimes(2);
});
