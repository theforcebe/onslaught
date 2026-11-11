import {
  boundedItemJSON,
  ITEM_FRESH_MS,
  ITEM_STALE_MS,
  itemKey,
  itemParams,
  parseWowhead,
  wowheadURL,
} from "./item-data";
import type { ItemResult, ItemModifiers } from "./item-data";
export type { ItemData, ItemResult } from "./item-data";
export { itemLink } from "./item-data";
const API = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const memory = new Map<string, ItemResult>(),
  inFlight = new Map<string, Promise<ItemResult>>();
const PREFIX = "onslaught:tooltip:v2:";
let active = 0;
const waiting: (() => void)[] = [];
async function slot() {
  if (active >= 3) await new Promise<void>((r) => waiting.push(r));
  else active++;
  return () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
}
export function safeIcon(url?: string) {
  try {
    const u = new URL(url || "");
    return u.protocol === "https:" &&
      ["render.worldofwarcraft.com", "wow.zamimg.com", "thewowdb.com"].includes(
        u.hostname,
      )
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
function save(key: string, value: ItemResult) {
  memory.delete(key);
  memory.set(key, value);
  if (memory.size > 300) memory.delete(memory.keys().next().value!);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    if (keys.length > 300) {
      keys.sort((a, b) => {
        try {
          return (
            JSON.parse(localStorage.getItem(a)!).checkedAt -
            JSON.parse(localStorage.getItem(b)!).checkedAt
          );
        } catch {
          return 0;
        }
      });
      keys
        .slice(0, keys.length - 300)
        .forEach((k) => localStorage.removeItem(k));
    }
  } catch {
    /* Optional public metadata cache. */
  }
}
export async function getItem(
  id: number,
  modifiers: ItemModifiers = {},
): Promise<ItemResult> {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 999999999)
    throw new Error("Invalid item ID");
  const key = itemKey(id, modifiers);
  let cached = memory.get(key);
  try {
    cached ||= JSON.parse(localStorage.getItem(PREFIX + key) || "null");
  } catch {
    /* optional */
  }
  const age = Date.now() - (cached?.checkedAt || 0),
    ttl =
      cached?.status === "resolved"
        ? ITEM_FRESH_MS
        : cached?.status === "unresolved"
          ? 300000
          : 60000;
  if (cached && (age < ttl || (cached.retryAt || 0) > Date.now()))
    return cached;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async () => {
      const release = await slot();
      let result: ItemResult = { status: "unavailable", checkedAt: Date.now() };
      try {
        const params = itemParams(modifiers),
          url = API
            ? `${API}/api/items/${id}?${params}`
            : wowheadURL(id, params);
        const r = await fetch(url, {
          credentials: "omit",
          referrerPolicy: "no-referrer",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        if (r.status === 404)
          result = { status: "unresolved", checkedAt: Date.now() };
        else if (r.ok) {
          const raw = await boundedItemJSON(r);
          if (API) {
            if (
              ["resolved", "unresolved", "unavailable"].includes(raw.status) &&
              typeof raw.checkedAt === "number" &&
              (raw.status !== "resolved" || raw.item?.id === id)
            )
              result = raw;
          } else {
            const item = parseWowhead(id, raw, params.size > 0);
            if (item)
              result = { status: "resolved", item, checkedAt: Date.now() };
          }
        }
      } catch {
        /* Imported data stays available offline. */
      } finally {
        release();
      }
      if (
        result.status === "unavailable" &&
        cached?.status === "resolved" &&
        age < ITEM_STALE_MS
      ) {
        const stale = { ...cached, stale: true, retryAt: Date.now() + 60000 };
        save(key, stale);
        return stale;
      }
      save(key, result);
      return result;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}
