import { z } from "zod";
import type { Identity, RaidState } from "./model";
const id = z
  .string()
  .regex(/^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_-]{1,100}$/);
const text = z.string().trim().min(1).max(1800);
export const PollInput = z
  .object({
    id,
    teamId: id.optional(),
    title: z.string().trim().min(3).max(200),
    timeZone: z.string().max(100),
    options: z.array(z.string().trim().min(1).max(55)).min(2).max(10),
    closesAt: z.string().datetime(),
    voting: z.enum(["site", "discord"]),
  })
  .strict();
export const AnnouncementInput = z
  .object({
    id,
    teamId: id.optional(),
    title: z.string().trim().min(3).max(150),
    body: text,
  })
  .strict();
export const MaterialInput = z
  .object({
    id,
    teamId: id.optional(),
    recipientId: id.optional(),
    item: z.string().trim().min(1).max(150),
    itemId: z.number().int().positive().optional(),
    quantity: z.number().int().min(1).max(100000),
    dueAt: z.string().datetime().optional(),
    notes: z.string().trim().max(1000),
  })
  .strict();
const attribution = {
  createdBy: id,
  createdByName: z.string().max(100),
  createdAt: z.string().datetime(),
};
export const PollSchema = PollInput.extend({
  ...attribution,
  closed: z.boolean(),
  votes: z.record(id, z.array(z.number().int().min(0).max(9)).max(10)),
}).strict();
export const AnnouncementSchema =
  AnnouncementInput.extend(attribution).strict();
export const MaterialSchema = MaterialInput.extend({
  ...attribution,
  recipientName: z.string().max(100),
  openToGuild: z.boolean().optional(),
  fulfilled: z.number().int().min(0).max(100000),
  updatedAt: z.string().datetime(),
  cancelled: z.boolean(),
  updates: z
    .array(
      z.object({
        at: z.string().datetime(),
        by: id,
        byName: z.string().max(100),
        quantity: z.number().int().nonnegative(),
        note: z.string().max(500),
      }),
    )
    .max(500),
}).strict();
export const ReplySchema = z
  .object({
    id,
    kind: z.enum(["announcement", "request"]),
    recordId: id,
    body: z.string().trim().min(1).max(500),
    ...attribution,
  })
  .strict();
export const CommunitySchema = z
  .object({
    polls: z.array(PollSchema).max(200),
    announcements: z.array(AnnouncementSchema).max(500),
    requests: z.array(MaterialSchema).max(1000),
    replies: z.array(ReplySchema).max(5000),
  })
  .strict();
