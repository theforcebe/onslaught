import { expect, test } from "@playwright/test";
import { admin, characterExport, member, testGuild } from "./guild";

test("membership request survives refresh and an admin can grant officer access", async ({
  page,
  context,
}) => {
  const guild = testGuild(0, false);
  await guild.open(page, member);
  const membership = page.getByRole("region", { name: "Guild membership" });
  await expect(
    membership.getByRole("heading", { name: "Join Ønslaught" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guild chat", exact: true }),
  ).toHaveCount(0);
  await membership.getByRole("button", { name: "Request membership" }).click();
  await expect(
    membership.getByRole("heading", { name: "Membership request sent" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    membership.getByRole("heading", { name: "Membership request sent" }),
  ).toBeVisible();
  await expect(
    membership.getByRole("button", { name: "Request membership" }),
  ).toHaveCount(0);

  const adminPage = await context.newPage();
  await guild.open(adminPage, admin, "#access");
  await adminPage
    .getByRole("button", { name: "Manage access for " + member.label })
    .click();
  const editor = adminPage.getByRole("dialog");
  await editor.getByText("Active", { exact: true }).click();
  await editor.getByText("Officer", { exact: true }).click();
  await editor.getByText("Gear & character notes", { exact: true }).click();
  await editor.getByRole("button", { name: "Save member access" }).click();
  await expect(editor).toHaveCount(0);
  expect(guild.doc().members[0]).toMatchObject({
    status: "active",
    role: "officer",
    sections: ["gear"],
    teamIds: [],
  });
  await adminPage.close();

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Import character", exact: true }),
  ).toBeVisible();
  await expect(membership).toHaveCount(0);
  await page.getByRole("button", { name: "Guild chat", exact: true }).click();
  await expect(page.getByLabel("Guild messenger")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Activity", exact: true }),
  ).toHaveCount(0);
});

test("first character import, role and spec choices, equipment update and reload", async ({
  page,
}) => {
  const guild = testGuild(0);
  await guild.open(page, member);
  await page
    .getByRole("button", { name: "Import character", exact: true })
    .click();
  const setup = page.getByRole("dialog", {
    name: "Set up your raid character",
  });
  await setup
    .getByRole("textbox", { name: "Character export" })
    .fill(characterExport("Oakheart"));
  await setup.getByRole("button", { name: "Continue" }).click();
  await setup.getByRole("button", { name: /Ranged/ }).click();
  await setup.getByRole("button", { name: "Survival", exact: true }).click();
  await setup.getByRole("button", { name: "Continue" }).click();
  await expect(
    setup.getByRole("heading", { name: "What can you bring?" }),
  ).toBeVisible();
  await setup.getByRole("button", { name: "Continue" }).click();
  await setup.getByRole("button", { name: "Save character" }).click();
  await expect(setup).toHaveCount(0);
  const update = page.getByRole("button", {
    name: "Update character",
    exact: true,
  });
  await expect(update).toBeVisible();
  const first = guild
    .doc()
    .state.characters.find((c) => c.name === "Oakheart")!;
  expect(first).toMatchObject({
    ownerBattleNet: member.id,
    role: "ranged",
    spec: "Survival",
  });

  await page.reload();
  await update.click();
  const dialog = page.getByRole("dialog", {
    name: "Update Oakheart’s gear & builds",
  });
  await dialog
    .getByRole("textbox", { name: "Character export" })
    .fill(characterExport("Oakheart", 31));
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(
    dialog.getByRole("button", { name: "Edit role, spec & buffs" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Save character" }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto("/#roster");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Oakheart.*Level 31/ }),
  ).toBeVisible();
  expect(
    guild.doc().state.characters.filter((c) => c.ownerBattleNet === member.id),
  ).toHaveLength(1);
  expect(
    guild.doc().state.characters.find((c) => c.id === first.id)?.snapshot
      ?.level,
  ).toBe(31);
});

test("multiple owned characters can switch, reject a mismatched export, and update only the selected character", async ({
  page,
}) => {
  const guild = testGuild(2);
  await guild.open(page, member);
  await page
    .getByRole("button", { name: "Update character", exact: true })
    .click();
  const chooser = page.getByRole("dialog", { name: "Choose your character" });
  await expect(chooser.getByRole("button", { name: /Skyward/ })).toHaveCount(0);
  await expect(
    chooser.getByRole("button", { name: "Import another character" }),
  ).toBeVisible();
  await chooser.getByRole("button", { name: /Frostleaf/ }).click();
  const first = page.getByRole("dialog", {
    name: "Update Frostleaf’s gear & builds",
  });
  await first.getByRole("textbox").fill(characterExport("Mosshorn"));
  await first.getByRole("button", { name: "Continue" }).click();
  await expect(first.getByRole("alert")).toContainText(
    "different character or realm",
  );
  await first
    .getByRole("textbox")
    .fill(
      characterExport("Frostleaf").replace(
        "server=demo_realm",
        "server=other_realm",
      ),
    );
  await first.getByRole("button", { name: "Continue" }).click();
  await expect(first.getByRole("alert")).toContainText("other_realm");
  expect(guild.changes).toHaveLength(0);
  await first.getByRole("button", { name: "Choose another character" }).click();
  await chooser.getByRole("button", { name: /Mosshorn/ }).click();
  const second = page.getByRole("dialog", {
    name: "Update Mosshorn’s gear & builds",
  });
  await expect(second.getByRole("textbox")).toHaveValue("");
  await second.getByRole("textbox").fill(characterExport("Mosshorn", 32));
  await second.getByRole("button", { name: "Continue" }).click();
  await second.getByRole("button", { name: "Save character" }).click();
  await expect(second).toHaveCount(0);
  expect(guild.changes).toHaveLength(1);
  expect(guild.changes[0]).toMatchObject({
    type: "character.import",
    characterId: "mosshorn",
  });
  await page.goto("/#roster");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Mosshorn.*Level 32/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Frostleaf.*Level 30/ }),
  ).toBeVisible();
});

test("RSVP and volunteer for materials on the overview, then reload", async ({
  page,
}) => {
  const guild = testGuild(1);
  await guild.open(page, member);
  const raid = page.getByRole("region", { name: "Upcoming raid" });
  const confirmed = raid
    .locator("dl > div")
    .filter({ has: page.getByText("Confirmed", { exact: true }) })
    .locator("dd");
  await expect(confirmed).toHaveText("0");
  const going = raid.getByRole("button", { name: "Going", exact: true });
  await going.click();
  await expect(going).toHaveAttribute("aria-pressed", "true");
  await expect(confirmed).toHaveText("1");
  const take = page.getByRole("button", {
    name: /take this request for Dreamfoil/i,
  });
  await take.click();
  await expect(take).toHaveCount(0);
  await page.reload();
  await expect(going).toHaveAttribute("aria-pressed", "true");
  await expect(confirmed).toHaveText("1");
  await expect(
    page.getByText(member.label + " · 10 still needed"),
  ).toBeVisible();
  expect(guild.changes.map((a) => a.type)).toEqual([
    "event.signup",
    "material.claim",
  ]);
});

test("gear details inside a character dialog respond to touch, keyboard, and the persistent item cache", async ({
  page,
}, info) => {
  const guild = testGuild(1);
  await guild.open(page, member, "#roster");
  const character = page.getByRole("dialog", {
    name: "Frostleaf",
    exact: true,
  });
  const shoulders = character.getByRole("button", {
    name: "Inspect Hillman's Shoulders",
  });
  const item = character.getByRole("dialog", {
    name: "Hillman's Shoulders item details",
  });
  const activateItem = () =>
    info.project.use.hasTouch ? shoulders.tap() : shoulders.click();
  for (let visit = 0; visit < 2; visit++) {
    await page.getByRole("button", { name: /Frostleaf.*Level 30/ }).click();
    await activateItem();
    await expect(
      item.getByText("A leatherworking item for the raid."),
    ).toBeVisible();
    const close = item.getByRole("button", { name: "Close item details" });
    if (info.project.use.hasTouch) await close.tap();
    else await page.keyboard.press("Escape");
    await expect(item).toHaveCount(0);
    await expect(character).toBeVisible();
    await expect(shoulders).toBeFocused();
    expect(
      guild.itemReads.filter((path) => path.startsWith("/api/items/4251?")),
    ).toHaveLength(1);
    if (visit === 0) await page.reload();
  }
});
