import { describe, expect, it } from "vitest";
import type { Character, RaidEvent } from "../src/lib/model";
import { discordLine, raidSignupEmbed } from "../server/raid-chart";

const druid: Character = {
  id: "oak",
  name: "Oak",
  class: "druid",
  spec: "Feral",
  role: "tank",
  level: 25,
  notes: "PRIVATE NOTE",
  ownerBattleNet: "OWNER",
  alternateBuilds: [
    { spec: "Feral", role: "melee" },
    { spec: "Restoration", role: "healer" },
  ],
};
const mage: Character = {
  ...druid,
  id: "ember",
  name: "Ember",
  class: "mage",
  spec: "Frost",
  role: "ranged",
  alternateBuilds: [],
};
const event: RaidEvent = {
  id: "raid-night",
  title: "Raid night",
  instance: "Dungeon",
  teamId: "guild",
  start: "2027-01-01T02:00:00.000Z",
  end: "2027-01-01T05:00:00.000Z",
  timeZone: "UTC",
  notes: "PRIVATE RAID NOTE",
  signups: { oak: "going", ember: "going" },
  signupBuilds: { oak: { spec: "Feral", role: "melee" } },
};
const emojis = {
  mage: "<:onslaught_mage:123456789012345678>",
  druid: "<:onslaught_druid:234567890123456789>",
};

