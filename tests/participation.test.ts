import { describe, it, expect } from "vitest";
import { privateFixture } from "./access-fixture";
import { authorizeAction, materialRecipient, project } from "../src/lib/access";
import type { GuildDocument } from "../src/lib/access";
import type { Identity, RaidAction } from "../src/lib/model";
import { applyChange } from "../src/lib/reducer";
import { contributionBoard } from "../src/lib/community";
import { activeLineup, providersFor } from "../src/lib/raid";
const member: Identity = {
  provider: "battlenet",
  id: "member-id",
  label: "Raider",
};
function fixture() {
  const d = privateFixture();
  d.members[0].sections = [];
  d.members[0].teamIds = [];
  d.state.community = {
    polls: [],
    announcements: [],
    requests: [],
    replies: [],
  };
  d.members.push({ ...d.members[0], id: "helper", label: "Helper" });
  return d;
}
function edit(d: GuildDocument, action: RaidAction, actor = member) {
  const verified = authorizeAction(d, actor, action);
  return {
    ...d,
    state: applyChange(
      d.state,
      {
        version: 1,
        id: crypto.randomUUID(),
        expectedRevision: d.state.revision,
        action,
      },
      verified,
      undefined,
      { recipientName: materialRecipient(d, action) },
    ),
  };
}
const openRequest: RaidAction = {
  type: "material.create",
  request: {
    id: "lobby",
    item: "Dreamfoil",
    itemId: 13463,
    quantity: 40,
    notes: "For the guild",
  },
};
describe("personal participation without private management grants", () => {
  it.each(["officer", "raider", "guild_member"] as const)(
    "lets %s RSVP for their own character without attendance or team grants",
    (rank) => {
      let d = fixture();
      d.members[0].role = rank;
      const own = d.state.characters[0];
      d = edit(d, {
        type: "event.signup",
        eventId: "second-event",
        characterId: own.id,
        status: "tentative",
      });
      const view = project(d, member);
      expect(
        view.state.events.find((e) => e.id === "second-event")?.signups,
      ).toEqual({ [own.id]: "tentative" });
      expect(view.state.events.every((e) => !e.notes && !e.lineup)).toBe(true);
      expect(view.state.teams).toEqual([]);
      expect(view.state.characters.every((c) => !c.snapshot && !c.notes)).toBe(
        true,
      );
      expect(() =>
        edit(d, {
          type: "event.signup",
          eventId: "second-event",
          characterId: "second-char",
          status: "going",
        }),
      ).toThrow("own character");
    },
  );
  it.each(["pending", "suspended"] as const)(
    "rejects all personal changes for %s members",
    (status) => {
      const d = fixture();
      d.members[0].status = status;
      expect(() => edit(d, openRequest)).toThrow("approve");
      expect(() =>
        edit(d, {
          type: "event.signup",
          eventId: d.state.events[0].id,
          characterId: d.state.characters[0].id,
          status: "going",
        }),
      ).toThrow("approve");
      expect(
        project(d, member).state.events.every(
          (e) => !Object.keys(e.signups).length,
        ),
      ).toBe(true);
    },
  );
  it("supports volunteer creation, exclusive claiming, release, and progress only by its owner", () => {
    let d = edit(fixture(), openRequest);
    const helper = { ...member, id: "helper", label: "Helper" };
    expect(project(d, helper).state.community!.requests).toHaveLength(1);
    expect(project(d).state.community!.requests).toEqual([]);
    d = edit(d, { type: "material.claim", requestId: "lobby" }, helper);
    expect(() =>
      edit(d, { type: "material.claim", requestId: "lobby" }),
    ).toThrow("already taken");
    expect(() =>
      edit(d, {
        type: "material.progress",
        requestId: "lobby",
        quantity: 5,
        note: "",
      }),
    ).toThrow("recipient");
    expect(() =>
      edit(d, { type: "material.release", requestId: "lobby" }),
    ).toThrow("owner");
    d = edit(d, { type: "material.release", requestId: "lobby" }, helper);
    expect(d.state.community!.requests[0].recipientId).toBeUndefined();
    d = edit(d, { type: "material.claim", requestId: "lobby" }, helper);
    d = edit(
      d,
      {
        type: "material.progress",
        requestId: "lobby",
        quantity: 20,
        note: "First half",
      },
      helper,
    );
    expect(() =>
      edit(d, { type: "material.release", requestId: "lobby" }, helper),
    ).toThrow("unstarted");
    expect(() =>
      edit(d, { type: "material.cancel", requestId: "lobby" }, helper),
    ).toThrow("requesting");
    expect(contributionBoard(d.state.community!.requests)[0]).toMatchObject({
      id: "helper",
      helped: 1,
      completed: 0,
      units: 20,
    });
    d = edit(
      d,
      {
        type: "material.progress",
        requestId: "lobby",
        quantity: 40,
        note: "Done",
      },
      helper,
    );
    d = edit(
      d,
      {
        type: "material.progress",
        requestId: "lobby",
        quantity: 40,
        note: "Repeated",
      },
      helper,
    );
    expect(contributionBoard(d.state.community!.requests)[0]).toMatchObject({
      completed: 1,
      helped: 1,
      units: 40,
    });
    d = edit(
      d,
      {
        type: "material.progress",
        requestId: "lobby",
        quantity: 10,
        note: "Correction",
      },
      helper,
    );
    expect(contributionBoard(d.state.community!.requests)[0].completed).toBe(0);
    d = edit(d, { type: "material.cancel", requestId: "lobby" });
    expect(contributionBoard(d.state.community!.requests)).toEqual([]);
  });
  it("rejects a stale claim rather than overwriting the first volunteer", () => {
    const d = edit(fixture(), openRequest),
      revision = d.state.revision;
    const claimed = edit(d, { type: "material.claim", requestId: "lobby" });
    expect(() =>
      applyChange(
        claimed.state,
        {
          version: 1,
          id: crypto.randomUUID(),
          expectedRevision: revision,
          action: { type: "material.claim", requestId: "lobby" },
        },
        { ...member, id: "helper" },
      ),
    ).toThrow();
  });
  it("lists approved recipients without private grants and exposes only their assigned requests", () => {
    let d = fixture();
    d.members[0].role = "officer";
    d.members[0].sections = ["consumables"];
    d.members.push({ ...d.members[1], id: "pending", status: "pending" });
    expect(project(d, member).people?.map((p) => p.id)).toEqual([
      "member-id",
      "helper",
    ]);
    d = edit(d, {
      type: "material.create",
      request: { ...openRequest.request, recipientId: "helper" },
    } as RaidAction);
    const helper = { ...member, id: "helper" };
    expect(project(d, helper).state.community!.requests).toHaveLength(1);
    d.members[0].sections = [];
    d.members[0].role = "guild_member";
    expect(() =>
      edit(d, {
        type: "material.create",
        request: { ...openRequest.request, id: "bad", recipientId: "helper" },
      } as RaidAction),
    ).toThrow("Admin or Officer");
    d = edit(
      d,
      {
        type: "material.progress",
        requestId: "lobby",
        quantity: 40,
        note: "Delivered",
      },
      helper,
    );
    expect(d.state.community!.requests[0].fulfilled).toBe(40);
    d.members[1].status = "suspended";
    expect(project(d, helper).state.community!.requests).toEqual([]);
  });
  it("does not count benched, absent, wrong-team or invalid-group providers as buff coverage", () => {
    const d = privateFixture(),
      e = d.state.events[0],
      c = d.state.characters[0];
    c.class = "mage";
    c.buffs = ["intellect"];
    e.signups[c.id] = "going";
    e.lineup = {};
    expect(activeLineup(d.state.characters, e, 20)).toEqual([]);
    e.lineup = { [c.id]: 5 };
    expect(activeLineup(d.state.characters, e, 20)).toEqual([]);
    e.lineup = { [c.id]: 1 };
    expect(
      providersFor("intellect", activeLineup(d.state.characters, e, 20)),
    ).toHaveLength(1);
    e.signups[c.id] = "tentative";
    expect(activeLineup(d.state.characters, e, 20)).toEqual([]);
    e.signups[c.id] = "going";
    c.teamId = "second";
    expect(activeLineup(d.state.characters, e, 20)).toEqual([]);
  });
});
