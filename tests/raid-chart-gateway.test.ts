import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import worker, { digest, type Env } from "../server/worker";
import type { RaidBuild, RaidEvent } from "../src/lib/model";
import type { raidSignupEmbed } from "../server/raid-chart";
import { privateFixture } from "./access-fixture";
import { chatDatabase } from "./chat-db";

describe("website RSVP to the published Discord signup", () => {
  it("edits the existing post when a web member changes roles, attendance or their character’s name visibility", async () => {
    const { sqlite, db } = chatDatabase();
    try {
      sqlite.exec(readFileSync("server/raid-signups.sql", "utf8"));
      const guild = "110000000000000001",
        channel = "110000000000000002",
        post = "110000000000000003";
      let guildDoc = privateFixture();
      const member = guildDoc.members[0],
        character = guildDoc.state.characters[0],
        event = guildDoc.state.events[0];
      member.sections = [];
      member.teamIds = [];
      character.name = "Private web druid";
      character.class = "druid";
      character.role = "tank";
      character.spec = "Feral";
      const main: RaidBuild = { role: "tank", spec: "Feral" };
      const alternate: RaidBuild = { role: "healer", spec: "Restoration" };
      character.alternateBuilds = [alternate];
      event.start = new Date(Date.now() + 86400000).toISOString();
      event.end = new Date(Date.now() + 93600000).toISOString();
      event.signups = {};
      event.signupBuilds = {};
      sqlite.prepare("INSERT INTO discord_config VALUES('guild',?)").run(
        JSON.stringify({
          guildId: guild,
          pollsChannelId: channel,
          requestsChannelId: channel,
          announcementsChannelId: channel,
        }),
      );
      sqlite
        .prepare(
          "INSERT INTO discord_raid_signups(event_id,guild_id,channel_id,message_id,interactive) VALUES(?,?,?,?,1)",
        )
        .run(event.id, guild, channel, post);
      const session = randomBytes(32).toString("base64url");
      sqlite.prepare("INSERT INTO auth_records VALUES(?,?,?)").run(
        "session:" + (await digest(session)),
        JSON.stringify({
          id: member.id,
          subject: "456",
          label: member.label,
        }),
        Date.now() + 3600000,
      );
      const env: Env = {
        DB: db,
        APP_ORIGIN: "https://guild.example",
        PUBLIC_API_URL: "https://gateway.example",
        GITHUB_REPOSITORY: "test/guild",
        GITHUB_TOKEN: "github_pat_" + "t".repeat(60),
        BNET_CLIENT_ID: "fixture",
        BNET_CLIENT_SECRET: "fixture",
        IDENTITY_KEY: "fixture",
        ADMIN_BNET_IDS: "",
        DISCORD_BOT_TOKEN: "fixture",
      };
      const repo = "https://api.github.com/repos/test/guild";
      const file = repo + "/contents/data/guild.json";
      const message =
        "https://discord.com/api/v10/channels/" + channel + "/messages/" + post;
      const edits: {
        method: string;
        url: string;
        body: string;
        embed: ReturnType<typeof raidSignupEmbed>;
      }[] = [];
      const upstream = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === repo) return Response.json({ private: true });
        if (url === file + "?ref=main")
          return Response.json({
            sha: String(guildDoc.state.revision),
            content: Buffer.from(JSON.stringify(guildDoc)).toString("base64"),
          });
        if (url === file && init?.method === "PUT") {
          const body = JSON.parse(String(init.body));
          expect(body.sha).toBe(String(guildDoc.state.revision));
          guildDoc = JSON.parse(
            Buffer.from(body.content, "base64").toString("utf8"),
          );
          return Response.json({});
        }
        if (url.startsWith("https://discord.com/")) {
          const payload = JSON.parse(String(init?.body));
          edits.push({
            url,
            method: init?.method ?? "GET",
            body: String(init?.body),
            embed: payload.embeds?.[0],
          });
          return Response.json({ id: post, embeds: payload.embeds });
        }
        throw new Error("Unexpected upstream: " + url);
      });
      vi.stubGlobal("fetch", upstream);
      const headers = {
        Origin: env.APP_ORIGIN,
        Authorization: "Bearer " + session,
        "Content-Type": "application/json",
        Accept: "application/vnd.onslaught.guild-v2+json",
      };
      async function gateway(path: string, body?: unknown) {
        const wait: Promise<unknown>[] = [];
        const ctx = {
          waitUntil: (task: Promise<unknown>) => wait.push(task),
        } as unknown as ExecutionContext;
        const response = await worker.fetch(
          new Request(env.PUBLIC_API_URL + path, {
            headers,
            method: body === undefined ? "GET" : "POST",
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
          env,
          ctx,
        );
        await Promise.all(wait);
        return { response, background: wait.length };
      }
      const signupPath = "/api/discord/raid-signup";
      const visibility = (
        listed: boolean,
        characterId = character.id,
        messageId = post,
      ) =>
        gateway(signupPath + "/visibility", {
          eventId: event.id,
          characterId,
          messageId,
          listed,
        });
      const receipt = async () => {
        const { response } = await gateway(
          signupPath + "?eventId=" + encodeURIComponent(event.id),
        );
        expect(response.status).toBe(200);
        return response.json();
      };
      async function respond(
        status: RaidEvent["signups"][string],
        build: RaidBuild,
      ) {
        const revision = guildDoc.state.revision,
          priorEdits = edits.length;
        const { response, background } = await gateway("/api/change", {
          version: 1,
          id: crypto.randomUUID(),
          expectedRevision: revision,
          action: {
            type: "event.signup",
            eventId: event.id,
            characterId: character.id,
            status,
            build,
          },
        });
        expect(response.status).toBe(200);
        expect(guildDoc.state.revision).toBe(revision + 1);
        expect(guildDoc.state.events[0].signupBuilds?.[character.id]).toEqual(
          build,
        );
        expect(background).toBeGreaterThan(0);
        expect(edits).toHaveLength(priorEdits + 1);
        expect(edits.at(-1)).toMatchObject({ url: message, method: "PATCH" });
        expect(edits.at(-1)!.body).not.toContain(character.name);
        expect(edits.at(-1)!.body).not.toContain(member.label);
        expect(
          sqlite
            .prepare(
              "SELECT failures,generation=synced_generation AS synced FROM discord_raid_chart_queue WHERE event_id=?",
            )
            .get(event.id),
        ).toMatchObject({ failures: 0, synced: 1 });
        return edits.at(-1)!.embed;
      }
      expect((await visibility(true)).response.status).toBe(409);
      expect(edits).toHaveLength(0);
      const tank = await respond("going", main);
      expect(tank.fields.map((f) => f.name)).toContain("🛡️ Tanks · 1");
      const healer = await respond("going", alternate);
      expect(healer.description).toContain("**1 going**");
      expect(healer.fields.map((f) => f.name)).toEqual([
        "🛡️ Tanks · 0",
        "💚 Healers · 1",
        "⚔️ Melee · 0",
        "🏹 Ranged · 0",
      ]);
      expect(await receipt()).toMatchObject({
        myListedCharacters: [],
        canPublish: false,
      });
      const listed = await visibility(true);
      expect(listed.response.status).toBe(200);
      expect(listed.background).toBeGreaterThan(0);
      expect(edits).toHaveLength(3);
      expect(
        edits.at(-1)!.embed.fields.find((f) => f.name.includes("Healers"))
          ?.value,
      ).toContain("**" + character.name + "** · Restoration · Alternate");
      expect(edits.at(-1)!.body).not.toContain(member.label);
      expect(await receipt()).toMatchObject({
        myListedCharacters: [character.id],
        canPublish: false,
      });
      expect(
        (await visibility(true, guildDoc.state.characters[1].id)).response
          .status,
      ).toBe(403);
      expect(
        (await visibility(false, character.id, "110000000000000099")).response
          .status,
      ).toBe(409);
      expect(edits).toHaveLength(3);
      expect(await receipt()).toMatchObject({
        myListedCharacters: [character.id],
      });
      expect((await visibility(false)).response.status).toBe(200);
      expect(edits).toHaveLength(4);
      expect(edits.at(-1)!.embed).toEqual(healer);
      expect(edits.at(-1)!.body).not.toContain(character.name);
      expect(await receipt()).toMatchObject({ myListedCharacters: [] });
      const maybe = await respond("tentative", alternate);
      expect(maybe.description).toBe("**0 going** · 1 maybe · 0 unavailable");
      expect(maybe.fields.map((f) => f.name)).toContain("💚 Healers · 0");
      expect(
        edits.every((edit) => edit.method === "PATCH" && edit.url === message),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      sqlite.close();
    }
  });
});
