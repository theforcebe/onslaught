import { z } from "zod";
import { StateSchema } from "./model";
import type { RaidState, Identity, RaidAction } from "./model";
import { ChangeError } from "./reducer";

export const SECTIONS = [
  "planner",
  "gear",
  "loot",
  "consumables",
  "attendance",
  "progress",
  "activity",
] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_NAMES: Record<Section, string> = {
  planner: "Raid planner",
  gear: "Gear & character notes",
  loot: "Loot council",
  consumables: "Consumables",
  attendance: "Attendance & raid notes",
  progress: "Progress",
  activity: "Activity history",
};
const key = z
  .string()
  .regex(/^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_-]{1,100}$/);
export const MemberSchema = z
  .object({
    id: key,
    label: z.string().min(1).max(100),
    status: z.enum(["pending", "active", "suspended"]),
    role: z.enum(["member", "admin"]),
    sections: z.array(z.enum(SECTIONS)).max(SECTIONS.length),
    allTeams: z.boolean(),
    teamIds: z.array(key).max(25),
  })
  .strict();
export type Member = z.infer<typeof MemberSchema>;
export const DocumentSchema = z
  .object({
    version: z.literal(1),
    state: StateSchema,
    members: z.array(MemberSchema).max(500),
  })
  .strict()
  .refine(
    (d) => new Set(d.members.map((m) => m.id)).size === d.members.length,
    "Duplicate membership",
  );
export type GuildDocument = z.infer<typeof DocumentSchema>;
export const AccessSchema = z.object({
  status: z.enum(["visitor", "unregistered", "pending", "active", "suspended"]),
  admin: z.boolean(),
  sections: z.array(z.enum(SECTIONS)),
  allTeams: z.boolean(),
  teamIds: z.array(key),
});
export type Access = z.infer<typeof AccessSchema>;
export const PUBLIC_ACCESS: Access = {
  status: "visitor",
  admin: false,
  sections: [],
  allTeams: false,
  teamIds: [],
};
export const ADMIN_ACCESS: Access = {
  status: "active",
  admin: true,
  sections: [...SECTIONS],
  allTeams: true,
  teamIds: [],
};
export const ViewSchema = z
  .object({
    state: StateSchema,
    access: AccessSchema,
    members: z.array(MemberSchema).optional(),
  })
  .strict();
export type GuildView = z.infer<typeof ViewSchema>;
export const MemberRequestSchema = z
  .object({
    id: key,
    expectedRevision: z.number().int().nonnegative(),
    member: MemberSchema,
  })
  .strict();

export function accessFor(doc: GuildDocument, identity?: Identity): Access {
  if (!identity) return { ...PUBLIC_ACCESS };
  if (identity.admin) return { ...ADMIN_ACCESS };
  const m = doc.members.find((x) => x.id === identity.id);
  if (!m || m.status !== "active")
    return { ...PUBLIC_ACCESS, status: m?.status || "unregistered" };
  return m.role === "admin"
    ? { ...ADMIN_ACCESS }
    : {
        status: "active",
        admin: false,
        sections: m.sections,
        allTeams: m.allTeams,
        teamIds: m.teamIds,
      };
}
export function hasSection(access: Access, section: Section) {
  return (
    access.status === "active" &&
    (access.admin || access.sections.includes(section))
  );
}
export function hasTeam(access: Access, teamId?: string) {
  return (
    access.status === "active" &&
    (!teamId || access.allTeams || access.teamIds.includes(teamId))
  );
}
export function canSeeCharacter(
  access: Access,
  c: RaidState["characters"][number],
  identity?: Identity,
) {
  return (
    hasSection(access, "gear") &&
    (c.teamId
      ? hasTeam(access, c.teamId)
      : access.allTeams || c.ownerBattleNet === identity?.id)
  );
}
// Build an allowlisted response. Never serialize the private document to a non-admin.
export function project(doc: GuildDocument, identity?: Identity): GuildView {
  const a = accessFor(doc, identity),
    s = doc.state;
  const teamName = (id?: string) => s.teams.find((t) => t.id === id)?.name;
  const allowed = (section: Section, teamId?: string) =>
    hasSection(a, section) && hasTeam(a, teamId);
  const visibleCharacter = (id: string) => {
    const c = s.characters.find((x) => x.id === id);
    return (
      !!c &&
      (c.teamId
        ? hasTeam(a, c.teamId)
        : a.allTeams || c.ownerBattleNet === identity?.id)
    );
  };
  const state: RaidState = {
    schemaVersion: 1,
    revision: s.revision,
    guild: {
      name: s.guild.name,
      realm: s.guild.realm,
      region: s.guild.region,
      timeZone: s.guild.timeZone,
      adminsGithub: [],
      membersGithub: [],
    },
    characters: s.characters.map((c) => ({
      id: c.id,
      name: c.name,
      class: c.class,
      level: c.level,
      role: c.role,
      spec: c.spec,
      teamId: c.teamId,
      publicTeamName: teamName(c.teamId),
      group: allowed("planner", c.teamId) ? c.group : undefined,
      notes: canSeeCharacter(a, c, identity) ? c.notes : "",
      snapshot: canSeeCharacter(a, c, identity) ? c.snapshot : undefined,
      ownerBattleNet:
        a.admin || c.ownerBattleNet === identity?.id
          ? c.ownerBattleNet
          : undefined,
    })),
    teams: s.teams.filter(
      (t) => a.admin || (hasTeam(a, t.id) && hasSection(a, "planner")),
    ),
    events: s.events.map((e) => ({
      id: e.id,
      title: e.title,
      instance: e.instance,
      teamId: e.teamId,
      publicTeamName: teamName(e.teamId),
      start: e.start,
      end: e.end,
      timeZone: e.timeZone,
      notes: allowed("attendance", e.teamId) ? e.notes : "",
      signups: allowed("attendance", e.teamId)
        ? Object.fromEntries(
            Object.entries(e.signups).filter(([id]) => visibleCharacter(id)),
          )
        : {},
    })),
    loot: s.loot
      .filter((l) => allowed("loot", l.teamId))
      .map((l) => ({
        ...l,
        priority: l.priority.filter(visibleCharacter),
        requests: Object.fromEntries(
          Object.entries(l.requests).filter(([id]) => visibleCharacter(id)),
        ),
      })),
    supplies: s.supplies
      .filter((x) =>
        allowed(
          "consumables",
          s.events.find((e) => e.id === x.eventId)?.teamId,
        ),
      )
      .map((x) => ({
        ...x,
        pledges: Object.fromEntries(
          Object.entries(x.pledges).filter(([id]) => visibleCharacter(id)),
        ),
      })),
    bosses: s.bosses.filter((b) => allowed("progress", b.teamId)),
    audit: s.audit.filter(
      (entry) =>
        a.admin ||
        (hasSection(a, "activity") &&
          !!entry.scope &&
          hasSection(a, entry.scope.section as Section) &&
          entry.scope.teamIds.every((t) => hasTeam(a, t)) &&
          entry.scope.characterIds.every(visibleCharacter)),
    ),
    processedRequests: [],
  };
  return ViewSchema.parse({
    state,
    access: a,
    ...(a.admin ? { members: doc.members } : {}),
  });
}

