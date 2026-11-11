import { describe, it, expect } from "vitest";
import {
  project,
  authorizeAction,
  updateMember,
  accessFor,
  SECTIONS,
} from "../src/lib/access";
import { applyChange } from "../src/lib/reducer";
import { privateFixture } from "./access-fixture";
const member = {
  provider: "battlenet" as const,
  id: "member-id",
  label: "Member",
};
const owner = {
  provider: "battlenet" as const,
  id: "owner-id",
  label: "Owner",
  admin: true,
};
describe("section and team privacy", () => {
  it("publishes only roster basics and schedule details", () => {
    const d = privateFixture(),
      v = project(d),
      text = JSON.stringify(v);
    expect(text).not.toContain("PRIVATE-");
    expect(text).not.toContain("raw");
    expect(text).not.toContain("ownerBattleNet");
    expect(text).not.toContain("snapshot");
    expect(v.members).toBeUndefined();
    expect(v.state.characters).toHaveLength(2);
    expect(v.state.events).toHaveLength(2);
    expect(v.state.characters[1].name).toBe("Public second name");
    expect(v.state.events[1].title).toBe("Public second raid");
    expect(
      v.state.events.every(
        (e) => Object.keys(e.signups).length === 0 && !e.notes,
      ),
    ).toBe(true);
  });
  it("filters every private collection and nested contribution by team", () => {
    const v = project(privateFixture(), member),
      text = JSON.stringify(v);
    expect(text).toContain("PRIVATE-FIRST-NOTE");
    expect(text).toContain("PRIVATE-FIRST-LOOT");
    expect(text).not.toContain("PRIVATE-SECOND");
    expect(text).not.toContain("PRIVATE-BATTLETAG");
    expect(v.state.loot[0].requests).toEqual({});
    expect(v.state.loot[0].priority).toEqual([v.state.characters[0].id]);
    expect(v.state.supplies).toEqual([]);
    expect(v.state.bosses).toEqual([]);
  });
  it.each(SECTIONS)(
    "requires an explicit %s section grant even with all-team access",
    (section) => {
      const d = privateFixture();
      d.members[0].sections = [section];
      d.members[0].allTeams = true;
      const v = project(d, member);
      if (section !== "gear")
        expect(v.state.characters.every((c) => !c.snapshot && !c.notes)).toBe(
          true,
        );
      if (section !== "planner") expect(v.state.teams).toEqual([]);
      if (section !== "attendance")
        expect(
          v.state.events.every(
            (e) => !e.notes && !Object.keys(e.signups).length,
          ),
        ).toBe(true);
      if (section !== "loot") expect(v.state.loot).toEqual([]);
      if (section !== "consumables") expect(v.state.supplies).toEqual([]);
      if (section !== "progress") expect(v.state.bosses).toEqual([]);
      // Activity requires access to the source section as well.
      expect(v.state.audit).toEqual([]);
    },
  );
  it("removes private data immediately when the canonical membership is suspended", () => {
    const d = privateFixture();
    expect(project(d, member).state.loot.length).toBe(1);
    d.members[0].status = "suspended";
    expect(JSON.stringify(project(d, member))).not.toContain("PRIVATE-");
    expect(() =>
      authorizeAction(d, member, {
        type: "character.update",
        characterId: d.state.characters[0].id,
        role: "ranged",
        spec: "",
        notes: "",
      }),
    ).toThrow("approve");
  });
  it("rejects hidden team changes and cross-team references before applying them", () => {
    const d = privateFixture();
    expect(() =>
      authorizeAction(d, member, {
        type: "loot.request",
        lootId: "second-loot",
        characterId: d.state.characters[0].id,
        tier: "bis",
        note: "",
      }),
    ).toThrow("access");
    expect(() =>
      authorizeAction(d, member, {
        type: "event.signup",
        eventId: "second-event",
        characterId: d.state.characters[0].id,
        status: "going",
      }),
    ).toThrow("access");
  });
  it("view permissions never authorize structural changes", () => {
    const d = privateFixture(),
      action = {
        type: "team.save" as const,
        team: { ...d.state.teams[0], size: 40 },
      };
    const actor = authorizeAction(d, member, action);
    expect(() =>
      applyChange(
        d.state,
        { version: 1, id: "attempt", expectedRevision: 0, action },
        actor,
      ),
    ).toThrow("Only a guild admin");
  });
  it("checks ownership even when the section and team are allowed", () => {
    const d = privateFixture();
    d.members[0].allTeams = true;
    const action = {
      type: "character.update" as const,
      characterId: "second-char",
      role: "ranged" as const,
      spec: "",
      notes: "",
    };
    expect(() =>
      applyChange(
        d.state,
        { version: 1, id: "attempt", expectedRevision: 0, action },
        authorizeAction(d, member, action),
      ),
    ).toThrow("own character");
  });
  it("allows only admins to change verified member permissions, with conflict protection", () => {
    const d = privateFixture(),
      req = {
        id: "access-change",
        expectedRevision: 0,
        member: {
          ...d.members[0],
          role: "admin" as const,
          label: "Spoofed identity",
        },
      };
    expect(() => updateMember(d, member, req)).toThrow("Only an admin");
    const next = updateMember(d, owner, req);
    expect(accessFor(next, member).admin).toBe(true);
    expect(next.members[0].label).toBe("PRIVATE-BATTLETAG");
    expect(next.state.revision).toBe(1);
    expect(updateMember(next, owner, req).state.revision).toBe(1);
    expect(() =>
      updateMember(next, owner, { ...req, id: "new-attempt" }),
    ).toThrow("Refresh");
  });
  it("rejects forged account fields in a member update and unknown members", () => {
    const d = privateFixture();
    expect(() =>
      updateMember(d, owner, {
        id: "attempt",
        expectedRevision: 0,
        member: { ...d.members[0], subject: "123" },
      }),
    ).toThrow();
    expect(() =>
      updateMember(d, owner, {
        id: "attempt",
        expectedRevision: 0,
        member: { ...d.members[0], id: "not-verified" },
      }),
    ).toThrow("sign in");
  });
  it("preserves full admin visibility and keeps old unscoped history admin-only", () => {
    const d = privateFixture();
    delete d.state.audit[0].scope;
    expect(project(d, member).state.audit).toHaveLength(0);
    expect(project(d, owner).state.audit).toHaveLength(1);
    expect(project(d, owner).members).toHaveLength(1);
  });
});
