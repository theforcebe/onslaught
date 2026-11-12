import { describe, it, expect } from "vitest";
import { canOpenPage } from "../src/lib/navigation";
import { ADMIN_ACCESS, PUBLIC_ACCESS, type Access } from "../src/lib/access";

describe("permission-aware navigation", () => {
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