export function actionScope(s: RaidState, action: RaidAction) {
  let section: Section | undefined, teamId: string | undefined;
  const characterId = "characterId" in action ? action.characterId : undefined;
  if (action.type.startsWith("character.")) section = "gear";
  if (action.type.startsWith("team.")) section = "planner";
  if (action.type.startsWith("event.")) {
    section = "attendance";
    teamId =
      action.type === "event.save"
        ? action.event.teamId
        : action.type === "event.signup"
          ? s.events.find((e) => e.id === action.eventId)?.teamId
          : undefined;
  }
  if (action.type.startsWith("loot.")) {
    section = "loot";
    teamId =
      action.type === "loot.save"
        ? action.loot.teamId
        : "lootId" in action
          ? s.loot.find((l) => l.id === action.lootId)?.teamId
          : undefined;
  }
  if (action.type.startsWith("supply.")) {
    section = "consumables";
    const supply =
      action.type === "supply.save"
        ? action.supply
        : action.type === "supply.pledge"
          ? s.supplies.find((x) => x.id === action.supplyId)
          : undefined;
    teamId = s.events.find((e) => e.id === supply?.eventId)?.teamId;
  }
  if (action.type === "boss.save") {
    section = "progress";
    teamId = action.boss.teamId;
  }
  if (action.type === "team.save") teamId = action.team.id;
  if (action.type === "team.assign") teamId = action.teamId;
  const cTeam = s.characters.find((c) => c.id === characterId)?.teamId;
  return section
    ? {
        section,
        teamIds: [...new Set([teamId, cTeam].filter((t): t is string => !!t))],
        characterIds: characterId ? [characterId] : [],
      }
    : undefined;
}
export function authorizeAction(
  doc: GuildDocument,
  identity: Identity,
  action: RaidAction,
) {
  const a = accessFor(doc, identity);
  if (a.status !== "active")
    throw new ChangeError(
      "An admin must approve your membership before you can make changes.",
      403,
    );
  if (
    action.type === "character.member" &&
    !doc.members.some((m) => m.id === action.memberId && m.status === "active")
  )
    throw new ChangeError("Choose an active member.");
  if (a.admin) return { ...identity, admin: true };
  const scope = actionScope(doc.state, action);
  if (
    !scope ||
    !hasSection(a, scope.section) ||
    !scope.teamIds.every((t) => hasTeam(a, t))
  )
    throw new ChangeError(
      "You do not have access to this section or raid team.",
      403,
    );
  // The reducer still enforces admin-only structure and ownership on every personal edit.
  return { ...identity, admin: false };
}

export function updateMember(
  doc: GuildDocument,
  identity: Identity,
  input: unknown,
): GuildDocument {
  if (!accessFor(doc, identity).admin)
    throw new ChangeError("Only an admin can manage member access.", 403);
  const req = MemberRequestSchema.parse(input);
  if (doc.state.processedRequests.includes(req.id)) return doc;
  if (req.expectedRevision !== doc.state.revision)
    throw new ChangeError("Access changed. Refresh before saving.", 409);
  if (!doc.members.some((m) => m.id === req.member.id))
    throw new ChangeError(
      "This member must sign in and request access first.",
      404,
    );
  if (
    req.member.id === identity.id &&
    (req.member.status !== "active" || req.member.role !== "admin")
  )
    throw new ChangeError(
      "Ask another admin to change your own administrator access.",
      400,
    );
  if (
    req.member.teamIds.some((id) => !doc.state.teams.some((t) => t.id === id))
  )
    throw new ChangeError("Choose existing raid teams.");
  const next = structuredClone(doc);
  // Preserve the verified BattleTag; administrators edit permissions, never the identity.
  next.members = next.members.map((m) =>
    m.id === req.member.id ? { ...req.member, label: m.label } : m,
  );
  next.state.revision++;
  next.state.processedRequests.push(req.id);
  next.state.audit.unshift({
    id: req.id,
    at: new Date().toISOString(),
    actor: "Guild admin",
    action: "access.update",
    summary: "Updated member access",
  });
  return DocumentSchema.parse(next);
}
