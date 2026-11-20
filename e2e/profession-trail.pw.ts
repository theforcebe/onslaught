import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { member, testGuild } from "./guild";

test("a visitor can open the profession guide from navigation and download the supplied release", async ({
  page,
}) => {
  const guild = testGuild(0);
  await guild.open(page);
  await expect(
    page.getByRole("button", { name: "Battle.net sign in" }),
  ).toBeVisible();
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("complementary", { name: "Guild navigation" })
    .getByText("Profession Trail", { exact: true })
    .click();
  await expect(page).toHaveURL(/#profession-trail$/);

  const main = page.getByRole("main");
  const title = main.getByRole("heading", {
    level: 1,
    name: "Profession Trail",
  });
  await expect(title).toBeVisible();
  await page.reload();
  await expect(title).toBeVisible();
  await expect(main).toContainText("Interface");
  await expect(main).toContainText("/ptrail");

  const link = main.getByRole("link", { name: /download profession trail/i });
  await expect(link).toHaveAttribute(
    "href",
    /downloads\/ProfessionTrail-0\.3\.0\.zip$/,
  );
  const saved = page.waitForEvent("download");
  await link.click();
  const zip = await saved;
  expect(zip.suggestedFilename()).toBe("ProfessionTrail-0.3.0.zip");
  const bytes = await readFile((await zip.path())!);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "b03395934e15f815b8adc89831a046e6d72c5c56e8d784ec785e9f5d69898df5",
  );
});

test("an approved member can follow the shared profession guide link", async ({
  page,
}) => {
  const guild = testGuild(0);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value: string) => {
          document.documentElement.dataset.copiedCommand = value;
        },
      },
    });
  });
  await guild.open(page, member, "#profession-trail");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Profession Trail", level: 1 }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: /download profession trail/i }),
  ).toBeVisible();
  await main
    .getByRole("combobox", { name: "Shortcut for your profession" })
    .selectOption("First Aid");
  await expect(
    main.getByText("/ptrail track first aid", { exact: true }),
  ).toBeVisible();
  await main.getByRole("button", { name: "Copy tracker command" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-copied-command",
    "/ptrail track first aid",
  );
  expect(guild.changes).toHaveLength(0);
});

test("a shared guide stays available during a guild gateway outage", async ({
  page,
}) => {
  await page.route("**/*", (route) => {
    const origin = new URL(route.request().url()).origin;
    if (origin === "http://127.0.0.1:5188") return route.continue();
    if (origin === "https://gateway.onslaught.invalid") {
      return route.fulfill({
        status: 503,
        headers: { "Access-Control-Allow-Origin": "*" },
        json: { error: "Guild gateway unavailable." },
      });
    }
    return route.abort();
  });
  await page.goto("/#profession-trail");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Profession Trail", level: 1 }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: /download profession trail/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /overview/i })).toBeVisible();
});
