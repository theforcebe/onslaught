import { ROLES, type Character, type RaidEvent } from "../src/lib/model";
import { normalizeSpec, signupBuildKind } from "../src/lib/raid";

/** Escape a single line of guild-authored text before placing it in Discord Markdown. */
export function discordLine(value: string, maxLength = 120): string {
  const clean = value
    .replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim();
  // Break automatic links as well as Markdown links, while preserving their visible text.
  const text = clean.replace(/:(?=\/\/)|\.(?=[\p{L}\p{N}])/gu, "$&\u200b");
  const parts = Array.from(text, (char) => {
    if (char === "@") return "＠";
    if (char === "<") return "‹";
    if (char === ">") return "›";
    if (/[\\*_~`|[\]()#]/u.test(char)) return "\\" + char;
    return char;
  });
  const line = parts.join("");
  if (line.length <= maxLength) return line;
  if (maxLength < 1) return "";
  let prefix = "";
  for (const part of parts) {
    if (prefix.length + part.length >= maxLength) break;
    prefix += part;
  }
  return prefix + "…";
}

type Role = Character["role"];
type Bucket = Role | "tentative" | "absent";
const headings: Record<Bucket, string> = {
  tank: "🛡️ Tanks",
  healer: "💚 Healers",
  melee: "⚔️ Melee",
  ranged: "🏹 Ranged",
  unassigned: "◻️ Role unassigned",
  tentative: "🕒 Maybe",
  absent: "➖ Unavailable",
};

function namedSignup(c: Character, event: RaidEvent, showRole: boolean) {
  const selected = event.signupBuilds?.[c.id];
  const role = selected?.role ?? c.role;
  const spec = normalizeSpec(c.class, selected?.spec ?? c.spec);
  const name =
    discordLine(c.name.replace(/#\d{3,}\b/gu, ""), 48) || "Unnamed character";
  const details = [];
  if (spec && role !== "unassigned") {
    details.push(spec, signupBuildKind(c, { spec, role }));
  }
  if (showRole && role !== "unassigned") details.push(role);
  return ["**" + name + "**", ...details].join(" · ");
}

// A message can have 6,000 embed characters. Seven fields at 760 leave room
// for names, headings and the summary, including when every group overflows.
function fieldValue(firstLine: string, names: string[]) {
  let value = firstLine;
  for (const [index, name] of names.entries()) {
    const separator = value ? "\n" : "";
    const remaining = names.length - index - 1;
    const suffix = remaining ? "\n+" + remaining + " more" : "";
    if (value.length + separator.length + name.length + suffix.length > 760) {
      return value + "\n+" + (remaining + 1) + " more";
    }
    value += separator + name;
  }
  return value;
}

export function raidSignupEmbed(
  event: RaidEvent,
  characters: readonly Character[],
  visibleCharacterIds?: ReadonlySet<string>,
) {
  const people = new Map(characters.map((c) => [c.id, c]));
  const buckets = new Map<Bucket, { count: number; names: string[] }>();
  let confirmed = 0;
  for (const [id, status] of Object.entries(event.signups)) {
    const c = people.get(id);
    const key =
      status === "going"
        ? (event.signupBuilds?.[id]?.role ?? c?.role ?? "unassigned")
        : status;
    if (status === "going") confirmed++;
    const bucket = buckets.get(key) ?? { count: 0, names: [] };
    bucket.count++;
    if (c && visibleCharacterIds?.has(id))
      bucket.names.push(namedSignup(c, event, status !== "going"));
    buckets.set(key, bucket);
  }
  const fields = [];
  for (const key of [...ROLES, "tentative", "absent"] as const) {
    const item = buckets.get(key);
    const count = item?.count ?? 0;
    const names = item?.names.sort() ?? [];
    const statusOnly = key === "tentative" || key === "absent";
    if ((key === "unassigned" && !count) || (statusOnly && !names.length))
      continue;
    const filled = confirmed ? Math.round((count / confirmed) * 8) : 0;
    const bar = statusOnly
      ? ""
      : "`" + "█".repeat(filled) + "░".repeat(8 - filled) + "`";
    fields.push({
      name: headings[key] + " · " + count,
      value: fieldValue(bar, names),
      inline: true,
    });
  }
  return {
    title: "Raid composition",
    color: 0xa73142,
    description:
      "**" +
      confirmed +
      " going** · " +
      (buckets.get("tentative")?.count ?? 0) +
      " maybe · " +
      (buckets.get("absent")?.count ?? 0) +
      " unavailable",
    fields,
    footer: { text: "Bars show each role’s share of confirmed signups." },
  };
}
