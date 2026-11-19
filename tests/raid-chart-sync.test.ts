import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chatDatabase } from "./chat-db";
import { privateFixture } from "./access-fixture";
import {
  affectedRaidCharts,
  chartVisibleIds,
  flushRaidCharts,
  queueRaidChart,
  queueSiteCharts,
  setChartName,
} from "../server/raid-chart-sync";
import type { Env } from "../server/worker";

const dbs: ReturnType<typeof chatDatabase>[] = [];
const guildId = "100000000000000001",
  channelId = "100000000000000002",
  messageId = "100000000000000003";
const schema = readFileSync("server/raid-signups.sql", "utf8");
function fixture() {
  const db = chatDatabase();
  dbs.push(db);
  const { sqlite } = db;
  sqlite.exec(schema);
  sqlite.prepare("INSERT INTO discord_config VALUES('guild',?)").run(
    JSON.stringify({
      guildId,
      pollsChannelId: channelId,
      requestsChannelId: channelId,
      announcementsChannelId: channelId,
    }),
  );
  const doc = privateFixture(),
    event = doc.state.events[0];
  event.end = new Date(Date.now() + 1e7).toISOString();
  const member = doc.members[0],
    character = doc.state.characters[0];
  event.signups = { [character.id]: "going" };
  sqlite
    .prepare(
      "INSERT INTO discord_raid_signups(event_id,guild_id,channel_id,message_id,interactive) VALUES(?,?,?,?,1)",
    )
    .run(event.id, guildId, channelId, messageId);
  const env = { DB: db.db, DISCORD_BOT_TOKEN: "fixture" } as Env;
  const read = vi.fn(async () => ({ document: doc }));
  const job = () =>
    sqlite
      .prepare("SELECT * FROM discord_raid_chart_queue WHERE event_id=?")
      .get(event.id);
  const name = {
    guildId,
    channelId,
    messageId,
    memberId: member.id,
    characterId: character.id,
  };
  return { db, sqlite, doc, event, member, character, env, read, job, name };
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const { sqlite } of dbs.splice(0)) sqlite.close();
});
function echoPatch(url: string, init: RequestInit) {
  expect(url).toBe(
    "https://discord.com/api/v10/channels/" +
      channelId +
      "/messages/" +
      messageId,
  );
  expect(init.method).toBe("PATCH");
  return Response.json({ id: messageId, ...JSON.parse(String(init.body)) });
}

