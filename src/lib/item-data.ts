// Public metadata only. Provider HTML is converted to text, never executed.
export type ItemData = {
  id: number;
  name: string;
  quality: string;
  item_level: number;
  required_level: number;
  slot: string;
  icon_url?: string;
  stats: { name: string; value: number }[];
  build?: string;
  effects?: unknown[];
  weapon?: unknown;
  links?: { html: string };
  tooltipLines?: string[];
  source?: string;
  variant?: boolean;
};
export type ItemResult = {
  status: "resolved" | "unresolved" | "unavailable";
  item?: ItemData;
  checkedAt: number;
  stale?: boolean;
  retryAt?: number;
};
export type ItemModifiers = Record<string, string>;
export const ITEM_FRESH_MS = 12 * 3600000,
  ITEM_STALE_MS = 30 * 86400000;
export function itemParams(modifiers: ItemModifiers = {}) {
  const params = new URLSearchParams();
  for (const [from, to, max] of [
    ["bonus_id", "bonus", 16],
    ["enchant_id", "ench", 1],
    ["gem_id", "gems", 4],
  ] as const) {
    const raw = modifiers[from];
    if (!raw || raw.length > 180) continue;
    const values = raw.split(/[:/]/);
    if (values.length <= max && values.every((n) => /^[0-9]{1,8}$/.test(n)))
      params.set(to, values.map(Number).join(":"));
  }
  return params;
}
export function itemKey(id: number, modifiers: ItemModifiers = {}) {
  return `${id}?${itemParams(modifiers)}`;
}
export function itemLink(id: number, modifiers: ItemModifiers = {}) {
  const p = itemParams(modifiers).toString();
  return `https://www.wowhead.com/forever/item=${id}${p ? "&" + p : ""}`;
}
const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  plusmn: "±",
  bull: "•",
  times: "×",
};
export function tooltipText(html: string) {
  return html
    .slice(0, 100000)
    .replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<span\b[^>]*class=["'][^"']*money(gold|silver|copper)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
      "$2 $1 ",
    )
    .replace(/<br\b[^>]*>|<\/(?:tr|table|div|p|h[1-6])\s*>/gi, "\n")
    .replace(/<\/(?:td|th)\s*>/gi, "  ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, code: string) => {
      if (code.startsWith("#")) {
        const n =
          code[1].toLowerCase() === "x"
            ? parseInt(code.slice(2), 16)
            : Number(code.slice(1));
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
          ? String.fromCodePoint(n)
          : "";
      }
      return entities[code.toLowerCase()] || "";
    })
    .split("\n")
    .map((s) => s.replace(/[\t\r ]+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 70);
}
export function parseWowhead(
  id: number,
  data: unknown,
  variant = false,
): ItemData | undefined {
  if (!data || typeof data !== "object") return;
  const d = data as Record<string, unknown>;
  if (
    typeof d.name !== "string" ||
    !d.name ||
    typeof d.tooltip !== "string" ||
    !d.tooltip
  )
    return;
  const lines = tooltipText(d.tooltip),
    name = tooltipText(d.name).join(" ").slice(0, 300);
  if (!name || !lines.length) return;
  const qualities = [
    "poor",
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
    "artifact",
    "heirloom",
  ];
  return {
    id,
    name,
    quality: qualities[Number(d.quality)] || "common",
    item_level: Number(lines.join(" ").match(/Item Level (\d+)/)?.[1] || 0),
    required_level: Number(
      lines.join(" ").match(/Requires Level (\d+)/)?.[1] || 0,
    ),
    slot: "",
    stats: [],
    tooltipLines: lines,
    source: "Wowhead Forever",
    variant,
    ...(typeof d.icon === "string" && /^[a-z0-9_-]{1,100}$/i.test(d.icon)
      ? {
          icon_url: `https://wow.zamimg.com/images/wow/icons/large/${d.icon.toLowerCase()}.jpg`,
        }
      : {}),
    links: { html: itemLink(id) },
  };
}
export function wowheadURL(id: number, params: URLSearchParams) {
  const u = new URL(`https://nether.wowhead.com/tooltip/item/${id}`);
  u.searchParams.set("dataEnv", "16");
  u.searchParams.set("locale", "0");
  for (const [k, v] of params)
    if (["bonus", "ench", "gems"].includes(k)) u.searchParams.set(k, v);
  return u.href;
}
export async function boundedItemJSON(response: Response) {
  if (Number(response.headers.get("Content-Length") || 0) > 150000)
    throw new Error("Item response too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty item response");
  let size = 0,
    body = "";
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 150000) {
      await reader.cancel();
      throw new Error("Item response too large");
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode());
}
