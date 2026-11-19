import { ROLES, label, type Character, type RaidEvent } from "../src/lib/model";
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
  const compact = "**" + name + "** · " + label(c.class);
  const details = [compact];
  if (spec && role !== "unassigned") {
    details.push(spec, signupBuildKind(c, { spec, role }));
  }
  if (showRole && role !== "unassigned") details.push(role);
  return { compact, full: details.join(" · ") };
}

type SignupLine = ReturnType<typeof namedSignup>;
type Group = {
  heading: string;
  count: number;
  bar: string;
  names: SignupLine[];
};
type ChartField = { name: string; value: string; inline: true };

function renderFields(
  groups: Group[],
  detail: keyof SignupLine,
  maxPerGroup: number,
) {
  const fields: ChartField[] = [];
  for (const group of groups) {
    let name = group.heading + " · " + group.count;
    let value = group.bar;
    const shown = group.names.slice(0, maxPerGroup);
    const lines = shown.map((entry) => entry[detail]);
    const omitted = group.names.length - shown.length;
    if (omitted) lines.push("+" + omitted + " more");
    for (const line of lines) {
      if (value && value.length + 1 + line.length > 1024) {
        fields.push({ name, value, inline: true });
        name = group.heading + " (continued)";
        value = "";
      }
      value += (value ? "\n" : "") + line;
    }
    fields.push({ name, value, inline: true });
  }
  return fields;
}

function fitFields(groups: Group[], availableLength: number) {
  function fits(fields: ChartField[]) {
    return (
      fields.length <= 25 &&
      fields.reduce(
        (sum, field) => sum + field.name.length + field.value.length,
        0,
      ) <= availableLength
    );
  }
  for (const detail of ["full", "compact"] as const) {
    const fields = renderFields(groups, detail, Infinity);
    if (fits(fields)) return fields;
  }
  // Share the remaining space across roles when even the name/class list is too long.
  let low = 0;
  let high = Math.max(...groups.map((group) => group.names.length));
  while (low < high) {
    const cap = Math.ceil((low + high) / 2);
    if (fits(renderFields(groups, "compact", cap))) low = cap;
    else high = cap - 1;
  }
  return renderFields(groups, "compact", low);
}

export function raidSignupEmbed(
  event: RaidEvent,
  characters: readonly Character[],
  visibleCharacterIds?: ReadonlySet<string>,
) {
  const people = new Map(characters.map((c) => [c.id, c]));
  const buckets = new Map<Bucket, { count: number; names: SignupLine[] }>();
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
  const groups: Group[] = [];
  for (const key of [...ROLES, "tentative", "absent"] as const) {
    const item = buckets.get(key);
    const count = item?.count ?? 0;
    const names =
      item?.names.sort((a, b) =>
        a.full < b.full ? -1 : a.full > b.full ? 1 : 0,
      ) ?? [];
    const statusOnly = key === "tentative" || key === "absent";
    if ((key === "unassigned" && !count) || (statusOnly && !names.length))
      continue;
    const filled = confirmed ? Math.round((count / confirmed) * 8) : 0;
    const bar = statusOnly
      ? ""
      : "`" + "█".repeat(filled) + "░".repeat(8 - filled) + "`";
    groups.push({ heading: headings[key], count, bar, names });
  }
  const title = "Raid composition";
  const footer = { text: "Bars show each role’s share of confirmed signups." };
  const description =
    "**" +
    confirmed +
    " going** · " +
    (buckets.get("tentative")?.count ?? 0) +
    " maybe · " +
    (buckets.get("absent")?.count ?? 0) +
    " unavailable";
  return {
    title,
    color: 0xa73142,
    description,
    fields: fitFields(
      groups,
      6000 - title.length - description.length - footer.text.length,
    ),
    footer,
  };
}
