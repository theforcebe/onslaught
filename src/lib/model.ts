import { z } from "zod";
export const CLASSES = [
  "warrior",
  "paladin",
  "hunter",
  "rogue",
  "priest",
  "shaman",
  "mage",
  "warlock",
  "druid",
] as const;
export type WowClass = (typeof CLASSES)[number];
export const CLASS_COLORS: Record<WowClass, string> = {
  warrior: "#c69b6d",
  paladin: "#f48cba",
  hunter: "#aad372",
  rogue: "#fff468",
  priest: "#f0f0f0",
  shaman: "#499cff",
  mage: "#78d1e7",
  warlock: "#b69cf5",
  druid: "#ff9b51",
};
export const ROLES = [
  "tank",
  "healer",
  "melee",
  "ranged",
  "unassigned",
] as const;
export const SLOTS = [
  "head",
  "neck",
  "shoulder",
  "back",
  "chest",
  "shirt",
  "tabard",
  "wrist",
  "hands",
  "waist",
  "legs",
  "feet",
  "finger1",
  "finger2",
  "trinket1",
  "trinket2",
  "main_hand",
  "off_hand",
  "ranged",
  "ammo",
] as const;
const text = z.string().trim().max(300);
const id = z
  .string()
  .regex(/^(?!__proto__$|constructor$|prototype$)[a-zA-Z0-9_-]{1,100}$/);
const github = z.string().regex(/^[a-zA-Z0-9-]{1,39}$/);
export const GearSchema = z
  .object({
    slot: z.string(),
    id: z.number().int().positive(),
    name: text,
    level: z.number().int().nonnegative().optional(),
    modifiers: z.record(z.string(), z.string().max(500)),
  })
  .strict();
export type Gear = z.infer<typeof GearSchema>;
export const SnapshotSchema = z
  .object({
    name: text.min(1),
    class: z.enum(CLASSES),
    level: z.number().int().min(1).max(100),
    race: text,
    region: text,
    server: text,
    spec: text,
    role: text,
    professions: text,
    talents: z.string().max(4000),
    legacyTalents: z.string().max(4000),
    gear: z.array(GearSchema).max(25),
    bagGear: z.array(GearSchema).max(400),
    bags: z.array(GearSchema).max(10),
    pet: z.record(z.string(), z.string().max(2000)),
    stats: z.record(z.string(), z.string().max(10000)),
    metadata: z.object({
      addon: text,
      build: text,
      exportedAt: text,
      checksum: text,
    }),
    warnings: z.array(text).max(30),
    raw: z.string().max(100000),
    importedAt: z.string(),
  })
  .strict();
export type Snapshot = z.infer<typeof SnapshotSchema>;
export const CharacterSchema = z
  .object({
    id,
    name: text.min(1),
    class: z.enum(CLASSES),
    level: z.number().int().min(1).max(100),
    role: z.enum(ROLES),
    spec: text,
    ownerGithub: github.optional(),
    ownerBattleNet: id.optional(),
    teamId: id.optional(),
    group: z.number().int().min(1).max(8).optional(),
    notes: z.string().max(2000),
    snapshot: SnapshotSchema.optional(),
  })
  .strict();
export type Character = z.infer<typeof CharacterSchema>;
export const TeamSchema = z
  .object({
    id,
    name: text.min(1),
    size: z.number().int().min(5).max(40),
    tanks: z.number().int().min(0).max(10),
    healers: z.number().int().min(0).max(20),
    description: text,
  })
  .strict();
export type Team = z.infer<typeof TeamSchema>;
export const EventSchema = z
  .object({
    id,
    title: text.min(1),
    instance: text,
    teamId: id,
    start: z.string().datetime(),
    end: z.string().datetime(),
    timeZone: text,
    notes: z.string().max(2000),
    signups: z.record(z.string(), z.enum(["going", "tentative", "absent"])),
  })
  .strict();
export type RaidEvent = z.infer<typeof EventSchema>;
export const LootSchema = z
  .object({
    id,
    itemId: z.number().int().positive(),
    name: text.min(1),
    slot: z.enum(SLOTS),
    boss: text,
    source: z.string().max(1000),
    eligible: z.array(z.enum(CLASSES)).max(9),
    priority: z.array(id).max(100),
    requests: z.record(
      z.string(),
      z.object({
        tier: z.enum(["bis", "major", "minor", "offspec"]),
        note: text,
      }),
    ),
    awardedTo: id.optional(),
    awardReason: text.optional(),
    awardedAt: z.string().optional(),
  })
  .strict();
