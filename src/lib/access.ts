import { z } from "zod";
import { StateSchema } from "./model";
import type { RaidState, Identity, RaidAction } from "./model";
import { ChangeError } from "./reducer";
import {
  CommunityActionSchema,
  communityScope,
  emptyCommunity,
} from "./community";

export const SECTIONS = [
  "planner",
  "gear",
  "loot",
  "consumables",
  "attendance",
  "progress",
  "activity",
  "community",
] as const;
export type Section = (typeof SECTIONS)[number];
// Activity is reserved for admins. Keep its schema key for older saved documents.
export const ASSIGNABLE_SECTIONS = SECTIONS.filter(
  (section) => section !== "activity",
);
export const SECTION_NAMES: Record<Section, string> = {
  planner: "Raid planner",
  gear: "Gear & character notes",
  loot: "Loot council",
  consumables: "Consumables",
  attendance: "Attendance & raid notes",
  progress: "Progress",
  activity: "Activity history",
  community: "Guild board & discussions",
};
const key = z
  .string()
  .regex(/^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_-]{1,100}$/);
export const RANKS = ["admin", "officer", "raider", "guild_member"] as const;
export type Rank = (typeof RANKS)[number];
export const RANK_NAMES: Record<Rank, string> = {
  admin: "Admin",
  officer: "Officer",
  raider: "Raider",
  guild_member: "Guild Member",
};
// The original "member" role was displayed as Raider. Preserve its exact grants.
export const RankSchema = z
  .enum([...RANKS, "member"])
  .transform((rank): Rank => (rank === "member" ? "raider" : rank));
