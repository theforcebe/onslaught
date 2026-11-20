import { describe, it, expect } from "vitest";
import { canOpenPage, guildRoute } from "../src/lib/navigation";
import {
  ADMIN_ACCESS,
  PUBLIC_ACCESS,
  canUseGuildChat,
  type Access,
} from "../src/lib/access";

describe("permission-aware navigation", () => {
  it("opens shareable help topics in the public overview without granting section access", () => {
    expect(guildRoute("#help?topic=character")).toMatchObject({
      page: "overview",
      helpTopic: "character",
    });
    expect(guildRoute("#help?topic=unknown").helpTopic).toBe("");
    expect(guildRoute("#discord").helpTopic).toBeUndefined();
  });
  it.each(["admin", "officer", "raider", "guild_member"] as const)(
    "%s gets chat with approved membership and no section or team grants",
    (role) => {
      const access: Access = { ...PUBLIC_ACCESS, status: "active", role };
      expect(canUseGuildChat(access)).toBe(true);
      for (const status of [
        "visitor",
        "unregistered",
        "pending",
        "suspended",
      ] as const)
        expect(canUseGuildChat({ ...access, status })).toBe(false);
    },
  );
  it.each(["visitor", "unregistered", "pending", "suspended"] as const)(
    "%s sees public pages and their membership screen, without private destinations",
    (status) => {
      const access: Access = { ...PUBLIC_ACCESS, status };
      for (const page of [
        "overview",
        "roster",
        "planner",
        "schedule",
        "access",
        "profession-trail",
      ])
        expect(canOpenPage(access, page)).toBe(true);
      for (const page of [
        "community",
        "polls",
        "loot",
        "consumables",
        "progress",
        "activity",
        "settings",
      ])
        expect(canOpenPage(access, page)).toBe(false);
    },
  );
  it.each(["officer", "raider", "guild_member"] as const)(
    "%s receives only granted raid tabs and never admin pages",
    (role) => {
      const access: Access = {
        ...PUBLIC_ACCESS,
        status: "active",
        role,
        sections: ["loot", "activity"],
      };
      expect(canOpenPage(access, "community")).toBe(true);
      expect(canOpenPage(access, "profession-trail")).toBe(true);
      expect(canOpenPage(access, "loot")).toBe(true);
      for (const page of [
        "polls",
        "consumables",
        "progress",
        "activity",
        "settings",
      ])
        expect(canOpenPage(access, page)).toBe(false);
    },
  );
  it("keeps every established destination available to active admins and rejects unknown routes", () => {
    for (const page of [
      "overview",
      "roster",
      "planner",
      "schedule",
      "access",
      "profession-trail",
      "community",
      "polls",
      "loot",
      "consumables",
      "progress",
      "activity",
      "settings",
    ])
      expect(canOpenPage(ADMIN_ACCESS, page)).toBe(true);
    expect(canOpenPage(ADMIN_ACCESS, "unknown")).toBe(false);
  });
});
