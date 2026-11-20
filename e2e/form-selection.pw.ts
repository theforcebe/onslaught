import { expect, test } from "@playwright/test";
import { admin, member, testGuild } from "./guild";

test("required ownership selection keeps its placeholder disabled and assigns an approved member", async ({
  page,
}) => {
  const guild = testGuild(0);
  await guild.open(page, admin, "#roster");
  await page.getByRole("button", { name: /Frostleaf.*Level/ }).click();
  const dialog = page.getByRole("dialog", { name: "Frostleaf", exact: true });
  await dialog
    .getByText("Admin: assign Battle.net ownership", { exact: true })
    .click();
  const owner = dialog.getByRole("combobox", { name: "Approved member" });
  await expect(owner).toHaveValue("");
  await expect(
    owner.getByRole("option", { name: "Choose a member" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Save change" }).press("Enter");
  expect(
    await owner.evaluate(
      (el) => (el as HTMLSelectElement).validity.valueMissing,
    ),
  ).toBe(true);
  expect(guild.changes).toHaveLength(0);
  await owner.selectOption({ label: member.label });
  await dialog.getByRole("button", { name: "Save change" }).press("Enter");
  await expect(dialog).toHaveCount(0);
  expect(guild.doc().state.characters[0].ownerBattleNet).toBe(member.id);
});

for (const eligible of [true, false]) {
  test(
    eligible
      ? "council priority requires an eligible choice before saving"
      : "a drop with no eligible raiders explains its unavailable actions",
    async ({ page }) => {
      const guild = testGuild(1);
      const loot = guild.doc().state.loot[0];
      loot.priority = [];
      loot.requests = {};
      loot.eligible = [eligible ? "hunter" : "paladin"];
      guild.doc().state.loot = [loot];
      await guild.open(page, admin, "#loot");
      await page.getByRole("button", { name: "View priority" }).click();
      const dialog = page.getByRole("dialog", { name: loot.name });
      const raider = dialog.getByRole("combobox", {
        name: "Add eligible raider to priority",
      });
      const add = dialog.getByRole("button", { name: "Add", exact: true });
      if (!eligible) {
        await expect(raider).toBeDisabled();
        await expect(add).toBeDisabled();
        await expect(
          dialog.getByRole("button", { name: "Record award" }),
        ).toBeDisabled();
        await expect(
          dialog.getByText(
            "No roster characters match the eligible classes for this drop.",
          ),
        ).toBeVisible();
        expect(guild.changes).toHaveLength(0);
        return;
      }
      await add.press("Enter");
      expect(
        await raider.evaluate(
          (el) => (el as HTMLSelectElement).validity.valueMissing,
        ),
      ).toBe(true);
      expect(guild.changes).toHaveLength(0);
      await raider.selectOption({ label: "Frostleaf" });
      await add.press("Enter");
      await expect(dialog).toHaveCount(0);
      expect(guild.doc().state.loot[0].priority).toEqual(["frostleaf"]);
    },
  );
}