export type Loot = z.infer<typeof LootSchema>;
export const SupplySchema = z
  .object({
    id,
    name: text.min(1),
    itemId: z.number().int().positive().optional(),
    eventId: id.optional(),
    needed: z.number().int().min(1).max(100000),
    notes: text,
    pledges: z.record(z.string(), z.number().int().min(0).max(100000)),
  })
  .strict();
export type Supply = z.infer<typeof SupplySchema>;
export const BossSchema = z
  .object({
    id,
    name: text.min(1),
    instance: text,
    status: z.enum(["not-started", "progressing", "defeated"]),
    pulls: z.number().int().min(0).max(100000),
    bestPercent: z.number().min(0).max(100),
    notes: z.string().max(2000),
  })
  .strict();
export type Boss = z.infer<typeof BossSchema>;
export const StateSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    guild: z
      .object({
        name: text,
        realm: text,
        region: text,
        timeZone: text,
        adminsGithub: z.array(github).min(1),
        membersGithub: z.array(github).max(500).default([]),
      })
      .strict(),
    characters: z.array(CharacterSchema).max(500),
    teams: z.array(TeamSchema).max(25),
    events: z.array(EventSchema).max(1000),
    loot: z.array(LootSchema).max(5000),
    supplies: z.array(SupplySchema).max(1000),
    bosses: z.array(BossSchema).max(1000),
    audit: z.array(
      z.object({
        id,
        at: z.string(),
        actor: text,
        action: text,
        summary: text,
      }),
    ),
    processedRequests: z.array(id),
  })
  .strict();
export type RaidState = z.infer<typeof StateSchema>;
export type Identity = {
  provider: "github" | "battlenet";
  id: string;
  label: string;
  admin?: boolean;
};
export const ActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("character.import"),
      characterId: id,
      raw: z.string().min(1).max(100000),
    })
    .strict(),
  z
    .object({
      type: z.literal("character.update"),
      characterId: id,
      role: z.enum(ROLES),
      spec: text,
      notes: z.string().max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal("character.owner"),
      characterId: id,
      github: github,
    })
    .strict(),
  z.object({ type: z.literal("team.save"), team: TeamSchema }).strict(),
  z.object({ type: z.literal("team.unassign"), characterId: id }).strict(),
  z
    .object({
      type: z.literal("team.assign"),
      characterId: id,
      teamId: id,
      group: z.number().int().min(1).max(8),
    })
    .strict(),
  z.object({ type: z.literal("event.save"), event: EventSchema }).strict(),
  z
    .object({
      type: z.literal("event.signup"),
      eventId: id,
      characterId: id,
      status: z.enum(["going", "tentative", "absent"]),
    })
    .strict(),
  z.object({ type: z.literal("supply.save"), supply: SupplySchema }).strict(),
  z
    .object({
      type: z.literal("supply.pledge"),
      supplyId: id,
      characterId: id,
      quantity: z.number().int().min(0).max(100000),
    })
    .strict(),
  z.object({ type: z.literal("loot.save"), loot: LootSchema }).strict(),
  z
    .object({
      type: z.literal("loot.request"),
      lootId: id,
      characterId: id,
      tier: z.enum(["bis", "major", "minor", "offspec"]),
      note: text,
    })
    .strict(),
  z
    .object({
      type: z.literal("loot.award"),
      lootId: id,
      characterId: id,
      reason: text.min(3),
    })
    .strict(),
  z.object({ type: z.literal("boss.save"), boss: BossSchema }).strict(),
  z
    .object({
      type: z.literal("guild.update"),
      name: text.min(1),
      timeZone: text,
      adminsGithub: z.array(github).min(1).max(20),
      membersGithub: z.array(github).max(500).default([]),
    })
    .strict(),
]);
export type RaidAction = z.infer<typeof ActionSchema>;
export const RequestSchema = z
  .object({
    version: z.literal(1),
    id,
    expectedRevision: z.number().int().nonnegative(),
    action: ActionSchema,
  })
  .strict();
export type ChangeRequest = z.infer<typeof RequestSchema>;
export const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const makeId = () => crypto.randomUUID();
