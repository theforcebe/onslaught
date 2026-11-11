import { readFileSync } from "node:fs";
import { StateSchema } from "../src/lib/model";
import { demoState } from "../src/lib/demo";
import { SECTIONS } from "../src/lib/access";
import type { GuildDocument } from "../src/lib/access";
export function privateFixture(): GuildDocument {
  const s = demoState(
    StateSchema.parse(
      JSON.parse(readFileSync("public/data/raid-state.json", "utf8")),
    ),
  );
  s.teams.push({
    ...s.teams[0],
    id: "second",
    name: "Second team",
    description: "PRIVATE-SECOND-PLAN",
  });
  s.teams[0].description = "PRIVATE-FIRST-PLAN";
  s.characters = s.characters.slice(0, 2);
  s.characters[0].ownerBattleNet = "member-id";
  s.characters[0].notes = "PRIVATE-FIRST-NOTE";
  s.characters[1] = {
    ...s.characters[0],
    id: "second-char",
    name: "Public second name",
    teamId: "second",
    ownerBattleNet: "other-member",
    notes: "PRIVATE-SECOND-NOTE",
    snapshot: { ...s.characters[0].snapshot!, raw: "PRIVATE-SECOND-EXPORT" },
  };
  s.events[0].notes = "PRIVATE-FIRST-RAID";
  s.events[0].signups = {
    [s.characters[0].id]: "going",
    "second-char": "absent",
  };
  s.events.push({
    ...s.events[0],
    id: "second-event",
    teamId: "second",
    title: "Public second raid",
    notes: "PRIVATE-SECOND-RAID",
  });
  s.loot = [
    {
      ...s.loot[0],
      id: "first-loot",
      teamId: "vanguard",
      boss: "PRIVATE-FIRST-LOOT",
      priority: s.characters.map((c) => c.id),
      requests: {
        "second-char": { tier: "bis", note: "PRIVATE-SECOND-REQUEST" },
      },
    },
    {
      ...s.loot[0],
      id: "second-loot",
      teamId: "second",
      boss: "PRIVATE-SECOND-LOOT",
    },
  ];
  s.supplies = [
    {
      ...s.supplies[0],
      eventId: "second-event",
      notes: "PRIVATE-SECOND-SUPPLY",
    },
  ];
  s.bosses = [
    { ...s.bosses[0], teamId: "second", notes: "PRIVATE-SECOND-PROGRESS" },
  ];
  s.audit = [
    {
      id: "private-audit",
      at: new Date().toISOString(),
      actor: "Officer",
      action: "loot.request",
      summary: "PRIVATE-SECOND-AUDIT",
      scope: {
        section: "loot",
        teamIds: ["second"],
        characterIds: ["second-char"],
      },
    },
  ];
  return {
    version: 1,
    state: s,
    members: [
      {
        id: "member-id",
        label: "PRIVATE-BATTLETAG",
        status: "active",
        role: "raider",
        sections: [...SECTIONS],
        allTeams: false,
        teamIds: ["vanguard"],
      },
    ],
  };
}
