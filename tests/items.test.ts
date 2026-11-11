import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundedItemJSON,
  itemKey,
  itemParams,
  parseWowhead,
  tooltipText,
  wowheadURL,
  ITEM_FRESH_MS,
} from "../src/lib/item-data";
import { serveItem } from "../server/items";
const sample = {
  name: "Test Jerkin",
  quality: 2,
  icon: "inv_chest_leather_01",
  tooltip:
    "<table><tr><td><b>Test Jerkin of the Monkey</b><br>Item Level 16<br>+3 Agility<br><span>Stamina +3 and Armor +24</span></td></tr></table>",
};
function cache() {
  const values = new Map<string, Response>();
  return {
    values,
    match: async (r: Request) => values.get(r.url)?.clone(),
    put: async (r: Request, v: Response) => {
      values.set(r.url, v);
    },
  };
}
const request = (suffix = "") =>
  new Request("https://gateway.example/api/items/15304" + suffix, {
    headers: {
      Authorization: "Bearer not-forwarded",
      Cookie: "private=not-forwarded",
    },
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Forever tooltip gateway", () => {
  it("uses the verified Forever namespace and keeps variant keys distinct", () => {
    expect(
      wowheadURL(15304, itemParams({ bonus_id: "12721", enchant_id: "8484" })),
    ).toBe(
      "https://nether.wowhead.com/tooltip/item/15304?dataEnv=16&locale=0&bonus=12721&ench=8484",
    );
    expect(itemKey(1, { bonus_id: "2" })).not.toBe(
      itemKey(1, { bonus_id: "3" }),
    );
    expect(
      itemParams({ bonus_id: "1/2", content_tuning: "5249" }).toString(),
    ).toBe("bonus=1%3A2");
  });
  it("extracts safe readable text and never preserves executable markup or arbitrary icons", () => {
    const item = parseWowhead(15304, {
      ...sample,
      icon: "https://evil.example/x",
      tooltip:
        sample.tooltip +
        '<script>steal()</script><style>hidden</style><img onerror="steal()">&lt;b&gt;plain&lt;/b&gt;',
    });
    expect(item?.icon_url).toBeUndefined();
    expect(item?.tooltipLines?.join(" ")).toContain("Stamina +3 and Armor +24");
    expect(item?.tooltipLines?.join(" ")).not.toContain("steal");
    expect(item?.tooltipLines?.at(-1)).toContain("<b>plain</b>");
    expect(tooltipText("&#999999999; &amp;")).toEqual(["&"]);
  });
  it("bounds provider body size before parsing", async () => {
    await expect(
      boundedItemJSON(new Response("x".repeat(150001))),
    ).rejects.toThrow("too large");
    expect(parseWowhead(1, { name: "x" })).toBeUndefined();
  });
  it("never forwards authentication, follows redirects, or permits arbitrary upstreams", async () => {
    const c = cache(),
      rate = vi.fn();
    const f = vi.fn(async (_u, opts) => {
      expect(opts.redirect).toBe("manual");
      expect(opts.headers).toEqual({ Accept: "application/json" });
      return Response.json(sample);
    });
    vi.stubGlobal("fetch", f);
    const r = await serveItem(
      request("?bonus=12721&ench=8484"),
      c as any,
      rate,
    );
    expect(((await r.json()) as any).item.variant).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(rate).toHaveBeenCalledTimes(1);
    expect(
      (await serveItem(request("?url=https://evil.example"), c as any, rate))
        .status,
    ).toBe(400);
    expect((await serveItem(request("?ench=1:2"), c as any, rate)).status).toBe(
      400,
    );
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("deduplicates simultaneous requests and serves the shared fresh cache", async () => {
    const c = cache(),
      rate = vi.fn(),
      f = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return Response.json(sample);
      });
    vi.stubGlobal("fetch", f);
    await Promise.all([
      serveItem(request(), c as any, rate),
      serveItem(request(), c as any, rate),
    ]);
    await serveItem(request(), c as any, rate);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("briefly caches missing items and provider failures instead of retrying on every hover", async () => {
    for (const status of [404, 429, 502]) {
      const c = cache(),
        f = vi.fn(async () => new Response("", { status }));
      vi.stubGlobal("fetch", f);
      const r = await serveItem(request(), c as any, async () => {});
      expect(((await r.json()) as any).status).toBe(
        status === 404 ? "unresolved" : "unavailable",
      );
      await serveItem(request(), c as any, async () => {});
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
  it("retains successful stale metadata during provider outages", async () => {
    const c = cache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(sample)),
    );
    await serveItem(request(), c as any, async () => {});
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + ITEM_FRESH_MS + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const result = (await (
      await serveItem(request(), c as any, async () => {})
    ).json()) as any;
    expect(result.status).toBe("resolved");
    expect(result.stale).toBe(true);
    expect(result.item.name).toBe("Test Jerkin");
  });
  it("deduplicates client lookups by complete variant without any credentials", async () => {
    vi.resetModules();
    const f = vi.fn(async (_url, opts) => {
      expect(opts.credentials).toBe("omit");
      expect(opts.headers).toBeUndefined();
      return Response.json(sample);
    });
    vi.stubGlobal("fetch", f);
    const { getItem } = await import("../src/lib/items");
    const result = await Promise.all([
      getItem(15304, { bonus_id: "12721" }),
      getItem(15304, { bonus_id: "12721" }),
    ]);
    expect(result[0].status).toBe("resolved");
    expect(f).toHaveBeenCalledTimes(1);
    await getItem(15304, { bonus_id: "12722" });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