export const MemberSchema = z
  .object({
    id: key,
    label: z.string().min(1).max(100),
    status: z.enum(["pending", "active", "suspended"]),
    role: RankSchema,
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
  role: RankSchema.optional(),
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
  role: "admin",
  sections: [...SECTIONS],
  allTeams: true,
  teamIds: [],
};
export const ViewSchema = z
  .object({
    state: StateSchema,
    access: AccessSchema,
    members: z.array(MemberSchema).optional(),
    people: z
      .array(
        z.object({
          id: key,
          label: z.string().max(100),
          allTeams: z.boolean(),
          teamIds: z.array(key),
        }),
      )
      .optional(),
    identity: z
      .object({
        provider: z.literal("battlenet"),
        id: key,
        label: z.string().min(1).max(100),
        admin: z.boolean(),
        accountId: z.string().regex(/^\d+$/).optional(),
      })
      .strict()
      .optional(),
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
    return {
      ...PUBLIC_ACCESS,
      status: m?.status || "unregistered",
      role: m?.role,
    };
  return m.role === "admin"
    ? { ...ADMIN_ACCESS }
    : {
        status: "active",
        admin: false,
        role: m.role,
        sections: m.sections.filter((section) => section !== "activity"),
        allTeams: m.allTeams,
        teamIds: m.teamIds,
      };
}
export function hasSection(access: Access, section: Section) {
  return (
    access.status === "active" &&
    (access.admin ||
      (section !== "activity" && access.sections.includes(section)))
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
      buffs:
        canSeeCharacter(a, c, identity) ||
        (allowed("planner", c.teamId) &&
          allowed("attendance", c.teamId) &&
          visibleCharacter(c.id))
          ? c.buffs
          : undefined,
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
      lineup:
        allowed("planner", e.teamId) && allowed("attendance", e.teamId)
          ? Object.fromEntries(
              Object.entries(e.lineup || {}).filter(([id]) =>
                visibleCharacter(id),
              ),
            )
          : undefined,
      signups: allowed("attendance", e.teamId)
        ? Object.fromEntries(
            Object.entries(e.signups).filter(
              ([id]) =>
                visibleCharacter(id) ||
                s.characters.some(
                  (c) => c.id === id && c.ownerBattleNet === identity?.id,
                ),
            ),
          )
        : Object.fromEntries(
            Object.entries(e.signups).filter(
              ([id]) =>
                a.status === "active" &&
                s.characters.some(
                  (c) => c.id === id && c.ownerBattleNet === identity?.id,
                ),
            ),
          ),
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
    audit: a.admin ? s.audit : [],
    processedRequests: [],
    community: (() => {
      const c = s.community || emptyCommunity();
      const announcements = c.announcements.filter((m) =>
        allowed("community", m.teamId),
      );
      const requests = c.requests.filter((r) =>
        canSeeRequest(a, r, identity?.id),
      );
      return {
        announcements,
        requests,
        polls: c.polls.filter((p) => allowed("attendance", p.teamId)),
        replies: c.replies.filter((r) =>
          r.kind === "request"
            ? requests.some((x) => x.id === r.recordId)
            : announcements.some((x) => x.id === r.recordId),
        ),
      };
    })(),
  };
  return ViewSchema.parse({
    state,
    access: a,
    ...(a.admin ? { members: doc.members } : {}),
    people:
      a.admin || (a.role === "officer" && hasSection(a, "consumables"))
        ? doc.members
            .filter((m) => {
              const target = accessFor(doc, {
                provider: "battlenet",
                id: m.id,
                label: m.label,
              });
              return target.status === "active";
            })
            .map((m) => {
              const target = accessFor(doc, {
                provider: "battlenet",
                id: m.id,
                label: m.label,
              });
              return {
                id: m.id,
                label: m.label,
                allTeams: target.allTeams,
                teamIds: target.teamIds.filter((id) => hasTeam(a, id)),
              };
            })
        : [],
    ...(identity?.provider === "battlenet"
      ? {
          identity: {
            provider: "battlenet",
            id: identity.id,
            label: identity.label,
            admin: a.admin,
            accountId: identity.accountId,
          },
        }
      : {}),
  });
}

export function actionScope(s: RaidState, action: RaidAction) {
  const communication = CommunityActionSchema.safeParse(action);
  if (communication.success) return communityScope(s, communication.data);
  let section: Section | undefined, teamId: string | undefined;
  const characterId = "characterId" in action ? action.characterId : undefined;
  if (action.type.startsWith("character.")) section = "gear";
  if (action.type.startsWith("team.")) section = "planner";
  if (action.type.startsWith("event.")) {
    section = "attendance";
    teamId =
      action.type === "event.save"
        ? action.event.teamId
        : "eventId" in action
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
  const participant = {
    ...identity,
    admin: false,
    officer: a.role === "officer",
  };
  if (action.type === "event.signup") {
    if (
      !doc.state.characters.some(
        (c) => c.id === action.characterId && c.ownerBattleNet === identity.id,
      )
    )
      throw new ChangeError(
        "You can only set availability for your own character.",
        403,
      );
    return participant;
  }
  if (
    action.type === "material.create" &&
    !action.request.recipientId &&
    !action.request.teamId
  )
    return participant;
  if (
    [
      "material.progress",
      "material.claim",
      "material.release",
      "material.cancel",
    ].includes(action.type) ||
    (action.type === "community.reply" && action.kind === "request")
  ) {
    const id =
      "requestId" in action
        ? action.requestId
        : "recordId" in action
          ? action.recordId
          : undefined;
    const request = doc.state.community?.requests.find((r) => r.id === id);
    if (request && canSeeRequest(a, request, identity.id)) return participant;
  }
  if (
    [
      "poll.create",
      "poll.close",
      "announcement.create",
      "material.create",
      "material.cancel",
    ].includes(action.type) &&
    a.role !== "officer"
  )
    throw new ChangeError(
      "Only an Admin or Officer with access can do this.",
      403,
    );
  const scope = actionScope(doc.state, action);
  if (
    !scope ||
    (["event.assign", "event.fill"].includes(action.type) &&
      !hasSection(a, "planner")) ||
    !hasSection(a, scope.section) ||
    !scope.teamIds.every((t) => hasTeam(a, t))
  )
    throw new ChangeError(
      "You do not have access to this section or raid team.",
      403,
    );
  // The reducer still enforces admin-only structure and ownership on every personal edit.
  return { ...identity, admin: false, officer: a.role === "officer" };
}

export function materialRecipient(doc: GuildDocument, action: RaidAction) {
  if (action.type !== "material.create") return undefined;
  if (!action.request.recipientId) return undefined;
  const m = doc.members.find((m) => m.id === action.request.recipientId);
  const target = m
    ? accessFor(doc, { provider: "battlenet", id: m.id, label: m.label })
    : PUBLIC_ACCESS;
  if (!m || target.status !== "active")
    throw new ChangeError(
      "Choose an approved guild member. Linking Discord does not approve guild membership.",
    );
  return m.label;
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
    m.id === req.member.id
      ? {
          ...req.member,
          label: m.label,
          sections: req.member.sections.filter(
            (section) => section !== "activity",
          ),
        }
      : m,
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

export function canSeeRequest(
  access: Access,
  r: {
    recipientId?: string;
    teamId?: string;
    openToGuild?: boolean;
    createdBy?: string;
  },
  memberId?: string,
) {
  return (
    access.status === "active" &&
    (access.admin ||
      (!!memberId &&
        (r.recipientId === memberId ||
          (!r.teamId && r.createdBy === memberId))) ||
      ((r.openToGuild || hasSection(access, "consumables")) &&
        hasTeam(access, r.teamId)))
  );
}
