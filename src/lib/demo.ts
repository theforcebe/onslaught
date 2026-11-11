import type { RaidState, WowClass, Character } from "./model";
import { parseSimc } from "./parser";
import { EXAMPLE_EXPORT } from "./example";
import { RAID_BUFFS } from "./raid";
export function demoState(base: RaidState): RaidState {
  const s = structuredClone(base);
  s.revision = 0;
  s.audit = [];
  s.processedRequests = [];
  s.guild = {
    name: "Ønslaught",
    realm: "Fictional demo realm",
    region: "US",
    timeZone: "America/Los_Angeles",
    adminsGithub: ["demo-admin"],
    membersGithub: [],
  };
  s.teams = [
    {
      id: "vanguard",
      name: "The Vanguard",
      size: 20,
      tanks: 2,
      healers: 4,
      description:
        "Our example raid team. Try changing the role targets and group positions.",
    },
  ];
  const people: [string, WowClass, Character["role"], string][] = [
    ["Thorgar", "warrior", "tank", "Protection"],
    ["Ironbark", "druid", "tank", "Feral"],
    ["Seraphine", "priest", "healer", "Discipline"],
    ["Tidecaller", "shaman", "healer", "Restoration"],
    ["Wildbloom", "druid", "healer", "Restoration"],
    ["Lumina", "priest", "healer", "Holy"],
    ["Vex", "rogue", "melee", "Combat"],
    ["Rend", "warrior", "melee", "Arms"],
    ["Ashfang", "shaman", "melee", "Enhancement"],
    ["Shade", "rogue", "melee", "Assassination"],
    ["Ember", "mage", "ranged", "Fire"],
    ["Nyx", "warlock", "ranged", "Affliction"],
    ["Frostweave", "mage", "ranged", "Frost"],
    ["Moonveil", "druid", "ranged", "Balance"],
    ["Hex", "warlock", "ranged", "Destruction"],
    ["Hawkeye", "hunter", "ranged", "Marksmanship"],
  ];
  s.characters = [
    {
      id: "example-raider",
      name: "Example Raider",
      class: "hunter",
      level: 30,
      role: "ranged",
      spec: "Beast Mastery",
      teamId: "vanguard",
      group: 1,
      notes: "Fictional demo character",
      snapshot: parseSimc(EXAMPLE_EXPORT),
    },
  ];
  s.characters.push(
    ...people.map(([name, cls, role, spec], i) => ({
      id: `demo-${i}`,
      name,
      class: cls,
      level: 60,
      role,
      spec,
      notes: "Illustrative demo character",
      ownerGithub: "demo",
      teamId: "vanguard",
      group: Math.floor((i + 1) / 5) + 1,
    })),
  );
  // Explicit fictional ability declarations; live imports never infer these.
  for (const c of s.characters)
    c.buffs = RAID_BUFFS.filter(
      (b) =>
        b.cls === c.class &&
        (!["moonkin", "pack", "trueshot"].includes(b.id) ||
          (b.id === "moonkin" && c.spec === "Balance") ||
          (b.id === "pack" && c.spec === "Feral") ||
          (b.id === "trueshot" && c.spec === "Marksmanship")),
    ).map((b) => b.id);
  const start = new Date();
  start.setDate(start.getDate() + 2);
  start.setHours(19, 0, 0, 0);
  const end = new Date(start.getTime() + 3 * 3600000);
  s.events = [
    {
      id: "demo-raid",
      title: "Into the fire",
      instance: "Molten Core · example raid",
      teamId: "vanguard",
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: "America/Los_Angeles",
      notes:
        "Example schedule. Meet at the entrance 15 minutes before the first pull.",
      signups: Object.fromEntries(
        s.characters
          .slice(0, 14)
          .map((c, i) => [c.id, i === 4 ? "tentative" : "going"]),
      ),
    },
  ];
  s.supplies = [
    {
      id: "demo-potion",
      name: "Healing potions",
      itemId: 1710,
      eventId: "demo-raid",
      needed: 100,
      notes: "Example preparation target",
      pledges: { "example-raider": 20, "demo-3": 35, "demo-4": 25 },
    },
    {
      id: "demo-food",
      name: "Stat food",
      eventId: "demo-raid",
      needed: 80,
      notes: "Bring food appropriate for your role",
      pledges: { "demo-4": 30, "demo-9": 20 },
    },
    {
      id: "demo-mana",
      name: "Mana potions",
      itemId: 3827,
      eventId: "demo-raid",
      needed: 100,
      notes: "Example preparation target",
      pledges: { "demo-2": 40, "demo-3": 60 },
    },
  ];
  s.loot = [
    {
      id: "demo-bow",
      itemId: 8183,
      name: "Precision Bow",
      slot: "ranged",
      boss: "Example loot council",
      source: "https://thewowdb.com/wow-forever/item/8183",
      eligible: ["hunter"],
      priority: ["example-raider", "demo-15"],
      requests: {
        "example-raider": {
          tier: "major",
          note: "Example request — already equipped in the supplied export.",
        },
      },
    },
    {
      id: "demo-shoulders",
      itemId: 4251,
      name: "Hillman's Shoulders",
      slot: "shoulder",
      boss: "Example planning item",
      source: "https://thewowdb.com/wow-forever/item/4251",
      eligible: ["hunter", "rogue", "druid"],
      priority: ["demo-6"],
      requests: { "demo-6": { tier: "major", note: "Demo wishlist request" } },
    },
  ];
  s.bosses = [
    {
      id: "demo-boss-1",
      name: "Lucifron",
      instance: "Molten Core · example",
      status: "defeated",
      pulls: 3,
      bestPercent: 0,
      notes: "Illustrative progress; not a verified Forever encounter record.",
    },
    {
      id: "demo-boss-2",
      name: "Magmadar",
      instance: "Molten Core · example",
      status: "progressing",
      pulls: 5,
      bestPercent: 18,
      notes: "Example assignment: rotate cooldowns during the final phase.",
    },
    {
      id: "demo-boss-3",
      name: "Gehennas",
      instance: "Molten Core · example",
      status: "not-started",
      pulls: 0,
      bestPercent: 100,
      notes: "",
    },
  ];
  s.events[0].lineup = Object.fromEntries(
    s.characters
      .filter((c) => s.events[0].signups[c.id] === "going")
      .slice(0, 10)
      .map((c) => [c.id, c.group || 1]),
  );
  s.audit = [
    {
      id: "demo-a",
      at: new Date().toISOString(),
      actor: "Demo council",
      action: "team.save",
      summary: "The Vanguard is assembling. Three places remain.",
    },
  ];
  const createdAt = new Date().toISOString();
  s.community = {
    announcements: [
      {
        id: "demo-announcement",
        title: "A little preparation. A better raid night.",
        body: "Bring your consumables, update your character export, and check the requests board before we head in. If you need a hand with materials, leave a reply here.",
        createdBy: "demo-admin",
        createdByName: "Demo admin",
        createdAt,
      },
    ],
    polls: [
      {
        id: "demo-poll",
        title: "Which nights work for our first raid?",
        timeZone: "America/Los_Angeles",
        options: [
          "Tuesday · 7–10 PM",
          "Thursday · 7–10 PM",
          "Friday · 7–10 PM",
          "Sunday · 6–9 PM",
        ],
        closesAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        voting: "site",
        closed: false,
        createdBy: "demo-admin",
        createdByName: "Demo admin",
        createdAt,
        votes: {
          "demo-ember": [0, 1, 2],
          "demo-nyx": [1, 2],
          "demo-seraphine": [0, 1, 3],
          "demo-rend": [1, 3],
          "demo-ironbark": [0, 2, 3],
        },
      },
    ],
    requests: [
      {
        id: "demo-material-1",
        item: "Dreamfoil",
        quantity: 40,
        recipientId: "demo-ember",
        recipientName: "Ember",
        notes:
          "For the guild flask stock. Trade to the raid lead before invites.",
        dueAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        createdBy: "demo-admin",
        createdByName: "Demo admin",
        createdAt,
        updatedAt: createdAt,
        fulfilled: 25,
        cancelled: false,
        updates: [
          {
            at: createdAt,
            by: "demo-ember",
            byName: "Ember",
            quantity: 25,
            note: "First gathering run delivered.",
          },
        ],
      },
      {
        id: "demo-material-2",
        item: "Grilled Squid",
        quantity: 20,
        recipientId: "demo-admin",
        recipientName: "Demo admin",
        notes: "Food for the melee group.",
        createdBy: "demo-nyx",
        createdByName: "Nyx",
        createdAt,
        updatedAt: createdAt,
        fulfilled: 0,
        cancelled: false,
        updates: [],
      },
    ],
    replies: [
      {
        id: "demo-reply",
        kind: "announcement",
        recordId: "demo-announcement",
        body: "I can help with an herb run on Thursday.",
        createdBy: "demo-ember",
        createdByName: "Ember",
        createdAt,
      },
    ],
  };
  return s;
}
