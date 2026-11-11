import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyChange } from "../src/lib/reducer";
import { StateSchema } from "../src/lib/model";
import type { RaidState, RaidAction, Identity } from "../src/lib/model";
import { EXAMPLE_EXPORT as source } from "../src/lib/example";
import { parseSimc } from "../src/lib/parser";
function base(): RaidState {
  const s = StateSchema.parse(
    JSON.parse(readFileSync("public/data/raid-state.json", "utf8")),
  );
  s.guild.membersGithub = ["raider", "other"];
  s.guild.adminsGithub = ["theforcebe"];
  s.teams = [
    {
      id: "vanguard",
      name: "Vanguard",
      size: 20,
      tanks: 2,
      healers: 4,
      description: "",
    },
  ];
  s.characters = [
    {
      id: "example-raider",
      name: "Example Raider",
      class: "hunter",
      level: 30,
      role: "unassigned",
      spec: "",
      notes: "",
      teamId: "vanguard",
      group: 1,
      ownerGithub: "raider",
      snapshot: parseSimc(source),
    },
  ];
  return s;
}
const admin: Identity = {
    provider: "github",
    id: "theforcebe",
    label: "Admin",
  },
  member: Identity = { provider: "github", id: "raider", label: "Raider" },
  other: Identity = { provider: "github", id: "other", label: "Other" };