describe("Discord raid chart", () => {
  it("counts the chosen role for the night while keeping character details private by default", () => {
    const chart = raidSignupEmbed(event, [druid, mage]);
    expect(chart.fields.map((f) => f.name)).toEqual([
      "🛡️ Tanks · 0",
      "💚 Healers · 0",
      "⚔️ Melee · 1",
      "🏹 Ranged · 1",
    ]);
    expect(chart.description).toBe("**2 going** · 0 maybe · 0 unavailable");
    const json = JSON.stringify(chart);
    for (const privateValue of [
      "Oak",
      "Ember",
      "Feral",
      "Frost",
      "OWNER",
      "PRIVATE",
      "raid-night",
    ]) {
      expect(json).not.toContain(privateValue);
    }
    expect(chart.fields[2].value).toBe("Count only");
    expect(json).not.toMatch(/[█░]/);
    expect(chart).not.toHaveProperty("footer");
  });
  it("lists only the class emoji and visible name under the selected role for that night", () => {
    const visible = new Set(["oak"]);
    const alternate = raidSignupEmbed(event, [druid, mage], visible, emojis);
    expect(alternate.fields[2].value).toBe(emojis.druid + " **Oak**");
    expect(JSON.stringify(alternate)).not.toContain("Ember");
    expect(JSON.stringify(alternate)).not.toContain(emojis.mage);
    const historic = raidSignupEmbed(
      event,
      [{ ...druid, alternateBuilds: [] }, mage],
      visible,
      emojis,
    );
    expect(historic.fields[2].value).toBe(emojis.druid + " **Oak**");
    const main = raidSignupEmbed(
      { ...event, signupBuilds: undefined },
      [druid, mage],
      visible,
      emojis,
    );
    expect(main.fields[0].value).toBe(emojis.druid + " **Oak**");
    const partial = raidSignupEmbed(
      event,
      [druid, mage],
      new Set(["oak", "ember"]),
      { druid: emojis.druid },
    );
    expect(partial.fields[3].value).toBe("**Ember** · Mage");
  });
  it("counts new answers once, sorts named entries, and keeps pending or unavailable signups out of the confirmed roles", () => {
    const maybeEvent: RaidEvent = {
      ...event,
      signups: {
        missing: "going",
        ghost: "absent",
        ember: "tentative",
        oak: "tentative",
      },
    };
    const chart = raidSignupEmbed(
      maybeEvent,
      [mage, druid],
      new Set(["oak", "ember"]),
      emojis,
    );
    expect(chart.description).toBe("**1 going** · 2 maybe · 1 unavailable");
    expect(
      chart.fields.find((f) => f.name.includes("Role unassigned"))?.name,
    ).toContain("1");
    expect(chart.fields.find((f) => f.name.includes("Maybe"))?.value).toBe(
      emojis.mage + " **Ember**\n" + emojis.druid + " **Oak**",
    );
    expect(
      chart.fields.find((f) => f.name.includes("Unavailable")),
    ).toBeUndefined();
    expect(JSON.stringify(chart)).not.toContain("missing");
    expect(
      raidSignupEmbed(
        {
          ...maybeEvent,
          signups: Object.fromEntries(
            Object.entries(maybeEvent.signups).reverse(),
          ),
        },
        [druid, mage],
        new Set(["ember", "oak"]),
        emojis,
      ),
    ).toEqual(chart);
  });
  it("renders an empty raid without implying any confirmed roles", () => {
    const chart = raidSignupEmbed({ ...event, signups: {} }, [druid]);
    expect(chart.fields).toHaveLength(4);
    for (const field of chart.fields) expect(field.value).toBe("No signups");
    expect(chart.description).toBe("**0 going** · 0 maybe · 0 unavailable");
  });
  it("escapes headings, links and mentions and keeps each label within its UTF-16 budget", () => {
    const escaped = discordLine(
      "<@123> @here\n## [guild](https://example.org) **nice**",
    );
    expect(escaped).not.toMatch(
      /<@|@here|\n|\]\(https|https:\/\/|\*\*nice\*\*/,
    );
    expect(discordLine("🛡️".repeat(50), 12).length).toBeLessThanOrEqual(12);
    expect(discordLine("***", 4)).toBe("\\*…");
    expect(
      JSON.stringify(
        raidSignupEmbed(
          event,
          [{ ...druid, name: "Tree#44772" }],
          new Set(["oak"]),
        ),
      ),
    ).not.toContain("44772");
  });
  it.each([
    { size: 40, sharedIcon: false },
    { size: 105, sharedIcon: true },
  ])(
    "shows every name and class for a $size-character role list",
    ({ size, sharedIcon }) => {
      const people = Array.from({ length: size }, (_, index) => ({
        ...mage,
        id: "mage-" + index,
        name: "Stormwatch of the Northern Barrens " + index,
      }));
      const raid: RaidEvent = {
        ...event,
        signups: Object.fromEntries(
          people.map((character) => [character.id, "going"]),
        ),
      };
      const chart = raidSignupEmbed(
        raid,
        people,
        new Set(people.map((character) => character.id)),
        emojis,
      );
      const ranged = chart.fields.filter((field) =>
        field.name.includes("Ranged"),
      );
      expect(ranged[0].name).toBe("🏹 Ranged · " + size);
      expect(ranged.length).toBeGreaterThan(1);
      expect(
        ranged
          .slice(1)
          .every((field) => field.name === "🏹 Ranged (continued)"),
      ).toBe(true);
      expect(ranged.every((field) => field.value.length <= 1024)).toBe(true);
      const lines = ranged.flatMap((field) => field.value.split("\n"));
      expect(lines.every((line) => line.startsWith(emojis.mage + " "))).toBe(
        true,
      );
      expect(lines.some((line) => line.includes(", "))).toBe(sharedIcon);
      const names = lines
        .flatMap((line) => line.slice(emojis.mage.length + 1).split(", "))
        .sort();
      expect(names).toEqual(people.map((c) => "**" + c.name + "**").sort());
    },
  );
  it("keeps the full counts when 500 signups exceed Discord's field and embed budgets", () => {
    const people = Array.from({ length: 500 }, (_, i) => ({
      ...druid,
      id: "char-" + i,
      name: "Nightwatch " + String(i).padStart(3, "0") + "*".repeat(55),
      role: (["tank", "healer", "melee", "ranged", "unassigned"] as const)[
        i % 5
      ],
    }));
    const crowded: RaidEvent = {
      ...event,
      signupBuilds: {},
      signups: Object.fromEntries(
        people.map((c, i) => [
          c.id,
          i < 300 ? "going" : i < 400 ? "tentative" : "absent",
        ]),
      ),
    };
    const chart = raidSignupEmbed(
      crowded,
      people,
      new Set(people.map((c) => c.id)),
      emojis,
    );
    expect(chart.description).toBe(
      "**300 going** · 100 maybe · 100 unavailable",
    );
    expect(chart.fields.length).toBeLessThanOrEqual(25);
    const primary = chart.fields.filter((f) => !f.name.endsWith("(continued)"));
    expect(primary).toHaveLength(7);
    expect(primary.map((f) => f.name)).toEqual([
      "🛡️ Tanks · 60",
      "💚 Healers · 60",
      "⚔️ Melee · 60",
      "🏹 Ranged · 60",
      "◻️ Role unassigned · 60",
      "🕒 Maybe · 100",
      "➖ Unavailable · 100",
    ]);
    expect(
      chart.fields.filter((f) => /\+\d+ more$/.test(f.value)),
    ).toHaveLength(7);
    for (const f of chart.fields) {
      expect(f.value.length).toBeLessThanOrEqual(1024);
    }
    const totalLength = [
      chart.title,
      chart.description,
      ...chart.fields.flatMap((f) => [f.name, f.value]),
    ].join("").length;
    expect(totalLength).toBeLessThanOrEqual(6000);
  });
});