describe("Discord chart refresh", () => {
  it("keeps a withdrawn name hidden on stale Discord retries and accepts a later deliberate opt-in", async () => {
    const { env, doc, event, character, name } = fixture();
    const visible = () =>
      chartVisibleIds(env, event.id, guildId, channelId, messageId, doc);
    expect(await visible()).toEqual(new Set([character.id]));
    await setChartName(env, event.id, name, false);
    await queueRaidChart(env, event.id);
    expect(await visible()).toEqual(new Set());
    await setChartName(env, event.id, name, true);
    expect(await visible()).toEqual(new Set([character.id]));
    await setChartName(env, event.id, name, false);
    await queueRaidChart(env, event.id);
    expect(await visible()).toEqual(new Set());
  });
  it("upgrades an open registered message with the existing roster", async () => {
    const { env, read, event, character, job, sqlite } = fixture();
    sqlite.exec(schema); // simulate an existing publication during rollout
    const patch = vi.fn(echoPatch);
    vi.stubGlobal("fetch", patch);
    await flushRaidCharts(env, read);
    expect(job()).toMatchObject({
      generation: 1,
      synced_generation: 1,
      failures: 0,
      patched_at: expect.any(Number),
    });
    expect(patch.mock.calls[0][1].body).toContain(character.name);
    expect(patch.mock.calls[0][1].body).toContain("raid:chart:going");
    sqlite.exec(schema); // another deploy and cron tick leave the acknowledged message alone
    await flushRaidCharts(env, read, event.id);
    expect(patch).toHaveBeenCalledTimes(1);
  });
  it("checks the current owner, membership and exact message for each named participant", async () => {
    const { env, read, event, doc, character, member, job, name } = fixture();
    await setChartName(
      env,
      event.id,
      {
        ...name,
        messageId: "100000000000000004",
      },
      false,
    );
    const visible = () =>
      chartVisibleIds(env, event.id, guildId, channelId, messageId, doc);
    expect(
      await chartVisibleIds(
        env,
        event.id,
        guildId,
        channelId,
        "100000000000000004",
        doc,
      ),
    ).toEqual(new Set());
    await queueRaidChart(env, event.id);
    expect(await visible()).toEqual(new Set([character.id]));
    const patch = vi.fn(echoPatch);
    vi.stubGlobal("fetch", patch);
    await flushRaidCharts(env, read, event.id);
    expect(patch.mock.calls[0][1].body).toContain(character.name);
    expect(patch.mock.calls[0][1].body).not.toContain(member.label);
    member.status = "suspended";
    expect(await visible()).toEqual(new Set());
    member.status = "active";
    character.ownerBattleNet = "someone-else";
    const ids = affectedRaidCharts(doc.state.events, {
      type: "character.member",
      memberId: "someone-else",
      characterId: character.id,
    });
    await queueSiteCharts(env, ids, read);
    expect(patch.mock.calls.at(-1)![1].body).not.toContain(character.name);
    expect(job()?.synced_generation).toBe(job()?.generation);
  });
  it("drains a newer RSVP even if it arrives during an earlier PATCH", async () => {
    const { env, read, event, doc, character, job } = fixture();
    let first = true;
    const patch = vi.fn(async (url: string, init: RequestInit) => {
      if (first) {
        first = false;
        event.signups[character.id] = "tentative";
        await queueSiteCharts(
          env,
          affectedRaidCharts(doc.state.events, {
            type: "event.signup",
            eventId: event.id,
            characterId: character.id,
            status: "tentative",
          }),
          read,
        );
      }
      return echoPatch(url, init);
    });
    vi.stubGlobal("fetch", patch);
    await queueSiteCharts(env, [event.id], read);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[0][1].body).toContain("1 going");
    expect(patch.mock.calls[1][1].body).toContain("1 maybe");
    expect(job()).toMatchObject({ generation: 2, synced_generation: 2 });
  });
  it("honors Discord backoff without clearing a pending update and recovers by cron", async () => {
    const { env, read, event, sqlite, job } = fixture();
    const fetcher = vi.fn(echoPatch).mockImplementationOnce(
      () =>
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "120" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const start = Date.now();
    await queueSiteCharts(env, [event.id], read);
    expect(job()?.retry_at).toBeGreaterThanOrEqual(start + 120000);
    expect(job()?.patched_at).toBeNull();
    await queueSiteCharts(env, [event.id], read);
    expect(fetcher).toHaveBeenCalledTimes(1);
    sqlite.prepare("UPDATE discord_raid_chart_queue SET retry_at=0").run();
    await flushRaidCharts(env, read);
    expect(job()).toMatchObject({
      generation: 2,
      synced_generation: 2,
      failures: 0,
      patched_at: expect.any(Number),
    });
  });
  it.each([403, 404, "hidden"])(
    "requires manual repair after inaccessible or suppressed messages (%s)",
    async (reason) => {
      const { env, read, event, job } = fixture();
      const request = vi
        .fn(echoPatch)
        .mockImplementationOnce(() =>
          typeof reason === "number"
            ? new Response(null, { status: reason })
            : Response.json({ id: messageId, embeds: [] }),
        );
      vi.stubGlobal("fetch", request);
      await queueSiteCharts(env, [event.id], read);
      expect(job()?.retry_at).toBe(Number.MAX_SAFE_INTEGER);
      expect(job()?.patched_at).toBeNull();
      await queueSiteCharts(env, [event.id], read);
      expect(request).toHaveBeenCalledTimes(1);
      await queueRaidChart(env, event.id, true);
      await flushRaidCharts(env, read, event.id);
      expect(request).toHaveBeenCalledTimes(2);
      expect(job()?.patched_at).toEqual(expect.any(Number));
    },
  );
  it("ignores unrelated registrations, ended raids and moved channels", async () => {
    const { env, read, event, sqlite, job } = fixture();
    const patch = vi.fn(echoPatch);
    vi.stubGlobal("fetch", patch);
    await queueSiteCharts(env, ["missing"], read);
    expect(read).not.toHaveBeenCalled();
    event.end = new Date(Date.now() - 360000).toISOString();
    await queueSiteCharts(env, [event.id], read);
    expect(job()?.patched_at).toBeNull();
    event.end = new Date(Date.now() + 360000).toISOString();
    sqlite
      .prepare(
        "UPDATE discord_raid_signups SET channel_id='100000000000000009'",
      )
      .run();
    await queueSiteCharts(env, [event.id], read);
    expect(patch).not.toHaveBeenCalled();
  });
});
