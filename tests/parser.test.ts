import { describe, it, expect } from "vitest";
import { parseSimc, numericStats } from "../src/lib/parser";
import { EXAMPLE_EXPORT as source } from "../src/lib/example";
describe("Forever SimC parser", () => {
  it("reads a fictional export without assuming a spec or raid role", () => {
    const p = parseSimc(source);
    expect(p.name).toBe("Example Raider");
    expect(p.class).toBe("hunter");
    expect(p.level).toBe(30);
    expect(p.spec).toBe("unknown");
    expect(p.role).toBe("");
    expect(p.metadata.build).toBe("WoW 1.60.1.example, TOC 16001");
    expect(p.metadata.checksum).toBe("example");
  });
  it("keeps equipment, bags and commented bag alternatives separate", () => {
    const p = parseSimc(source);
    expect(p.gear).toHaveLength(3);
    expect(p.bagGear).toHaveLength(1);
    expect(p.bags).toHaveLength(1);
    expect(p.gear.find((g) => g.slot === "shoulder")?.id).toBe(4251);
    expect(p.bagGear.find((g) => g.slot === "shoulder")?.id).toBe(4661);
  });
  it("preserves item IDs, names, enchant IDs and tuning", () => {
    const p = parseSimc(source);
    expect(p.gear.find((g) => g.slot === "shoulder")).toMatchObject({
      id: 4251,
      modifiers: { enchant_id: "100", bonus_id: "999", content_tuning: "100" },
    });
    expect(p.gear.find((g) => g.slot === "ranged")?.name).toBe("Precision Bow");
  });
  it("preserves pet data, commented statistics and original input", () => {
    const p = parseSimc(source);
    expect(p.pet.pet_level).toBe("29");
    expect(p.pet.pet_training_points).toBe("20/50");
    expect(p.pet.pet_attack_power).toBe("melee:50:10:0/ranged:0:0:0");
    expect(numericStats(p.stats.character_stats).agility).toBe(88);
    expect(p.raw).toBe(source);
  });
  it("accepts BOM and CRLF and ignores commented active gear", () => {
    const p = parseSimc(
      "\uFEFF" + source.replaceAll("\n", "\r\n") + "\n# head=,id=123",
    );
    expect(p.gear).toHaveLength(3);
  });
  it("rejects multiple characters and duplicate equipped slots", () => {
    expect(() => parseSimc(source + '\nmage="Other"')).toThrow("one character");
    expect(() => parseSimc(source + "\nshoulder=,id=4661")).toThrow(
      "two active",
    );
  });
  it("rejects invalid input and bounded import sizes", () => {
    expect(() => parseSimc("")).toThrow();
    expect(() => parseSimc("hello")).toThrow();
    expect(() => parseSimc("x".repeat(100001))).toThrow("100 KB");
    expect(() => parseSimc('hunter="Test"\nlevel=NaN')).toThrow(
      "valid character level",
    );
  });
  it("rejects likely accidental credentials without echoing them", () => {
    const token = "ghp_" + "a".repeat(36);
    expect(() => parseSimc(source + "\n# " + token)).toThrow("credential");
    expect(() => parseSimc(source + "\nclient_secret=do-not-store")).toThrow(
      "credential",
    );
  });
});
