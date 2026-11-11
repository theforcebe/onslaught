import type { Character, RaidEvent, WowClass } from "./model";

// Forever has Classic talent trees, including Combat and a single Feral tree.
export const CLASS_SPECS: Record<WowClass, readonly string[]> = {
  warrior: ["Arms", "Fury", "Protection"],
  paladin: ["Holy", "Protection", "Retribution"],
  hunter: ["Beast Mastery", "Marksmanship", "Survival"],
  rogue: ["Assassination", "Combat", "Subtlety"],
  priest: ["Discipline", "Holy", "Shadow"],
  shaman: ["Elemental", "Enhancement", "Restoration"],
  mage: ["Arcane", "Fire", "Frost"],
  warlock: ["Affliction", "Demonology", "Destruction"],
  druid: ["Balance", "Feral", "Restoration"],
};
export type RaidProfile = {
  role: Character["role"];
  spec: string;
  buffs: string[];
};
export type RaidBuff = {
  id: string;
  name: string;
  benefit: string;
  cls: WowClass;
  note: string;
  kind: "buff" | "utility";
};
// A declaration of availability, never inferred from gear, talents or class alone.
// Sources and scope changes: docs/RAID_PLANNING.md (reviewed 2026-11-11).
export const RAID_BUFFS: RaidBuff[] = [
  {
    id: "fortitude",
    name: "Power Word: Fortitude",
    benefit: "Stamina",
    cls: "priest",
    note: "Confirm you have learned the spell and can provide it.",
    kind: "buff",
  },
  {
    id: "spirit",
    name: "Divine Spirit",
    benefit: "Spirit",
    cls: "priest",
    note: "Baseline for all Priests in Forever; learned at level 30.",
    kind: "buff",
  },
  {
    id: "intellect",
    name: "Arcane Intellect",
    benefit: "Intellect",
    cls: "mage",
    note: "Confirm you have learned the spell and can provide it.",
    kind: "buff",
  },
  {
    id: "mark",
    name: "Mark of the Wild",
    benefit: "Stats & resistance",
    cls: "druid",
    note: "Confirm you have learned the spell and can provide it.",
    kind: "buff",
  },
  {
    id: "kings",
    name: "Blessing of Kings",
    benefit: "Stats",
    cls: "paladin",
    note: "Baseline in Forever. Coordinate blessings by recipient; availability does not mean all blessings can be active together.",
    kind: "buff",
  },
  {
    id: "might",
    name: "Blessing of Might",
    benefit: "Attack power",
    cls: "paladin",
    note: "Coordinate blessings by recipient with the other Paladins.",
    kind: "buff",
  },
  {
    id: "wisdom",
    name: "Blessing of Wisdom",
    benefit: "Mana regeneration",
    cls: "paladin",
    note: "Coordinate blessings by recipient with the other Paladins.",
    kind: "buff",
  },
  {
    id: "battle-shout",
    name: "Battle Shout",
    benefit: "Attack power",
    cls: "warrior",
    note: "Raid-wide in Forever. Requires maintaining the shout.",
    kind: "buff",
  },
  {
    id: "trueshot",
    name: "Trueshot Aura",
    benefit: "Attack power aura",
    cls: "hunter",
    note: "Requires the Trueshot Aura talent. Raid-wide in Forever.",
    kind: "buff",
  },
  {
    id: "moonkin",
    name: "Moonkin Aura",
    benefit: "Spell critical strike",
    cls: "druid",
    note: "Requires Moonkin Form and being in that form. Raid-wide in Forever.",
    kind: "buff",
  },
  {
    id: "pack",
    name: "Leader of the Pack",
    benefit: "Melee & ranged critical strike",
    cls: "druid",
    note: "Requires the talent and the appropriate Feral form. Raid-wide in Forever.",
    kind: "buff",
  },
  {
    id: "strength",
    name: "Strength of Earth Totem",
    benefit: "Strength",
    cls: "shaman",
    note: "Raid-wide in Forever; depends on the active totem and range.",
    kind: "buff",
  },
  {
    id: "grace",
    name: "Grace of Air Totem",
    benefit: "Agility",
    cls: "shaman",
    note: "Raid-wide in Forever; can coexist with Windfury or Flametongue benefits.",
    kind: "buff",
  },
  {
    id: "windfury",
    name: "Windfury Totem",
    benefit: "Weapon enhancement",
    cls: "shaman",
    note: "Raid-wide. Windfury Totem and Flametongue Totem benefits are mutually exclusive.",
    kind: "buff",
  },
  {
    id: "flametongue",
    name: "Flametongue Totem",
    benefit: "Weapon enhancement",
    cls: "shaman",
    note: "Raid-wide. Flametongue Totem and Windfury Totem benefits are mutually exclusive.",
    kind: "buff",
  },
  {
    id: "healthstone",
    name: "Healthstones",
    benefit: "Recovery utility",
    cls: "warlock",
    note: "Confirm you can supply stones for this raid.",
    kind: "utility",
  },
  {
    id: "soulstone",
    name: "Soulstone",
    benefit: "Resurrection utility",
    cls: "warlock",
    note: "Confirm you have learned the spell. Coordinate the target and cooldown in raid.",
    kind: "utility",
  },
  {
    id: "expose",
    name: "Expose Armor",
    benefit: "Armor debuff",
    cls: "rogue",
    note: "Coordinate with Warriors applying Sunder Armor; this is availability, not a stacking calculation.",
    kind: "utility",
  },
  {
    id: "sunder",
    name: "Sunder Armor",
    benefit: "Armor debuff",
    cls: "warrior",
    note: "Coordinate with Rogues applying Expose Armor; this is availability, not a stacking calculation.",
    kind: "utility",
  },
];
export function normalizeSpec(cls: WowClass, spec = "") {
  const key = spec.toLowerCase().replaceAll(/[_ -]/g, "");
  if (cls === "druid" && ["guardian", "feralcombat"].includes(key))
    return "Feral";
  if (cls === "shaman" && key === "elementalcombat") return "Elemental";
  return (
    CLASS_SPECS[cls].find((s) => s.toLowerCase().replaceAll(" ", "") === key) ||
    ""
  );
}
export function profileFor(
  c: Pick<Character, "class" | "role" | "spec" | "buffs">,
): RaidProfile {
  return {
    role: c.role,
    spec: normalizeSpec(c.class, c.spec),
    buffs: c.buffs || [],
  };
}
export function validateProfile(
  cls: WowClass,
  profile: RaidProfile,
  level: number,
) {
  if (!CLASS_SPECS[cls].includes(profile.spec))
    return "Choose a specialization for your class.";
  if (profile.role === "unassigned")
    return "Choose Tank, Healer, Melee or Ranged before saving.";
  if (
    new Set(profile.buffs).size !== profile.buffs.length ||
    profile.buffs.some(
      (id) => !RAID_BUFFS.some((b) => b.id === id && b.cls === cls),
    )
  )
    return "Choose only abilities available to your class.";
  if (profile.buffs.includes("spirit") && level < 30)
    return "Divine Spirit requires level 30.";
  return "";
}
export function confirmedRaiders(characters: Character[], event: RaidEvent) {
  return characters.filter(
    (c) => c.teamId === event.teamId && event.signups[c.id] === "going",
  );
}
export function providersFor(buffId: string, characters: Character[]) {
  const buff = RAID_BUFFS.find((b) => b.id === buffId);
  return characters.filter(
    (c) =>
      c.class === buff?.cls &&
      c.buffs?.includes(buffId) &&
      (buffId !== "spirit" || c.level >= 30),
  );
}
