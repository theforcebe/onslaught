import type { Page } from "@playwright/test";
import { privateFixture } from "../tests/access-fixture";
import {
  authorizeAction,
  materialRecipient,
  project,
  updateMember,
} from "../src/lib/access";
import {
  RequestSchema,
  type Identity,
  type RaidAction,
} from "../src/lib/model";
import { applyChange, ChangeError } from "../src/lib/reducer";
import { emptyCommunity } from "../src/lib/community";
import { EXAMPLE_EXPORT } from "../src/lib/example";
import { parseSimc } from "../src/lib/parser";

export const member: Identity = {
  provider: "battlenet",
  id: "member-id",
  label: "Frostleaf#1001",
};
export const admin: Identity = {
  provider: "battlenet",
  id: "guild-admin",
  label: "Guildlead#1002",
  admin: true,
};
export const characterExport = (name: string, level = 30) =>
  EXAMPLE_EXPORT.replaceAll("Example Raider", name).replace(
    "level=30",
    "level=" + level,
  );

export function testGuild(owned: number, approved = true) {
  let doc = privateFixture();
  doc.members = approved ? [{ ...doc.members[0], label: member.label }] : [];
  const base = doc.state.characters[0];
  doc.state.characters = ["Frostleaf", "Mosshorn", "Skyward"].map(
    (name, index) => ({
      ...base,
      name,
      id: name.toLowerCase(),
      ownerBattleNet: index < owned ? member.id : "other-member",
      snapshot: parseSimc(characterExport(name)),
    }),
  );
  const start = Date.now() + 86400000;
  doc.state.events = [
    {
      ...doc.state.events[0],
      id: "guild-raid",
      title: "Guild raid night",
      start: new Date(start).toISOString(),
      end: new Date(start + 3 * 3600000).toISOString(),
      signups: {},
      signupBuilds: {},
      lineup: {},
    },
  ];
  doc.state.community = {
    ...emptyCommunity(),
    requests: [
      {
        id: "herbs",
        item: "Dreamfoil",
        quantity: 10,
        notes: "",
        recipientName: "Open to volunteers",
        openToGuild: true,
        fulfilled: 0,
        cancelled: false,
        updates: [],
        createdBy: admin.id,
        createdByName: admin.label,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  const changes: RaidAction[] = [];
  const itemReads: string[] = [];

  async function open(page: Page, identity: Identity, hash = "") {
    const token = (identity.admin ? "A" : "M").repeat(43);
    await page.addInitScript((sessionToken) => {
      if (!sessionStorage.getItem("fixture-session-started")) {
        sessionStorage.setItem(
          "onslaught:session:v1",
          JSON.stringify({
            token: sessionToken,
            expiresAt: Date.now() + 1200000,
          }),
        );
        sessionStorage.setItem("fixture-session-started", "1");
      }
    }, token);
    await page.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin === "http://127.0.0.1:5188") return route.continue();
      if (url.origin !== "https://gateway.onslaught.invalid")
        return route.abort();
      const headers = {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5188",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
      };
      const json = (body: unknown, status = 200) =>
        route.fulfill({ json: body, headers, status });
      const path = url.pathname;
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      if (path.startsWith("/api/items/")) {
        itemReads.push(path + url.search);
        const id = Number(path.split("/").pop());
        return json({
          status: "resolved",
          checkedAt: Date.now(),
          item: {
            id,
            name: id === 4251 ? "Hillman's Shoulders" : "Guild equipment",
            quality: "uncommon",
            slot: "shoulder",
            stats: [],
            item_level: 26,
            required_level: 21,
            tooltipLines: ["A leatherworking item for the raid."],
          },
        });
      }
      if (path === "/api/public") return json(project(doc));
      if (request.headers().authorization !== "Bearer " + token)
        return json({ error: "Sign in to continue." }, 401);
      try {
        switch (path) {
          case "/api/state":
            return json(project(doc, identity));
          case "/api/join":
            if (!doc.members.some((m) => m.id === identity.id)) {
              doc.members.push({
                id: identity.id,
                label: identity.label,
                status: "pending",
                role: "guild_member",
                sections: [],
                allTeams: false,
                teamIds: [],
              });
              doc.state.revision++;
            }
            return json(project(doc, identity));
          case "/api/members":
            doc = updateMember(doc, identity, request.postDataJSON());
            return json(project(doc, identity));
          case "/api/change": {
            const input = RequestSchema.parse(request.postDataJSON());
            const actor = authorizeAction(doc, identity, input.action);
            doc.state = applyChange(doc.state, input, actor, undefined, {
              recipientName: materialRecipient(doc, input.action),
            });
            changes.push(input.action);
            return json(project(doc, identity));
          }
          case "/api/chat/status":
            return json({
              people: [],
              unread: {},
              discord: { linked: false, enabled: false },
            });
          case "/api/chat/messages":
            return json({ messages: [], hasMore: false });
          case "/api/discord/status":
            return json({ ownLink: null });
          default:
            return json({ error: "Unconfigured test endpoint: " + path }, 404);
        }
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Request failed" },
          error instanceof ChangeError ? error.status : 400,
        );
      }
    });
    await page.goto("/" + hash);
  }
  return { open, doc: () => doc, changes, itemReads };
}
