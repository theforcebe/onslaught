import { describe, expect, it } from "vitest";
import { project } from "../src/lib/access";
import { guildRoute, raidRoute } from "../src/lib/navigation";
import { upcomingRaid } from "../src/lib/upcoming-raid";
import { privateFixture } from "./access-fixture";

describe("upcoming raid board", () => {
  it("keeps the raid in progress until it ends and then switches to the next night", () => {
    const base = privateFixture().state.events[0];
    const first = {
      ...base,
      start: "2026-11-20T20:00:00Z",
      end: "2026-11-20T22:00:00Z",
    };
    const second = {
      ...base,
      id: "second-night",
      start: "2026-11-21T20:00:00Z",
      end: "2026-11-21T22:00:00Z",
    };
    const events = [second, first];
    expect(upcomingRaid(events, Date.parse(first.start))).toBe(first);
    expect(upcomingRaid(events, Date.parse(first.end))).toBe(second);
    expect(upcomingRaid(events, Date.parse(second.end))).toBeUndefined();
    expect(events).toEqual([second, first]);
  });
  it("gives approved members guild-wide counts while retaining individual attendance privacy", () => {
    const doc = privateFixture();
    const member = doc.members[0];
    member.sections = [];
    member.teamIds = [];
    const event = doc.state.events[0];
    event.end = new Date(Date.now() + 36e5).toISOString();
    doc.state.events = [event];
    const actor = {
      provider: "battlenet" as const,
      id: member.id,
      label: member.label,
    };
    const memberView = project(doc, actor);
    expect(memberView.upcomingAttendance).toEqual({
      eventId: event.id,
      going: 1,
      absent: 1,
      tentative: 0,
    });
    expect(memberView.state.events[0].signups).toEqual({
      [doc.state.characters[0].id]: "going",
    });
    expect(project(doc).upcomingAttendance).toBeUndefined();
    member.status = "pending";
    expect(project(doc, actor).upcomingAttendance).toBeUndefined();
  });
  it("deep-links to the exact raid while retaining the legacy schedule route", () => {
    expect(guildRoute("#" + raidRoute("raid-two"))).toMatchObject({
      page: "planner",
      raidId: "raid-two",
    });
    expect(guildRoute("#schedule")).toMatchObject({
      page: "planner",
      raidId: "",
    });
  });
});