const request = (
  s: RaidState,
  action: RaidAction,
  id = crypto.randomUUID(),
) => ({ version: 1 as const, id, expectedRevision: s.revision, action });
const update: RaidAction = {
  type: "character.update",
  characterId: "example-raider",
  role: "ranged",
  spec: "Beast Mastery",
  notes: "Ready",
};
describe("server-authoritative changes", () => {
  it("allows members to edit their own character and appends audit history", () => {
    const s = base(),
      next = applyChange(s, request(s, update), member);
    expect(next.characters[0].role).toBe("ranged");
    expect(s.characters[0].role).toBe("unassigned");
    expect(next.revision).toBe(1);
    expect(next.audit[0].actor).toBe("Raider");
  });
  it("rejects another member editing someone else’s character", () => {
    const s = base();
    expect(() => applyChange(s, request(s, update), other)).toThrow(
      "own character",
    );
  });
  it("does not trust a browser-supplied admin flag for GitHub", () => {
    const s = base();
    expect(() =>
      applyChange(
        s,
        request(s, { type: "team.save", team: { ...s.teams[0], size: 40 } }),
        { ...member, admin: true },
      ),
    ).toThrow("Only a guild admin");
  });
  it("rejects outsiders even when they try importing a new character", () => {
    const s = base();
    expect(() =>
      applyChange(
        s,
        request(s, {
          type: "character.import",
          characterId: "outsider",
          raw: source.replace("Example Raider", "Outsider"),
        }),
        { provider: "github", id: "intruder", label: "Intruder" },
      ),
    ).toThrow("invitation");
  });
  it("lets an invited member create a character owned by their verified identity", () => {
    const s = base();
    const n = applyChange(
      s,
      request(s, {
        type: "character.import",
        characterId: "new",
        raw: source.replaceAll("Example Raider", "Newraider"),
      }),
      member,
    );
    expect(n.characters.at(-1)?.ownerGithub).toBe("raider");
  });
  it("rejects owner and role injection in the request schema", () => {
    const s = base();
    expect(() =>
      applyChange(
        s,
        { ...request(s, update), actor: "theforcebe" } as any,
        other,
      ),
    ).toThrow();
    expect(() =>
      applyChange(
        s,
        request(s, { ...update, ownerGithub: "other" } as any),
        member,
      ),
    ).toThrow();
  });
  it("rejects credentials pasted into notes as well as imports", () => {
    const s = base();
    expect(() =>
      applyChange(
        s,
        request(s, { ...update, notes: "password=private-value" }),
        member,
      ),
    ).toThrow("credential");
  });
  it("requires admins for every structural write", () => {
    const s = base();
    const actions: RaidAction[] = [
      {
        type: "character.owner",
        characterId: "example-raider",
        github: "other",
      },
      {
        type: "team.assign",
        characterId: "example-raider",
        teamId: "vanguard",
        group: 2,
      },
      {
        type: "guild.update",
        name: "Hacked",
        timeZone: "UTC",
        adminsGithub: ["other"],
        membersGithub: [],
      },
      {
        type: "boss.save",
        boss: {
          id: "boss",
          name: "Test",
          instance: "Test",
          status: "defeated",
          pulls: 1,
          bestPercent: 0,
          notes: "",
        },
      },
      {
        type: "supply.save",
        supply: {
          id: "supply",
          name: "Potions",
          needed: 10,
          notes: "",
          pledges: {},
        },
      },
    ];
    for (const a of actions)
      expect(() => applyChange(s, request(s, a), member)).toThrow(
        "Only a guild admin",
      );
  });
  it("enforces revision conflict protection and idempotency", () => {
    const s = base(),
      r = request(s, update);
    const n = applyChange(s, r, member);
    expect(applyChange(n, r, member)).toEqual(n);
    expect(() => applyChange(n, request(s, update), member)).toThrow(
      "changed since",
    );
  });
  it("rejects full group assignments and invalid role targets", () => {
    const s = base();
    for (let i = 0; i < 4; i++)
      s.characters.push({
        ...s.characters[0],
        id: `copy${i}`,
        name: `Copy${i}`,
      });
    s.characters.push({ ...s.characters[0], id: "bench", teamId: undefined });
    expect(() =>
      applyChange(
        s,
        request(s, {
          type: "team.assign",
          characterId: "bench",
          teamId: "vanguard",
          group: 1,
        }),
        admin,
      ),
    ).toThrow("full");
    expect(() =>
      applyChange(
        s,
        request(s, {
          type: "team.save",
          team: { ...s.teams[0], size: 5, tanks: 4, healers: 4 },
        }),
        admin,
      ),
    ).toThrow("exceed");
  });
  it("prevents switching another identity into an existing character import", () => {
    const s = base();
    expect(() =>
      applyChange(
        s,
        request(s, {
          type: "character.import",
          characterId: "example-raider",
          raw: source.replaceAll("Example Raider", "Impostor"),
        }),
        member,
      ),
    ).toThrow("different character");
  });
  it("prevents duplicate characters by realm and region", () => {
    const s = base();
    expect(() =>
      applyChange(
        s,
        request(s, {
          type: "character.import",
          characterId: "duplicate",
          raw: source,
        }),
        member,
      ),
    ).toThrow("already on the roster");
  });
  it("validates event time order and preserves signups on admin edits", () => {
    const s = base();
    const event = {
      id: "raid",
      title: "Test",
      instance: "Test",
      teamId: "vanguard",
      start: "2026-11-14T03:00:00Z",
      end: "2026-11-14T06:00:00Z",
      timeZone: "America/Los_Angeles",
      notes: "",
      signups: {},
    };
    let n = applyChange(s, request(s, { type: "event.save", event }), admin);
    n = applyChange(
      n,
      request(n, {
        type: "event.signup",
        eventId: "raid",
        characterId: "example-raider",
        status: "going",
      }),
      member,
    );
    const next = applyChange(
      n,
      request(n, { type: "event.save", event: { ...event, title: "Updated" } }),
      admin,
    );
    expect(next.events[0].signups["example-raider"]).toBe("going");
    expect(() =>
      applyChange(
        s,
        request(s, {
          type: "event.save",
          event: { ...event, end: event.start },
        }),
        admin,
      ),
    ).toThrow("after");
  });
  it("replaces individual commitments instead of double-counting", () => {
    const s = base();
    s.supplies.push({
      id: "p",
      name: "Potions",
      needed: 40,
      notes: "",
      pledges: {},
    });
    let n = applyChange(
      s,
      request(s, {
        type: "supply.pledge",
        supplyId: "p",
        characterId: "example-raider",
        quantity: 10,
      }),
      member,
    );
    n = applyChange(
      n,
      request(n, {
        type: "supply.pledge",
        supplyId: "p",
        characterId: "example-raider",
        quantity: 15,
      }),
      member,
    );
    expect(n.supplies[0].pledges["example-raider"]).toBe(15);
    expect(() =>
      applyChange(
        n,
        request(n, {
          type: "supply.pledge",
          supplyId: "p",
          characterId: "example-raider",
          quantity: -1,
        }),
        member,
      ),
    ).toThrow();
  });
  it("enforces loot eligibility and makes awards immutable", () => {
    const s = base();
    s.loot.push({
      id: "drop",
      itemId: 8183,
      name: "Bow",
      slot: "ranged",
      boss: "Verified source",
      source: "",
      eligible: ["hunter"],
      priority: ["example-raider"],
      requests: {},
    });
    expect(() =>
      applyChange(
        s,
        request(s, {
          type: "loot.award",
          lootId: "drop",
          characterId: "example-raider",
          reason: "Upgrade",
        }),
        member,
      ),
    ).toThrow("Only a guild admin");
    const n = applyChange(
      s,
      request(s, {
        type: "loot.award",
        lootId: "drop",
        characterId: "example-raider",
        reason: "Council upgrade decision",
      }),
      admin,
    );
    expect(n.loot[0].awardedTo).toBe("example-raider");
    expect(() =>
      applyChange(
        n,
        request(n, { type: "loot.save", loot: { ...n.loot[0], priority: [] } }),
        admin,
      ),
    ).toThrow("immutable");
    s.loot[0].eligible = ["mage"];
    expect(() =>
      applyChange(
        s,
        request(s, {
          type: "loot.request",
          lootId: "drop",
          characterId: "example-raider",
          tier: "bis",
          note: "",
        }),
        member,
      ),
    ).toThrow("not eligible");
  });
  it("does not publish private BattleTags or numeric accounts in audit records", () => {
    const s = base();
    s.characters[0].ownerBattleNet = "public-pseudonym";
    const n = applyChange(s, request(s, update), {
      provider: "battlenet",
      id: "public-pseudonym",
      label: "PrivateTag#123",
    });
    expect(n.audit[0].actor).toBe("Battle.net member");
    expect(JSON.stringify(n)).not.toContain("PrivateTag#123");
  });
});

it("reserves unsafe dictionary identifiers", () => {
  const s = base();
  expect(() =>
    applyChange(
      s,
      request(s, {
        type: "character.import",
        characterId: "__proto__",
        raw: source,
      }),
      member,
    ),
  ).toThrow();
});
it("allows admins to bench raiders without deleting characters", () => {
  const s = base();
  const action: RaidAction = {
    type: "team.unassign",
    characterId: "example-raider",
  };
  expect(() => applyChange(s, request(s, action), member)).toThrow(
    "Only a guild admin",
  );
  const n = applyChange(s, request(s, action), admin);
  expect(n.characters).toHaveLength(1);
  expect(n.characters[0].teamId).toBeUndefined();
  expect(n.characters[0].group).toBeUndefined();
});
