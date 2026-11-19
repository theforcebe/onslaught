import {
  ROLES,
  label,
  type Character,
  type RaidEvent,
  type WowClass,
} from "../src/lib/model";

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

export type ClassEmojis = Partial<Record<WowClass, string>>;
function namedSignup(c: Character) {
  const name =
    discordLine(c.name.replace(/#\d{3,}\b/gu, ""), 48) || "Unnamed character";
  return { name: "**" + name + "**", cls: c.class };
}

type SignupLine = ReturnType<typeof namedSignup>;
type Group = {
  heading: string;
  count: number;
  names: SignupLine[];
};
type ChartField = { name: string; value: string; inline: true };

function rosterLines(
  entries: SignupLine[],
  emojis: ClassEmojis,
  groupByClass: boolean,
) {
  if (!groupByClass)
    return entries.map(({ cls, name }) =>
      emojis[cls] ? emojis[cls] + " " + name : name + " · " + label(cls),
    );
  // A custom emoji's full Discord ID counts towards the embed budget. On
  // crowded nights, share an icon across names of the same class and role.
  const byClass = new Map<WowClass, string[]>();
  for (const { cls, name } of entries) {
    const names = byClass.get(cls) ?? [];
    names.push(name);
    byClass.set(cls, names);
  }
  const lines: string[] = [];
  for (const [cls, names] of byClass) {
    const prefix = (emojis[cls] || label(cls)) + " ";
    let line = prefix;
    for (const name of names) {
      if (line.length + 2 + name.length > 1024) {
        lines.push(line);
        line = prefix;
      }
      line += (line === prefix ? "" : ", ") + name;
    }
    lines.push(line);
  }
  return lines;
}

function renderFields(
  groups: Group[],
  emojis: ClassEmojis,
  groupByClass: boolean,
  maxPerGroup: number,
) {
  const fields: ChartField[] = [];
  for (const group of groups) {
    let name = group.heading + " · " + group.count;
    let value = "";
    const shown = group.names.slice(0, maxPerGroup);
    const lines = rosterLines(shown, emojis, groupByClass);
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
    fields.push({
      name,
      value: value || (group.count ? "Count only" : "No signups"),
      inline: true,
    });
  }
  return fields;
}

function fitFields(
  groups: Group[],
  emojis: ClassEmojis,
  availableLength: number,
) {
  function fits(fields: ChartField[]) {
    return (
      fields.length <= 25 &&
      fields.reduce(
        (sum, field) => sum + field.name.length + field.value.length,
        0,
      ) <= availableLength
    );
  }
  for (const groupByClass of [false, true]) {
    const fields = renderFields(groups, emojis, groupByClass, Infinity);
    if (fits(fields)) return fields;
  }
  // Share the remaining space across roles when even the name/class list is too long.
  let low = 0;
  let high = Math.max(...groups.map((group) => group.names.length));
  while (low < high) {
    const cap = Math.ceil((low + high) / 2);
    if (fits(renderFields(groups, emojis, true, cap))) low = cap;
    else high = cap - 1;
  }
  return renderFields(groups, emojis, true, low);
}

export function raidSignupEmbed(
  event: RaidEvent,
  characters: readonly Character[],
  visibleCharacterIds?: ReadonlySet<string>,
  classEmojis: ClassEmojis = {},
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
    if (c && visibleCharacterIds?.has(id)) bucket.names.push(namedSignup(c));
    buckets.set(key, bucket);
  }
  const groups: Group[] = [];
  for (const key of [...ROLES, "tentative", "absent"] as const) {
    const item = buckets.get(key);
    const count = item?.count ?? 0;
    const names =
      item?.names.sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : a.cls.localeCompare(b.cls),
      ) ?? [];
    const statusOnly = key === "tentative" || key === "absent";
    if ((key === "unassigned" && !count) || (statusOnly && !names.length))
      continue;
    groups.push({ heading: headings[key], count, names });
  }
  const title = "Raid composition";
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
      classEmojis,
      6000 - title.length - description.length,
    ),
  };
}
