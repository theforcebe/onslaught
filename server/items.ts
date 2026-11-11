import {
  boundedItemJSON,
  ITEM_FRESH_MS,
  ITEM_STALE_MS,
  itemParams,
  parseWowhead,
  wowheadURL,
} from "../src/lib/item-data";
import type { ItemResult } from "../src/lib/item-data";
const inFlight = new Map<string, Promise<ItemResult>>();
const searchFlight = new Map<string, Promise<Response>>();
export async function serveItemSearch(
  req: Request,
  cache: Pick<Cache, "match" | "put">,
  checkRate: () => Promise<void>,
) {
  const url = new URL(req.url),
    q = (url.searchParams.get("q") || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  if (
    req.method !== "GET" ||
    q.length < 2 ||
    q.length > 64 ||
    [...url.searchParams.keys()].some((k) => k !== "q")
  )
    return new Response("Enter 2–64 characters", { status: 400 });
  const key = new Request(
    `${url.origin}/item-search/v3?q=${encodeURIComponent(q)}`,
  );
  const cached = await cache.match(key).catch(() => undefined);
  if (cached) {
    const data = (await cached.json()) as {
      available: boolean;
      provider?: string;
      retryAfter?: number;
    };
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${data.available ? (data.provider === "thewowdb" ? 3600 : 43200) : data.retryAfter || 60}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  let pending = searchFlight.get(q);
  if (!pending) {
    pending = (async () => {
      await checkRate();
      let results: {
        id: number;
        name: string;
        icon: string;
        quality: number;
        category: string;
        source?: "thewowdb";
      }[] = [];
      let ok = false;
      let provider = "wowhead",
        retryAfter = 60;
      try {
        const r = await fetch(
          `https://www.wowhead.com/forever/search/suggestions-template?q=${encodeURIComponent(q)}`,
          {
            redirect: "manual",
            signal: AbortSignal.timeout(7000),
            headers: { Accept: "application/json" },
          },
        );
        if (r.ok) {
          const data = (await boundedItemJSON(r)) as { results?: unknown[] };
          if (Array.isArray(data?.results)) {
            ok = true;
            results = data.results
              .filter(
                (v: any) =>
                  v?.type === 3 &&
                  Number.isSafeInteger(v.id) &&
                  v.id > 0 &&
                  typeof v.name === "string",
              )
              .slice(0, 20)
              .map((v: any) => ({
                id: v.id,
                name: v.name.replace(/<[^>]*>/g, "").slice(0, 150),
                icon: /^[a-z0-9_]+$/i.test(v.icon)
                  ? v.icon
                  : "inv_misc_questionmark",
                quality: Number.isInteger(v.quality) ? v.quality : 1,
                category:
                  typeof v.pinFooterText === "string"
                    ? v.pinFooterText.replace(/<[^>]*>/g, "").slice(0, 60)
                    : "Item",
              }));
          }
        }
      } catch {
        /* An upstream outage never exposes request details. */
      }
      if (!ok) {
        try {
          const r = await fetch(
            `https://thewowdb.com/api/v1/forever/item/?q=${encodeURIComponent(q)}&per_page=100`,
            {
              redirect: "manual",
              signal: AbortSignal.timeout(7000),
              headers: { Accept: "application/json" },
            },
          );
          if (r.status === 429)
            retryAfter = Math.max(
              60,
              Math.min(3600, Number(r.headers.get("Retry-After")) || 60),
            );
          if (r.ok) {
            const data = (await boundedItemJSON(r)) as {
              version?: string;
              results?: unknown[];
            };
            if (data.version === "forever" && Array.isArray(data.results)) {
              ok = true;
              provider = "thewowdb";
              results = data.results
                .filter(
                  (v: any) =>
                    v?.kind === "item" &&
                    v.version === "forever" &&
                    Number.isSafeInteger(v.id) &&
                    v.id > 0 &&
                    typeof v.name === "string",
                )
                .slice(0, 100)
                .sort(
                  (a: any, b: any) =>
                    Number(!a.name.toLowerCase().startsWith(q)) -
                      Number(!b.name.toLowerCase().startsWith(q)) ||
                    a.name.localeCompare(b.name) ||
                    a.id - b.id,
                )
                .slice(0, 20)
                .map((v: any) => ({
                  id: v.id,
                  name: v.name.replace(/<[^>]*>/g, "").slice(0, 150),
                  icon: "inv_misc_questionmark",
                  quality:
                    (
                      {
                        poor: 0,
                        common: 1,
                        uncommon: 2,
                        rare: 3,
                        epic: 4,
                        legendary: 5,
                      } as Record<string, number>
                    )[v.quality] ?? 1,
                  category: "Forever item",
                  source: "thewowdb",
                }));
            }
          }
        } catch {
          /* Both providers failing leaves manual item entry available. */
        }
      }
      const response = new Response(
        JSON.stringify({
          results,
          available: ok,
          provider,
          ...(!ok ? { retryAfter } : {}),
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${ok ? (provider === "thewowdb" ? 3600 : 43200) : retryAfter}`,
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
      await cache.put(key, response.clone()).catch(() => {});
      return response;
    })().finally(() => searchFlight.delete(q));
    searchFlight.set(q, pending);
  }
  return (await pending).clone();
}
export async function serveItem(
  req: Request,
  cache: Pick<Cache, "match" | "put">,
  checkRate: () => Promise<void>,
) {
  const url = new URL(req.url),
    match = /^\/api\/items\/([1-9][0-9]{0,8})$/.exec(url.pathname);
  if (req.method !== "GET" || !match)
    return new Response("Not found", { status: 404 });
  if (
    [...url.searchParams.keys()].some(
      (k) => !["bonus", "ench", "gems"].includes(k),
    )
  )
    return new Response("Invalid modifiers", { status: 400 });
  const params = itemParams({
    bonus_id: url.searchParams.get("bonus") || "",
    enchant_id: url.searchParams.get("ench") || "",
    gem_id: url.searchParams.get("gems") || "",
  });
  if ([...url.searchParams].some(([k, v]) => params.get(k) !== v))
    return new Response("Invalid modifiers", { status: 400 });
  const id = Number(match[1]),
    key = new Request(`${url.origin}/item-cache/v2/${id}?${params}`);
  let cached: ItemResult | undefined;
  try {
    const r = await cache.match(key);
    if (r) cached = (await r.json()) as ItemResult;
  } catch {
    /* cache is optional */
  }
  const age = Date.now() - (cached?.checkedAt || 0),
    ttl =
      cached?.status === "resolved"
        ? ITEM_FRESH_MS
        : cached?.status === "unresolved"
          ? 300000
          : 60000;
  let result =
    cached && (age < ttl || (cached.retryAt || 0) > Date.now())
      ? cached
      : undefined;
  if (!result) {
    let pending = inFlight.get(key.url);
    if (!pending) {
      pending = (async () => {
        await checkRate();
        let next: ItemResult = { status: "unavailable", checkedAt: Date.now() };
        try {
          const r = await fetch(wowheadURL(id, params), {
            headers: { Accept: "application/json" },
            redirect: "manual",
            signal: AbortSignal.timeout(7000),
          });
          if (r.status === 404)
            next = { status: "unresolved", checkedAt: Date.now() };
          else if (r.ok) {
            const item = parseWowhead(
              id,
              await boundedItemJSON(r),
              params.size > 0,
            );
            if (item)
              next = { status: "resolved", item, checkedAt: Date.now() };
          }
        } catch {
          /* Keep provider and request details out of errors. */
        }
        if (
          next.status === "unavailable" &&
          cached?.status === "resolved" &&
          age < ITEM_STALE_MS
        )
          next = { ...cached, stale: true, retryAt: Date.now() + 60000 };
        try {
          await cache.put(
            key,
            new Response(JSON.stringify(next), {
              headers: {
                "Cache-Control": `public, max-age=${next.status === "resolved" ? Math.max(1, Math.floor((ITEM_STALE_MS - (Date.now() - next.checkedAt)) / 1000)) : next.status === "unresolved" ? 300 : 60}`,
              },
            }),
          );
        } catch {
          /* cache is optional */
        }
        return next;
      })().finally(() => inFlight.delete(key.url));
      inFlight.set(key.url, pending);
    }
    result = await pending;
  }
  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${result.stale ? 60 : result.status === "resolved" ? 3600 : 60}`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// D1 preserves the shared cache across regions and deployments; edge caching is optional.
export function publicItemCache(
  db: D1Database,
  edge: Pick<Cache, "match" | "put">,
): Pick<Cache, "match" | "put"> {
  return {
    async match(request: RequestInfo | URL) {
      const key = request instanceof Request ? request.url : String(request);
      try {
        const hit = await edge.match(request);
        if (hit) return hit;
      } catch {}
      const row = await db
        .prepare("SELECT payload FROM item_cache WHERE key=? AND expires_at>?")
        .bind(key, Date.now())
        .first<{ payload: string }>();
      return row ? new Response(row.payload) : undefined;
    },
    async put(request: RequestInfo | URL, response: Response) {
      const key = request instanceof Request ? request.url : String(request),
        payload = await response.clone().text();
      const ttl =
        Number(
          response.headers.get("Cache-Control")?.match(/max-age=(\d+)/)?.[1] ||
            60,
        ) * 1000;
      await db.batch([
        db
          .prepare(
            "INSERT INTO item_cache (key,payload,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at",
          )
          .bind(key, payload, Date.now() + ttl),
        db
          .prepare("DELETE FROM item_cache WHERE expires_at<?")
          .bind(Date.now()),
      ]);
      try {
        await edge.put(request, response);
      } catch {}
    },
  };
}
