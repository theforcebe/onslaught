import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { admin, testGuild } from "./guild";

test.use({ timezoneId: "Asia/Tokyo" });

test("schedule, edit and export the same raid across time zones and a repeated hour", async ({
  page,
}) => {
  const guild = testGuild(1);
  guild.doc().state.guild.timeZone = "America/Los_Angeles";
  await guild.open(page, admin, "#planner");
  await expect(
    page.getByRole("combobox", { name: "Raid night" }),
  ).toBeVisible();
  const tools = page.getByRole("button", { name: "Raid tools" });
  if (await tools.isVisible()) await tools.click();
  await page
    .getByRole("button", { name: "Schedule raid", exact: true })
    .press("Enter");
  const create = page.getByRole("dialog", { name: "Schedule a raid" });
  await create.getByLabel("Raid title").fill("Weekend guild run");
  await create.getByLabel("Instance / destination").fill("Guild instance");
  await create.getByLabel("Starts", { exact: true }).fill("2027-03-14T02:15");
  await expect(create.getByRole("alert")).toContainText("does not exist");
  await create.getByLabel("Ends", { exact: true }).fill("2027-11-07T03:30");
  await create.getByRole("button", { name: "Schedule raid" }).press("Enter");
  expect(guild.changes).toHaveLength(0);
  await create.getByLabel("Starts", { exact: true }).fill("2027-11-07T01:30");
  const hour = create.getByRole("combobox", { name: "Starts · repeated hour" });
  await hour.press("Enter");
  await hour.press("End");
  await hour.press("Enter");
  await expect(hour).toContainText("Second occurrence");
  await create.getByRole("button", { name: "Schedule raid" }).press("Enter");
  await expect(create).toHaveCount(0);
  const stored = guild
    .doc()
    .state.events.find((e) => e.title === "Weekend guild run")!;
  expect(stored).toMatchObject({
    timeZone: "America/Los_Angeles",
    start: "2027-11-07T09:30:00.000Z",
    end: "2027-11-07T11:30:00.000Z",
  });
  await expect(page.locator(".raid-time-summary")).toContainText(
    /6:30\s?PM|18:30/i,
  );
  await expect(page).toHaveURL(new RegExp("raid=" + stored.id));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Add to calendar" }).press("Enter");
  const file = await download;
  expect(await readFile((await file.path())!, "utf8")).toContain(
    "DTSTART:20271107T093000Z",
  );

  await page.getByRole("button", { name: "Edit raid" }).press("Enter");
  const edit = page.getByRole("dialog", { name: "Edit raid" });
  await expect(edit.getByLabel("Starts", { exact: true })).toHaveValue(
    "2027-11-07T01:30",
  );
  await expect(
    edit.getByRole("combobox", { name: "Starts · repeated hour" }),
  ).toContainText("Second occurrence");
  await edit.getByLabel("Raid title").fill("Weekend raid");
  await edit.getByRole("button", { name: "Save raid" }).press("Enter");
  await expect(edit).toHaveCount(0);
  expect(
    guild.doc().state.events.find((e) => e.id === stored.id),
  ).toMatchObject({
    title: "Weekend raid",
    start: stored.start,
    end: stored.end,
    timeZone: stored.timeZone,
  });
});
