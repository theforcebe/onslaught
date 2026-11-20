import { describe, expect, it } from "vitest";
import { privateFixture } from "./access-fixture";
import { applyChange } from "../src/lib/reducer";
import { actionScope, authorizeAction, project } from "../src/lib/access";
import { StateSchema } from "../src/lib/model";
import type { Identity, RaidAction, RaidState } from "../src/lib/model";
import {
  CLASS_SPECS,
  confirmedRaiders,
  characterBuilds,
  raidNightCharacter,
  normalizeSpec,
  providersFor,
} from "../src/lib/raid";
import { EXAMPLE_EXPORT } from "../src/lib/example";
const admin: Identity = {
  provider: "battlenet",
  id: "admin",
  label: "Admin",
  admin: true,
};
const member: Identity = {
  provider: "battlenet",
  id: "member-id",
  label: "Member",
};
function fixture() {
  const d = privateFixture(),
    s = d.state;
  s.characters = Array.from({ length: 12 }, (_, i) => ({
    ...s.characters[0],
    id: `raider-${i}`,
    name: `Raider ${i}`,
    group: Math.floor(i / 5) + 1,
    buffs: ["trueshot"],
    role: "ranged" as const,
    spec: "Marksmanship",
  }));
  s.teams[0].size = 10;
  s.events = s.events.slice(0, 1);
  s.events[0].signups = Object.fromEntries(
    s.characters.map((c) => [c.id, "going" as const]),
  );
  s.events[0].lineup = {};
  return d;
}
function change(s: RaidState, action: RaidAction, actor = admin) {
  return applyChange(
    s,
    {
      version: 1,
      id: crypto.randomUUID(),
      expectedRevision: s.revision,
      action,
    },
    actor,
  );
}
const assign = (
  id: string,
  group: number | null,
  swapWith?: string,
): RaidAction => ({
  type: "event.assign",
  eventId: "demo-raid",
  characterId: id,
  group,
  ...(swapWith ? { swapWith } : {}),
});
describe("alternate raid builds", () => {
  it("preserves registered builds through old gear imports, single-build profile updates and explicit clears", () => {
    const d = fixture(),
      c = d.state.characters[0];
    const alternate = { spec: "Survival", role: "melee" as const, buffs: [] };
    c.name = c.snapshot!.name;
    c.alternateBuilds = [alternate];
    const gear = {
      type: "character.import" as const,
      characterId: c.id,
      raw: EXAMPLE_EXPORT,
    };
    const refresh = change(d.state, gear, member);
    expect(refresh.characters[0].alternateBuilds).toEqual([alternate]);
    const swap = change(
      refresh,
      {
        type: "character.update",
        characterId: c.id,
        spec: alternate.spec,
        role: alternate.role,
        notes: "",
      },
      member,
    );
    expect(swap.characters[0]).toMatchObject({
      ...alternate,
      alternateBuilds: [{ spec: c.spec, role: c.role, buffs: c.buffs }],
    });
    const restored = change(
      swap,
      { ...gear, profile: { spec: c.spec, role: c.role, buffs: c.buffs! } },
      member,
    );
    expect(restored.characters[0].alternateBuilds).toEqual([alternate]);
    const cleared = change(
      restored,
      {
        ...gear,
        profile: {
          spec: c.spec,
          role: c.role,
          buffs: c.buffs!,
          alternateBuilds: [],
        },
      },
      member,
    );
    expect(cleared.characters[0].alternateBuilds).toEqual([]);
  });
  it("closes site signups at raid end and permits a retry of the already-saved response", () => {
    const d = fixture(),
      c = d.state.characters[0],
      e = d.state.events[0];
    const request = {
      version: 1 as const,
      expectedRevision: d.state.revision,
      id: "before-end",
      action: {
        type: "event.signup" as const,
        eventId: e.id,
        characterId: c.id,
        status: "tentative" as const,
      },
    };
    const saved = applyChange(
      d.state,
      request,
      member,
      new Date(Date.parse(e.end) - 1).toISOString(),
    );
    expect(applyChange(saved, request, member, e.end)).toEqual(saved);
    expect(() =>
      applyChange(
        saved,
        { ...request, id: "after-end", expectedRevision: saved.revision },
        member,
        e.end,
      ),
    ).toThrow("Signups have closed");
  });
  function druid() {
    const d = fixture();
    const c = d.state.characters[0];
    Object.assign(c, {
      class: "druid",
      role: "healer",
      spec: "Restoration",
      buffs: ["mark"],
      ownerBattleNet: member.id,
    });
    d.state = change(
      d.state,
      {
        type: "character.update",
        characterId: c.id,
        role: "healer",
        spec: "Restoration",
        alternateBuilds: [
          { spec: "Feral", role: "tank", buffs: ["pack"] },
          { spec: "Feral", role: "melee" },
        ],
        notes: "",
      },
      member,
    );
    return d;
  }
  it("chooses a saved build per night and counts the selected build's declared abilities", () => {
    const d = druid();
    const c = d.state.characters[0];
    const builds = characterBuilds(c);
    expect(builds.map((b) => b.role)).toEqual(["healer", "tank", "melee"]);
    d.state.events.push({ ...d.state.events[0], id: "tomorrow" });
    const next = change(
      d.state,
      {
        type: "event.signup",
        characterId: c.id,
        eventId: "demo-raid",
        status: "going",
        build: builds[1],
      },
      member,
    );
    expect(
      raidNightCharacter(next.characters[0], next.events[0]),
    ).toMatchObject({ spec: "Feral", role: "tank", buffs: ["pack"] });
    expect(
      raidNightCharacter(next.characters[0], next.events[1]),
    ).toMatchObject({ spec: "Restoration", role: "healer", buffs: ["mark"] });
    expect(next.characters[0].role).toBe("healer");
    const legacy = change(
      next,
      {
        type: "event.signup",
        characterId: c.id,
        eventId: "demo-raid",
        status: "tentative",
      },
      member,
    );
    expect(legacy.events[0].signupBuilds?.[c.id]).toEqual(builds[1]);
    const edited = change(legacy, {
      type: "event.save",
      event: { ...legacy.events[0], signupBuilds: { [c.id]: builds[2] } },
    });
    expect(edited.events[0].signupBuilds?.[c.id]).toEqual(builds[1]);
    const oldSchedule = {
      ...edited.events[0],
      title: "New start time",
      signups: {},
    };
    delete oldSchedule.signupBuilds;
    const rescheduled = change(edited, {
      type: "event.save",
      event: oldSchedule,
    });
    expect(rescheduled.events[0]).toMatchObject({
      signups: { [c.id]: "tentative" },
      signupBuilds: { [c.id]: builds[1] },
    });
    d.state = edited;
    d.members[0].sections = [];
    expect(project(d, member).state.events[0].signupBuilds?.[c.id]).toEqual(
      builds[1],
    );
    expect(project(d).state.events[0].signupBuilds?.[c.id]).toBeUndefined();
    expect(
      project(d).state.characters[0].alternateBuilds?.[0].buffs,
    ).toBeUndefined();
  });
  it("rejects cross-class, duplicate, undeclared and unowned choices", () => {
    const d = druid(),
      c = d.state.characters[0];
    const edit = {
      type: "character.update" as const,
      characterId: c.id,
      role: c.role,
      spec: c.spec,
      notes: "",
    };
    expect(() =>
      change(d.state, {
        ...edit,
        alternateBuilds: [{ spec: "Holy", role: "healer" }],
      }),
    ).toThrow("your class");
    expect(() =>
      change(d.state, {
        ...edit,
        alternateBuilds: [{ spec: "Restoration", role: "healer" }],
      }),
    ).toThrow("different");
    const signup = {
      type: "event.signup" as const,
      characterId: c.id,
      eventId: "demo-raid",
      status: "going" as const,
    };
    expect(() =>
      change(
        d.state,
        { ...signup, build: { spec: "Balance", role: "ranged" } },
        member,
      ),
    ).toThrow("saved specialization");
    expect(() => change(d.state, signup, { ...member, id: "other" })).toThrow(
      "own character",
    );
  });
});
describe("confirmed raid lineups", () => {
  it("saves per-event positions without changing standing groups or another event", () => {
    const s = fixture().state;
    s.events.push({
      ...s.events[0],
      id: "other-raid",
      lineup: { "raider-0": 1 },
    });
    const next = change(s, assign("raider-0", 2));
    expect(next.events[0].lineup).toEqual({ "raider-0": 2 });
    expect(next.events[1].lineup).toEqual({ "raider-0": 1 });
    expect(next.characters[0].group).toBe(1);
    expect(s.events[0].lineup).toEqual({});
  });
  it.each(["tentative", "absent"] as const)(
    "rejects %s and cross-team characters",
    (status) => {
      const s = fixture().state;
      s.events[0].signups["raider-0"] = status;
      expect(() => change(s, assign("raider-0", 1))).toThrow(
        "Only team members marked Going",
      );
      s.events[0].signups["raider-0"] = "going";
      s.characters[0].teamId = "second";
      expect(() => change(s, assign("raider-0", 1))).toThrow(
        "Only team members marked Going",
      );
    },
  );
  it("fills only up to capacity and preserves prior placements", () => {
    const s = fixture().state;
    s.events[0].lineup = { "raider-0": 2 };
    const next = change(s, { type: "event.fill", eventId: "demo-raid" });
    expect(Object.keys(next.events[0].lineup!)).toHaveLength(10);
    expect(next.events[0].lineup!["raider-0"]).toBe(2);
    expect(
      Object.values(next.events[0].lineup!).filter((g) => g === 1),
    ).toHaveLength(5);
    expect(() => change(next, assign("raider-10", 1))).toThrow("full");
    expect(() => change(next, assign("raider-10", 3))).toThrow("full");
  });
  it("swaps into a full group and supports replacing a raider from the bench", () => {
    let s = change(fixture().state, {
      type: "event.fill",
      eventId: "demo-raid",
    });
    s = change(s, assign("raider-0", 2, "raider-5"));
    expect(s.events[0].lineup!["raider-5"]).toBe(1);
    s = change(s, assign("raider-10", 2, "raider-0"));
    expect(s.events[0].lineup!["raider-0"]).toBeUndefined();
    expect(s.events[0].lineup!["raider-10"]).toBe(2);
    expect(Object.keys(s.events[0].lineup!)).toHaveLength(10);
  });
  it("rejects forged swap destinations without mutating the saved lineup", () => {
    const s = fixture().state;
    s.events[0].lineup = { "raider-0": 1 };
    expect(() => change(s, assign("raider-1", 2, "raider-0"))).toThrow(
      "destination group",
    );
    expect(s.events[0].lineup).toEqual({ "raider-0": 1 });
  });
  it("cleans up declines, team moves, and removals", () => {
    let s = fixture().state;
    s.events[0].lineup = { "raider-0": 1, "raider-1": 1, "raider-2": 1 };
    s = change(
      s,
      {
        type: "event.signup",
        eventId: "demo-raid",
        characterId: "raider-0",
        status: "absent",
      },
      member,
    );
    s = change(s, {
      type: "team.assign",
      characterId: "raider-1",
      teamId: "second",
      group: 1,
    });
    s = change(s, { type: "team.unassign", characterId: "raider-2" });
    expect(s.events[0].lineup).toEqual({});
  });
  it("preserves lineups on schedule edits and clears them on a team change", () => {
    let s = fixture().state;
    s.events[0].lineup = { "raider-0": 1 };
    s = change(s, {
      type: "event.save",
      event: { ...s.events[0], title: "Updated", lineup: { "raider-9": 8 } },
    });
    expect(s.events[0].lineup).toEqual({ "raider-0": 1 });
    s = change(s, {
      type: "event.save",
      event: { ...s.events[0], teamId: "second" },
    });
    expect(s.events[0].lineup).toEqual({});
  });
  it("honors partial groups and rejects shrinking around occupied event positions", () => {
    const s = fixture().state;
    s.characters = s.characters.slice(0, 6);
    s.teams[0].size = 6;
    s.events[0].lineup = { "raider-0": 2 };
    expect(() => change(s, assign("raider-1", 2))).toThrow("full");
    s.characters = s.characters.slice(0, 1);
    expect(() =>
      change(s, {
        type: "team.save",
        team: { ...s.teams[0], size: 5, healers: 2 },
      }),
    ).toThrow("Move members");
  });
  it("preserves standing roster positions when reducing the last group's capacity", () => {
    const s = fixture().state;
    s.characters = s.characters.slice(0, 4).map((c) => ({ ...c, group: 2 }));
    expect(() =>
      change(s, {
        type: "team.save",
        team: { ...s.teams[0], size: 6, tanks: 1, healers: 1 },
      }),
    ).toThrow("Move members");
    expect(
      change(s, {
        type: "team.save",
        team: { ...s.teams[0], size: 9, tanks: 1, healers: 1 },
      }).teams[0].size,
    ).toBe(9);
  });
  it("counts older roster members without an explicit group in the first group", () => {
    const s = fixture().state;
    s.characters = s.characters.slice(0, 6);
    s.characters.forEach((c) => delete c.group);
    delete s.characters[5].teamId;
    expect(() =>
      change(s, {
        type: "team.assign",
        characterId: s.characters[5].id,
        teamId: s.teams[0].id,
        group: 1,
      }),
    ).toThrow("full");
    expect(
      change(s, {
        type: "team.assign",
        characterId: s.characters[5].id,
        teamId: s.teams[0].id,
        group: 2,
      }).characters[5].group,
    ).toBe(2);
  });
  it.each([5, 6, 10, 15, 20, 25, 40])(
    "fills a %i-player raid with complete and partial groups",
    (size) => {
      const s = fixture().state;
      s.teams[0].size = size;
      s.characters = Array.from({ length: size + 1 }, (_, i) => ({
        ...s.characters[0],
        id: "char-" + i,
        group: 1,
      }));
      s.events[0].signups = Object.fromEntries(
        s.characters.map((c) => [c.id, "going" as const]),
      );
      const lineup = change(s, { type: "event.fill", eventId: "demo-raid" })
        .events[0].lineup!;
      expect(Object.keys(lineup)).toHaveLength(size);
      for (let g = 1; g <= Math.ceil(size / 5); g++)
        expect(Object.values(lineup).filter((x) => x === g)).toHaveLength(
          Math.min(5, size - (g - 1) * 5),
        );
    },
  );
  it("enforces admin-only placement even with all relevant viewing grants", () => {
    const d = fixture();
    expect(() =>
      change(
        d.state,
        assign("raider-0", 1),
        authorizeAction(d, member, assign("raider-0", 1)),
      ),
    ).toThrow("Only a guild admin");
    expect(() =>
      change(d.state, { type: "event.fill", eventId: "demo-raid" }, member),
    ).toThrow("Only a guild admin");
  });
});
describe("guided raid profiles", () => {
  it("offers 27 Forever specs including Combat and Feral", () => {
    expect(Object.values(CLASS_SPECS).flat()).toHaveLength(27);
    expect(normalizeSpec("druid", "Guardian")).toBe("Feral");
    expect(normalizeSpec("rogue", "Outlaw")).toBe("");
  });
  it("imports role, fixed spec and declared abilities atomically", () => {
    const s = fixture().state;
    const next = change(s, {
      type: "character.import",
      characterId: "new-hunter",
      raw: EXAMPLE_EXPORT,
      profile: { role: "ranged", spec: "Beast Mastery", buffs: [] },
    });
    expect(next.characters.at(-1)).toMatchObject({
      role: "ranged",
      spec: "Beast Mastery",
      buffs: [],
      ownerBattleNet: "admin",
    });
  });
  it.each([
    { role: "ranged" as const, spec: "Holy", buffs: [] },
    { role: "unassigned" as const, spec: "Beast Mastery", buffs: [] },
    { role: "ranged" as const, spec: "Beast Mastery", buffs: ["fortitude"] },
    {
      role: "ranged" as const,
      spec: "Beast Mastery",
      buffs: ["trueshot", "trueshot"],
    },
  ])("rejects invalid profile metadata without importing", (profile) => {
    const s = fixture().state;
    expect(() =>
      change(s, {
        type: "character.import",
        characterId: "new-hunter",
        raw: EXAMPLE_EXPORT,
        profile,
      }),
    ).toThrow();
    expect(s.characters).toHaveLength(12);
  });
  it("preserves existing raid choices for legacy gear-only imports", () => {
    const s = fixture().state;
    s.characters[0].name = s.characters[0].snapshot!.name;
    const next = change(s, {
      type: "character.import",
      characterId: "raider-0",
      raw: EXAMPLE_EXPORT,
    });
    expect(next.characters[0]).toMatchObject({
      role: "ranged",
      spec: "Marksmanship",
      buffs: ["trueshot"],
    });
  });
  it("never assumes coverage just from a class, spec or unsupported declaration", () => {
    const s = fixture().state;
    delete s.characters[0].buffs;
    s.characters[1].buffs = ["fortitude"];
    expect(providersFor("trueshot", s.characters.slice(0, 2))).toEqual([]);
    expect(providersFor("fortitude", s.characters)).toEqual([]);
    s.events[0].signups["raider-2"] = "tentative";
    expect(
      providersFor("trueshot", confirmedRaiders(s.characters, s.events[0])).map(
        (c) => c.id,
      ),
    ).not.toContain("raider-2");
  });
  it("accepts existing documents with no new fields", () => {
    const s = fixture().state;
    for (const c of s.characters) delete c.buffs;
    for (const e of s.events) delete e.lineup;
    expect(() => StateSchema.parse(s)).not.toThrow();
  });
});
describe("lineup privacy", () => {
  it("requires both planner and attendance plus the event team, without exposing gear", () => {
    const d = fixture();
    d.state.events[0].lineup = { "raider-0": 1 };
    d.members[0].sections = ["planner", "attendance"];
    const view = project(d, member);
    expect(view.state.events[0].lineup).toEqual({ "raider-0": 1 });
    expect(view.state.characters[0].buffs).toEqual(["trueshot"]);
    expect(view.state.characters[0].snapshot).toBeUndefined();
    for (const sections of [
      ["planner"],
      ["attendance"],
      [],
    ] as (typeof d.members)[0]["sections"][]) {
      d.members[0].sections = sections;
      expect(project(d, member).state.events[0].lineup).toBeUndefined();
      expect(project(d, member).state.characters[0].buffs).toBeUndefined();
    }
    d.members[0].sections = ["planner", "attendance"];
    d.members[0].teamIds = ["second"];
    expect(project(d, member).state.events[0].lineup).toBeUndefined();
    expect(project(d).state.characters[0].buffs).toBeUndefined();
    expect(project(d).state.events[0].lineup).toBeUndefined();
  });
  it("keeps lineup audit history admin-only even with legacy activity and planning grants", () => {
    const d = fixture(),
      a = assign("raider-0", 1);
    d.state.audit = [
      {
        id: "audit-new",
        at: new Date().toISOString(),
        actor: "Admin",
        action: a.type,
        summary: "Private lineup change",
        scope: actionScope(d.state, a),
      },
    ];
    d.members[0].sections = ["attendance", "activity"];
    expect(project(d, member).state.audit).toEqual([]);
    d.members[0].sections.push("planner");
    expect(project(d, member).state.audit).toEqual([]);
    expect(project(d, { ...member, admin: true }).state.audit).toHaveLength(1);
  });
});
