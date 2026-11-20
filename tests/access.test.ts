import { describe, it, expect } from "vitest";
import {
  project,
  authorizeAction,
  updateMember,
  accessFor,
  SECTIONS,
  DocumentSchema,
  hasSection,
  canActForCharacter,
  ASSIGNABLE_SECTIONS,
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
  it("includes authorized team names for independent section grants before a team has raiders or events", () => {
    const doc = privateFixture();
    const team = {
      ...doc.state.teams[0],
      id: "fresh",
      name: "Saturday raiders",
      description: "Private team plan",
    };
    doc.state.teams.push(team);
    Object.assign(doc.members[0], {
      role: "officer",
      sections: ["community"],
      teamIds: [team.id],
    });
    const view = project(doc, member);
    expect(view.access.teamNames).toEqual({ fresh: "Saturday raiders" });
    expect(view.state.teams).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(team.description);
    expect(project(doc).access.teamNames).toBeUndefined();
    doc.members[0].allTeams = true;
    expect(Object.keys(project(doc, member).access.teamNames!)).toHaveLength(
      doc.state.teams.length,
    );
  });
  it.each(["pending", "suspended"] as const)(
    "removes roster ownership and private alternate-build details when membership is %s",
    (status) => {
      const doc = privateFixture();
      const char = doc.state.characters[0];
      char.alternateBuilds = [
        { spec: "Survival", role: "melee", buffs: ["private-buff"] },
      ];
      const night = doc.state.events[0];
      night.signupBuilds = { [char.id]: { spec: "Survival", role: "melee" } };
      expect(project(doc, member).state.characters[0].ownerBattleNet).toBe(
        member.id,
      );
      doc.members[0].status = status;
      const view = project(doc, member);
      expect(view.state.characters[0].ownerBattleNet).toBeUndefined();
      expect(
        view.state.characters[0].alternateBuilds?.[0].buffs,
      ).toBeUndefined();
      expect(view.state.events[0].signupBuilds).toEqual({});
      expect(view.state.events[0].signups).toEqual({});
      expect(view.upcomingAttendance).toBeUndefined();
    },
  );
  it("offers personal gear, loot and pledge edits only for owned characters on authorized teams", () => {
    const d = privateFixture(),
      a = accessFor(d, member);
    const own = { ...d.state.characters[0], ownerBattleNet: member.id };
    expect(canActForCharacter(a, own, member)).toBe(true);
    expect(canActForCharacter(a, { ...own, teamId: undefined }, member)).toBe(
      true,
    );
    expect(canActForCharacter(a, { ...own, teamId: "second" }, member)).toBe(
      false,
    );
    expect(
      canActForCharacter(a, { ...own, ownerBattleNet: "someone-else" }, member),
    ).toBe(false);
    expect(canActForCharacter({ ...a, status: "pending" }, own, member)).toBe(
      false,
    );
    expect(canActForCharacter(accessFor(d, owner), own, owner)).toBe(true);
  });
  it.each(["officer", "raider", "guild_member"] as const)(
    "keeps Activity admin-only even when a %s has a legacy activity grant and every team",
    (role) => {
      const doc = privateFixture();
      doc.members[0] = {
        ...doc.members[0],
        role,
        allTeams: true,
        sections: [...SECTIONS],
      };
      const view = project(doc, member);
      expect(view.access.sections).not.toContain("activity");
      expect(view.state.audit).toEqual([]);
      expect(
        hasSection({ ...view.access, sections: [...SECTIONS] }, "activity"),
      ).toBe(false);
      expect(project(doc, owner).state.audit).toEqual(doc.state.audit);
      expect(ASSIGNABLE_SECTIONS).not.toContain("activity");
      const next = updateMember(doc, owner, {
        id: "clean-legacy-grants",
        expectedRevision: 0,
        member: doc.members[0],
      });
      expect(next.members[0].sections).not.toContain("activity");
    },
  );
  it("migrates the original member role to Raider without broadening its grants", () => {
    const before = privateFixture();
    const legacy = {
      ...before,
      members: [{ ...before.members[0], role: "member" }],
    };
    const migrated = DocumentSchema.parse(legacy);
    expect(migrated.members[0]).toEqual({
      ...before.members[0],
      role: "raider",
    });
    expect(JSON.stringify(project(migrated, member))).not.toContain(
      "PRIVATE-SECOND",
    );
  });
  it.each(["officer", "raider", "guild_member"] as const)(
    "%s only receives explicitly assigned permissions",
    (role) => {
      const d = privateFixture();
      d.members[0].role = role;
      d.members[0].sections = [];
      d.members[0].allTeams = true;
      expect(accessFor(d, member).role).toBe(role);
      expect(accessFor(d, member).admin).toBe(false);
      expect(JSON.stringify(project(d, member))).not.toContain("PRIVATE-");
      d.members[0].sections = ["gear"];
      d.members[0].allTeams = false;
      const view = project(d, member);
      expect(view.state.characters[0].notes).toBe("PRIVATE-FIRST-NOTE");
      expect(view.state.characters[1].notes).toBe("");
      expect(view.state.loot).toEqual([]);
      expect(view.members).toBeUndefined();
      expect(() =>
        updateMember(d, member, {
          id: "promote",
          expectedRevision: 0,
          member: { ...d.members[0], role: "admin" },
        }),
      ).toThrow("Only an admin");
    },
  );
  it("keeps permissions independent for two people with the same rank", () => {
    const d = privateFixture();
    d.members[0].role = "officer";
    d.members[0].sections = ["gear"];
    d.members.push({
      ...d.members[0],
      id: "other-member",
      label: "Other",
      sections: ["loot"],
      teamIds: ["second"],
    });
    const first = project(d, member);
    const second = project(d, { ...member, id: "other-member" });
    expect(first.state.characters[0].notes).toBe("PRIVATE-FIRST-NOTE");
    expect(first.state.loot).toEqual([]);
    expect(second.state.characters[0].notes).toBe("");
    expect(second.state.loot.map((loot) => loot.id)).toEqual(["second-loot"]);
  });
  it("removes admin privileges immediately when an admin assigns a lower rank", () => {
    const d = privateFixture();
    d.members[0].role = "admin";
    expect(project(d, member).members).toBeDefined();
    const next = updateMember(d, owner, {
      id: "demote",
      expectedRevision: 0,
      member: { ...d.members[0], role: "officer", sections: ["gear"] },
    });
    expect(accessFor(next, member).role).toBe("officer");
    expect(project(next, member).members).toBeUndefined();
    expect(JSON.stringify(project(next, member))).not.toContain(
      "PRIVATE-SECOND",
    );
    expect(project(next, member).state.loot).toEqual([]);
  });
  it("does not let any non-admin rank edit structure even with all sections", () => {
    for (const rank of ["officer", "raider", "guild_member"] as const) {
      const d = privateFixture();
      d.members[0].role = rank;
      const action = {
        type: "team.save" as const,
        team: { ...d.state.teams[0], size: 40 },
      };
      expect(() =>
        applyChange(
          d.state,
          { version: 1, id: "attempt", expectedRevision: 0, action },
          authorizeAction(d, member, action),
        ),
      ).toThrow("Only a guild admin");
    }
  });
  it("suspension removes even a configured admin rank, while recovery ownership remains separate", () => {
    const d = privateFixture();
    d.members[0].role = "admin";
    d.members[0].status = "suspended";
    expect(accessFor(d, member).admin).toBe(false);
    expect(JSON.stringify(project(d, member))).not.toContain("PRIVATE-");
    expect(accessFor(d, owner).admin).toBe(true);
  });
  it("publishes only roster basics and schedule details", () => {
    const d = privateFixture(),
      v = project(d),
      text = JSON.stringify(v);
    expect(text).not.toContain("PRIVATE-");
    expect(text).not.toContain("raw");
    expect(text).not.toContain("ownerBattleNet");
    expect(text).not.toContain("snapshot");
    expect(v.members).toBeUndefined();
    expect(v.identity).toBeUndefined();
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
            (e) =>
              !e.notes &&
              Object.keys(e.signups).every((id) =>
                d.state.characters.some(
                  (c) => c.id === id && c.ownerBattleNet === member.id,
                ),
              ),
          ),
        ).toBe(true);
      if (section !== "loot") expect(v.state.loot).toEqual([]);
      if (section !== "consumables") expect(v.state.supplies).toEqual([]);
      if (section !== "progress") expect(v.state.bosses).toEqual([]);
      // Activity remains admin-only regardless of section grants.
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
        characterId: "second-char",
        status: "going",
      }),
    ).toThrow("own character");
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
