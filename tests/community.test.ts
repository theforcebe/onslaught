import { describe, it, expect } from "vitest";
import { privateFixture } from "./access-fixture";
import { applyChange } from "../src/lib/reducer";
import {
  authorizeAction,
  materialRecipient,
  project,
  actionScope,
} from "../src/lib/access";
import type { GuildDocument } from "../src/lib/access";
import type { Identity, RaidAction } from "../src/lib/model";
import { rejectCredentials } from "../src/lib/parser";
const actor: Identity = {
  provider: "battlenet",
  id: "member-id",
  label: "Officer",
};
const owner: Identity = {
  provider: "battlenet",
  id: "owner",
  label: "Owner",
  admin: true,
};
function doc() {
  const d = privateFixture();
  d.state.community = {
    polls: [],
    announcements: [],
    requests: [],
    replies: [],
  };
  d.members[0].role = "officer";
  d.members.push({
    ...d.members[0],
    id: "recipient",
    label: "Recipient",
    role: "raider",
  });
  return d;
}
function change(d: GuildDocument, a: RaidAction, who = actor) {
  const identity = authorizeAction(d, who, a);
  const s = applyChange(
    d.state,
    {
      version: 1,
      id: crypto.randomUUID(),
      expectedRevision: d.state.revision,
      action: a,
    },
    identity,
    undefined,
    { recipientName: materialRecipient(d, a) },
  );
  return { ...d, state: s };
}
const poll: Extract<RaidAction, { type: "poll.create" }> = {
  type: "poll.create",
  poll: {
    id: "poll-test",
    teamId: "vanguard",
    title: "Which nights?",
    timeZone: "America/Los_Angeles",
    options: ["Tuesday 7 PM", "Friday 7 PM"],
    closesAt: new Date(Date.now() + 86400000).toISOString(),
    voting: "site",
  },
};
const request: Extract<RaidAction, { type: "material.create" }> = {
  type: "material.create",
  request: {
    id: "request-test",
    teamId: "vanguard",
    recipientId: "recipient",
    item: "Dreamfoil",
    quantity: 40,
    notes: "Deliver before invites",
  },
};
describe("guild coordination permissions and state", () => {
  it("lets an Officer create only in explicitly granted sections and teams", () => {
    let d = doc();
    d = change(d, poll);
    expect(d.state.community!.polls[0].createdBy).toBe(actor.id);
    d.members[0].sections = [];
    expect(() =>
      change(d, { ...poll, poll: { ...poll.poll, id: "new-poll" } }),
    ).toThrow("access");
  });
  it.each(["raider", "guild_member"] as const)(
    "does not promote %s to an Officer through viewing grants",
    (rank) => {
      const d = doc();
      d.members[0].role = rank;
      expect(() => change(d, poll)).toThrow("Admin or Officer");
      expect(() => change(d, request)).toThrow("Admin or Officer");
    },
  );
  it("keeps team-private records out of other teams and the public API", () => {
    let d = change(doc(), request);
    d = change(d, poll);
    d = change(d, {
      type: "announcement.create",
      announcement: {
        id: "a",
        teamId: "vanguard",
        title: "Private update",
        body: "PRIVATE-COORDINATION",
      },
    });
    expect(project(d).state.community).toEqual({
      polls: [],
      announcements: [],
      requests: [],
      replies: [],
    });
    d.members[0].teamIds = ["second"];
    expect(JSON.stringify(project(d, actor))).not.toContain(
      "PRIVATE-COORDINATION",
    );
    expect(project(d, actor).state.community!.requests).toEqual([]);
  });
  it("records one editable multi-choice response per member and rejects invalid choices", () => {
    let d = change(doc(), poll);
    d = change(d, { type: "poll.vote", pollId: "poll-test", choices: [0, 1] });
    d = change(d, { type: "poll.vote", pollId: "poll-test", choices: [1] });
    expect(d.state.community!.polls[0].votes).toEqual({ "member-id": [1] });
    expect(() =>
      change(d, { type: "poll.vote", pollId: "poll-test", choices: [2] }),
    ).toThrow("valid poll");
    expect(() =>
      change(d, { type: "poll.vote", pollId: "poll-test", choices: [1, 1] }),
    ).toThrow("valid poll");
  });
  it("prevents site voting on native Discord polls and on closed polls", () => {
    let d = change(doc(), {
      ...poll,
      poll: { ...poll.poll, voting: "discord" },
    });
    expect(() =>
      change(d, { type: "poll.vote", pollId: "poll-test", choices: [0] }),
    ).toThrow("Vote in Discord");
    d = change(doc(), poll);
    d = change(d, { type: "poll.close", pollId: "poll-test" });
    expect(() =>
      change(d, { type: "poll.vote", pollId: "poll-test", choices: [0] }),
    ).toThrow("closed");
  });
  it("validates unique options, closing times, and time zones", () => {
    for (const patch of [
      { options: ["Same", "same"] },
      { timeZone: "invalid-zone" },
      { closesAt: new Date(Date.now() - 1000).toISOString() },
    ])
      expect(() =>
        change(doc(), { ...poll, poll: { ...poll.poll, ...patch } }),
      ).toThrow();
  });
  it("allows active recipients without supply grants but refuses pending and suspended members", () => {
    const d = doc();
    d.members[1].sections = [];
    d.members[1].teamIds = [];
    expect(change(d, request).state.community!.requests[0].recipientName).toBe(
      "Recipient",
    );
    for (const status of ["pending", "suspended"] as const) {
      d.members[1].status = status;
      expect(() => change(d, request)).toThrow("approved guild member");
    }
  });
  it("tracks partial and completed fulfillment with actor and timestamp", () => {
    let d = change(doc(), request);
    const recipient = { ...actor, id: "recipient", label: "Recipient" };
    d = change(
      d,
      {
        type: "material.progress",
        requestId: "request-test",
        quantity: 25,
        note: "First delivery",
      },
      recipient,
    );
    d = change(
      d,
      {
        type: "material.progress",
        requestId: "request-test",
        quantity: 40,
        note: "Done",
      },
      recipient,
    );
    const r = d.state.community!.requests[0];
    expect(r.fulfilled).toBe(40);
    expect(r.updates.map((x) => x.quantity)).toEqual([40, 25]);
    expect(r.updates[0].by).toBe("recipient");
    expect(r.updates[0].at).toMatch(/^20/);
  });
  it("rejects fulfillment impersonation, overdelivery and updates after cancellation", () => {
    let d = change(doc(), request);
    expect(() =>
      change(d, {
        type: "material.progress",
        requestId: "request-test",
        quantity: 5,
        note: "",
      }),
    ).toThrow("recipient");
    expect(() =>
      change(
        d,
        {
          type: "material.progress",
          requestId: "request-test",
          quantity: 41,
          note: "",
        },
        owner,
      ),
    ).toThrow("exceeds");
    d = change(d, { type: "material.cancel", requestId: "request-test" });
    expect(() =>
      change(
        d,
        {
          type: "material.progress",
          requestId: "request-test",
          quantity: 40,
          note: "",
        },
        owner,
      ),
    ).toThrow("cancelled");
  });
  it("keeps replies attached to authorized records and scoped audit history", () => {
    let d = change(doc(), request);
    const reply: RaidAction = {
      type: "community.reply",
      id: "reply-test",
      kind: "request",
      recordId: "request-test",
      body: "Gathering tonight",
    };
    expect(actionScope(d.state, reply)).toEqual({
      section: "consumables",
      teamIds: ["vanguard"],
      characterIds: [],
    });
    d.members[0].teamIds = ["second"];
    expect(() => change(d, reply)).toThrow("access");
    d = change(d, reply, owner);
    expect(project(d, actor).state.community!.replies).toEqual([]);
  });
  it("rejects Discord credentials in shared text", () => {
    const token = ["x".repeat(25), "y".repeat(7), "z".repeat(30)].join(".");
    expect(() => rejectCredentials(token)).toThrow("credential");
    expect(() =>
      rejectCredentials(
        "https://discord.com/api/webhooks/" +
          "1".repeat(18) +
          "/" +
          "a".repeat(50),
      ),
    ).toThrow("credential");
  });
});

it("allows guild-wide recipients without leaking their other team grants", () => {
  const d = doc();
  d.members.find((m) => m.id === "recipient")!.teamIds = [
    "vanguard",
    "private-team",
  ];
  const view = project(d, actor);
  expect(view.people?.find((m) => m.id === "recipient")?.teamIds).toEqual([
    "vanguard",
  ]);
  d.members[0].teamIds = [];
  d.members.find((m) => m.id === "recipient")!.teamIds = [];
  expect(project(d, actor).people?.some((m) => m.id === "recipient")).toBe(
    true,
  );
});
