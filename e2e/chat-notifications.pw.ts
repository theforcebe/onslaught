import { expect, test } from "@playwright/test";
import { member, testGuild } from "./guild";

test("an approved member opens an incoming DM and chooses their Discord copies", async ({
  page,
}) => {
  const guild = testGuild(1);
  await guild.open(page, member, "#discord");
  const sender = {
    id: "guild-officer",
    label: "Brightleaf#1234",
    role: "officer",
  };
  const message = {
    seq: 2,
    body: "Can you bring herbs for tonight?",
    senderId: sender.id,
    senderName: sender.label,
    sentAt: Date.now(),
    mentions: [],
  };
  let unread = true,
    discordDM = false,
    materialsDM = false;
  await page.route(
    /^https:\/\/gateway\.onslaught\.invalid\/api\/(chat|discord)\//,
    async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5188",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      const json = (body: unknown) => route.fulfill({ json: body, headers });
      const counts = () => ({
        unread: unread ? { [sender.id]: 1 } : {},
        unreadMentions: 0,
        latestNotification: unread
          ? {
              seq: message.seq,
              peer: sender.id,
              senderName: sender.label,
              kind: "dm",
            }
          : null,
      });
      switch (url.pathname) {
        case "/api/chat/status":
          return json({
            ...counts(),
            people: [sender],
            discord: { linked: true, enabled: discordDM },
          });
        case "/api/chat/messages":
          return json({
            messages:
              url.searchParams.get("peer") === sender.id &&
              !url.searchParams.has("after")
                ? [message]
                : [],
            hasMore: false,
          });
        case "/api/chat/read":
          if (request.postDataJSON().peer === sender.id) unread = false;
          return json(counts());
        case "/api/discord/status":
          return json({
            connected: true,
            linkConfigured: true,
            ownLink: {
              name: "Frostleaf",
              dmOptIn: materialsDM,
              chatDmOptIn: discordDM,
            },
          });
        case "/api/chat/preferences":
          discordDM = request.postDataJSON().discordDM;
          return json({ discord: { linked: true, enabled: discordDM } });
        case "/api/discord/preferences":
          materialsDM = request.postDataJSON().dmOptIn;
          return json({ ok: true });
        default:
          return route.fallback();
      }
    },
  );
  await page.reload();
  const connection = page.locator(".discord-link-card");
  const privateCopies = connection.getByRole("checkbox", {
    name: /Private guild chat/,
  });
  const supplyCopies = connection.getByRole("checkbox", {
    name: /Assigned material requests/,
  });
  await expect(privateCopies).not.toBeChecked();
  await supplyCopies.check();
  await expect(privateCopies).not.toBeChecked();
  await privateCopies.check();
  const launcher = page.locator(".chat-launcher");
  await expect(launcher).toContainText("1");
  await launcher.click();
  const messenger = page.getByRole("dialog", { name: "Guild messenger" });
  await expect(
    messenger.getByRole("log", { name: "Private conversation" }),
  ).toContainText(message.body);
  await expect(
    messenger.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveAttribute("placeholder", /Brightleaf/);
  await messenger
    .getByRole("button", { name: "Chat notification settings" })
    .click();
  const forwarded = messenger.getByRole("checkbox", {
    name: /Receive private chat copies/,
  });
  await expect(forwarded).toBeChecked();
  await forwarded.uncheck();
  await messenger.getByRole("button", { name: "Minimize guild chat" }).click();
  await expect(privateCopies).not.toBeChecked({ timeout: 3000 });
  await expect(supplyCopies).toBeChecked();
});