export type Community = z.infer<typeof CommunitySchema>;
export type SchedulePoll = z.infer<typeof PollSchema>;
export type MaterialRequest = z.infer<typeof MaterialSchema>;
export const communityActions = [
  z.object({ type: z.literal("poll.create"), poll: PollInput }).strict(),
  z
    .object({
      type: z.literal("poll.vote"),
      pollId: id,
      choices: z.array(z.number().int().min(0).max(9)).max(10),
    })
    .strict(),
  z.object({ type: z.literal("poll.close"), pollId: id }).strict(),
  z
    .object({
      type: z.literal("announcement.create"),
      announcement: AnnouncementInput,
    })
    .strict(),
  z
    .object({ type: z.literal("material.create"), request: MaterialInput })
    .strict(),
  z
    .object({
      type: z.literal("material.progress"),
      requestId: id,
      quantity: z.number().int().min(0).max(100000),
      note: z.string().max(500),
    })
    .strict(),
  z.object({ type: z.literal("material.cancel"), requestId: id }).strict(),
  z.object({ type: z.literal("material.claim"), requestId: id }).strict(),
  z.object({ type: z.literal("material.release"), requestId: id }).strict(),
  z
    .object({
      type: z.literal("community.reply"),
      id,
      kind: z.enum(["announcement", "request"]),
      recordId: id,
      body: z.string().trim().min(1).max(500),
    })
    .strict(),
] as const;
export const CommunityActionSchema = z.discriminatedUnion(
  "type",
  communityActions,
);
export type CommunityAction = z.infer<typeof CommunityActionSchema>;
export const emptyCommunity = (): Community => ({
  polls: [],
  announcements: [],
  requests: [],
  replies: [],
});
export function communityScope(s: RaidState, a: CommunityAction) {
  const c = s.community || emptyCommunity();
  const record =
    a.type === "poll.create"
      ? a.poll
      : a.type === "announcement.create"
        ? a.announcement
        : a.type === "material.create"
          ? a.request
          : "pollId" in a
            ? c.polls.find((p) => p.id === a.pollId)
            : "requestId" in a
              ? c.requests.find((r) => r.id === a.requestId)
              : a.kind === "request"
                ? c.requests.find((r) => r.id === a.recordId)
                : c.announcements.find((m) => m.id === a.recordId);
  return {
    section: a.type.startsWith("poll.")
      ? ("attendance" as const)
      : a.type.startsWith("material.") ||
          (a.type === "community.reply" && a.kind === "request")
        ? ("consumables" as const)
        : ("community" as const),
    teamIds: record?.teamId ? [record.teamId] : [],
    characterIds: [],
  };
}
// Authorization of section/team and recipient membership happens before this reducer.
export function applyCommunity(
  s: RaidState,
  a: CommunityAction,
  actor: Identity,
  admin: boolean,
  at: string,
  recipientName?: string,
) {
  const c = (s.community ||= emptyCommunity());
  const lead = () => {
    if (!admin && !actor.officer)
      throw new Error("Only an Admin or Officer with access can do this.");
  };
  const unique = (list: { id: string }[], key: string) => {
    if (list.some((x) => x.id === key))
      throw new Error("This record already exists.");
  };
  const attr = {
    createdBy: actor.id,
    createdByName: actor.label,
    createdAt: at,
  };
  if (
    "teamId" in
    (a.type === "poll.create"
      ? a.poll
      : a.type === "announcement.create"
        ? a.announcement
        : a.type === "material.create"
          ? a.request
          : {})
  ) {
    const teamId =
      a.type === "poll.create"
        ? a.poll.teamId
        : a.type === "announcement.create"
          ? a.announcement.teamId
          : a.type === "material.create"
            ? a.request.teamId
            : undefined;
    if (teamId && !s.teams.some((t) => t.id === teamId))
      throw new Error("Choose an existing raid team.");
  }
  switch (a.type) {
    case "poll.create":
      lead();
      unique(c.polls, a.poll.id);
      if (
        new Set(a.poll.options.map((o) => o.toLowerCase())).size !==
        a.poll.options.length
      )
        throw new Error("Poll choices must be different.");
      if (
        Date.parse(a.poll.closesAt) <= Date.parse(at) ||
        Date.parse(a.poll.closesAt) > Date.parse(at) + 32 * 86400000
      )
        throw new Error("Close the poll within the next 32 days.");
      try {
        Intl.DateTimeFormat("en", { timeZone: a.poll.timeZone });
      } catch {
        throw new Error("Choose a valid time zone.");
      }
      c.polls.unshift({ ...a.poll, ...attr, closed: false, votes: {} });
      return `Created scheduling poll: ${a.poll.title}`;
    case "poll.vote": {
      const p = c.polls.find((p) => p.id === a.pollId);
      if (!p) throw new Error("Poll not found.");
      if (p.closed || Date.parse(p.closesAt) <= Date.parse(at))
        throw new Error("This poll has closed.");
      if (p.voting !== "site")
        throw new Error("Vote in Discord for this poll.");
      if (
        new Set(a.choices).size !== a.choices.length ||
        a.choices.some((i) => i >= p.options.length)
      )
        throw new Error("Choose valid poll options.");
      p.votes[actor.id] = a.choices;
      return `Updated a response to ${p.title}`;
    }
    case "poll.close": {
      lead();
      const p = c.polls.find((p) => p.id === a.pollId);
      if (!p) throw new Error("Poll not found.");
      if (p.voting === "discord")
        throw new Error("Discord polls close at their configured time.");
      p.closed = true;
      return `Closed ${p.title}`;
    }
    case "announcement.create":
      lead();
      unique(c.announcements, a.announcement.id);
      c.announcements.unshift({ ...a.announcement, ...attr });
      return `Posted announcement: ${a.announcement.title}`;
    case "material.create":
      if (a.request.recipientId || a.request.teamId) lead();
      unique(c.requests, a.request.id);
      if (a.request.recipientId && !recipientName)
        throw new Error("Choose an active member with access to this request.");
      c.requests.unshift({
        ...a.request,
        ...attr,
        recipientName: recipientName || "Open to volunteers",
        openToGuild: !a.request.recipientId,
        fulfilled: 0,
        updatedAt: at,
        cancelled: false,
        updates: [],
      });
      return `Requested ${a.request.quantity} ${a.request.item}${recipientName ? ` from ${recipientName}` : " from the guild"}`;
    case "material.claim": {
      const r = c.requests.find((r) => r.id === a.requestId);
      if (!r || r.cancelled || r.fulfilled >= r.quantity)
        throw new Error("This request is no longer open.");
      if (r.recipientId)
        throw new Error(
          "Another member has already taken this request. Refresh to see who.",
        );
      r.recipientId = actor.id;
      r.recipientName = actor.label;
      r.updatedAt = at;
      return `Claimed request for ${r.item}`;
    }
    case "material.release": {
      const r = c.requests.find((r) => r.id === a.requestId);
      if (
        !r ||
        !r.openToGuild ||
        r.recipientId !== actor.id ||
        r.fulfilled ||
        r.cancelled
      )
        throw new Error(
          "Only an unstarted volunteer request can be released by its owner.",
        );
      delete r.recipientId;
      r.recipientName = "Open to volunteers";
      r.updatedAt = at;
      return `Reopened request for ${r.item}`;
    }
    case "material.progress": {
      const r = c.requests.find((r) => r.id === a.requestId);
      if (!r) throw new Error("Request not found.");
      if (!admin && r.recipientId !== actor.id)
        throw new Error(
          "Only the recipient or an Admin can update fulfillment.",
        );
      if (r.cancelled) throw new Error("This request was cancelled.");
      if (a.quantity > r.quantity)
        throw new Error("Fulfilled quantity exceeds the requested amount.");
      r.fulfilled = a.quantity;
      r.updatedAt = at;
      r.updates.unshift({
        at,
        by: actor.id,
        byName: actor.label,
        quantity: a.quantity,
        note: a.note,
      });
      return `Updated fulfillment of ${r.item}`;
    }
    case "material.cancel": {
      const r = c.requests.find((r) => r.id === a.requestId);
      if (!r) throw new Error("Request not found.");
      if (!admin && r.createdBy !== actor.id)
        throw new Error(
          "Only the requesting Officer or an Admin can cancel this request.",
        );
      r.cancelled = true;
      r.updatedAt = at;
      return `Cancelled request for ${r.item}`;
    }
    case "community.reply": {
      const record =
        a.kind === "request"
          ? c.requests.find((r) => r.id === a.recordId)
          : c.announcements.find((m) => m.id === a.recordId);
      if (!record) throw new Error("Conversation not found.");
      unique(c.replies, a.id);
      c.replies.push({
        id: a.id,
        kind: a.kind,
        recordId: a.recordId,
        body: a.body,
        ...attr,
      });
      return "Added a guild discussion reply";
    }
  }
}

export function contributionBoard(requests: MaterialRequest[]) {
  const people = new Map<
    string,
    {
      id: string;
      name: string;
      completed: number;
      helped: number;
      units: number;
    }
  >();
  for (const r of requests) {
    if (r.cancelled || !r.recipientId || !r.fulfilled) continue;
    const p = people.get(r.recipientId) || {
      id: r.recipientId,
      name: r.recipientName,
      completed: 0,
      helped: 0,
      units: 0,
    };
    p.helped++;
    p.units += r.fulfilled;
    if (r.fulfilled === r.quantity) p.completed++;
    people.set(p.id, p);
  }
  return [...people.values()].sort(
    (a, b) =>
      b.completed - a.completed ||
      b.helped - a.helped ||
      a.name.localeCompare(b.name),
  );
}
