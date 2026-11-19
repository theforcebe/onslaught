import type { GuildDocument } from "../src/lib/access";
import type { RaidAction, RaidEvent } from "../src/lib/model";
import { config, DiscordError, discordFetch } from "./discord";
import { raidMessageBody } from "./raid-message";
import { bootstrapAdminMemberIds } from "./battlenet-identity";
import type { Env } from "./worker";

type ReadGuild = (env: Env) => Promise<{ document: GuildDocument }>;
type Publication = {
  guild_id: string;
  channel_id: string;
  message_id: string;
  scheduled_id: string | null;
  interactive: number;
};
export type DiscordNameGrant = {
  guildId: string;
  channelId: string;
  messageId: string;
  memberId: string;
  characterId: string;
};

// Only enqueue published messages (a manual publish enqueues its own refresh
// after recording the message). More recent saves keep an existing retry delay.
function enqueue(env: Env, id: string, reset: boolean) {
  return env.DB.prepare(
    `INSERT INTO discord_raid_chart_queue(event_id)
     SELECT event_id FROM discord_raid_signups WHERE event_id=? AND message_id IS NOT NULL
     ON CONFLICT(event_id) DO UPDATE SET generation=generation+1,
       retry_at=CASE WHEN ? THEN 0 ELSE retry_at END,
       failures=CASE WHEN ? THEN 0 ELSE failures END`,
  ).bind(id, Number(reset), Number(reset));
}
export async function queueRaidChart(env: Env, eventId: string, reset = false) {
  await enqueue(env, eventId, reset).run();
}
export async function setChartName(
  env: Env,
  eventId: string,
  name: DiscordNameGrant,
  enabled: boolean,
) {
  const scope = [eventId, name.guildId, name.channelId, name.messageId];
  if (!enabled) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO discord_raid_chart_withdrawals(message_id,character_id,withdrawn_at)
        SELECT message_id,?,? FROM discord_raid_signups WHERE event_id=? AND guild_id=? AND channel_id=? AND message_id=?
        ON CONFLICT(message_id,character_id) DO UPDATE SET withdrawn_at=MAX(withdrawn_at,excluded.withdrawn_at)`,
      ).bind(name.characterId, Date.now(), ...scope),
      env.DB.prepare(
        `DELETE FROM discord_raid_chart_names WHERE character_id=? AND member_id=?
        AND message_id IN (SELECT message_id FROM discord_raid_signups WHERE event_id=? AND guild_id=? AND channel_id=? AND message_id=?)`,
      ).bind(name.characterId, name.memberId, ...scope),
      enqueue(env, eventId, false),
    ]);
    return;
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO discord_raid_chart_names(message_id,character_id,member_id)
       SELECT message_id,?,? FROM discord_raid_signups
       WHERE event_id=? AND guild_id=? AND channel_id=? AND message_id=?
       ON CONFLICT(message_id,character_id) DO UPDATE SET member_id=excluded.member_id`,
    ).bind(name.characterId, name.memberId, ...scope),
    enqueue(env, eventId, false),
  ]);
}

export async function chartVisibleIds(
  env: Env,
  eventId: string,
  guildId: string,
  channelId: string,
  messageId: string | null,
  document: GuildDocument,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const hidden = new Map<string, string | null>();
  if (messageId) {
    const { results } = await env.DB.prepare(
      `SELECT w.character_id, n.member_id FROM discord_raid_signups s
       LEFT JOIN discord_raid_chart_withdrawals w ON w.message_id=s.message_id
       LEFT JOIN discord_raid_chart_names n ON n.message_id=s.message_id AND n.character_id=w.character_id
       WHERE s.event_id=? AND s.guild_id=? AND s.channel_id=? AND s.message_id=?`,
    )
      .bind(eventId, guildId, channelId, messageId)
      .all<{ character_id: string | null; member_id: string | null }>();
    if (!results.length) return ids;
    for (const row of results)
      if (row.character_id) hidden.set(row.character_id, row.member_id);
  }
  const active = new Set(
    document.members.filter((m) => m.status === "active").map((m) => m.id),
  );
  const event = document.state.events.find((e) => e.id === eventId);
  if (!event) return ids;
  for (const id of await bootstrapAdminMemberIds(env)) active.add(id);
  for (const c of document.state.characters) {
    if (!Object.hasOwn(event.signups, c.id)) continue;
    if (c.ownerBattleNet && !active.has(c.ownerBattleNet)) continue;
    if (
      hidden.has(c.id) &&
      (!c.ownerBattleNet || hidden.get(c.id) !== c.ownerBattleNet)
    )
      continue;
    ids.add(c.id);
  }
  return ids;
}

export function affectedRaidCharts(events: RaidEvent[], action: RaidAction) {
  if (action.type === "event.signup") return [action.eventId];
  if (action.type === "event.save") return [action.event.id];
  if (
    action.type === "character.import" ||
    action.type === "character.update" ||
    action.type === "character.member" ||
    action.type === "character.owner"
  )
    return events
      .filter(
        (e) => Date.parse(e.end) > Date.now() && e.signups[action.characterId],
      )
      .map((e) => e.id);
  return [];
}

export async function queueSiteCharts(
  env: Env,
  ids: string[],
  read: ReadGuild,
) {
  if (!ids.length) return;
  // A profile update can affect multiple nights. Queue all of them before
  // trying Discord. The cron drains any work beyond this request's lifetime.
  for (let offset = 0; offset < ids.length; offset += 20) {
    await env.DB.batch(
      ids.slice(offset, offset + 20).map((id) => enqueue(env, id, false)),
    );
  }
  await flushRaidCharts(env, read, ids[0]);
}

const ourLease = `EXISTS (
  SELECT 1 FROM discord_raid_signups s
  WHERE s.event_id=discord_raid_chart_queue.event_id AND s.lease_owner=?)`;
async function refreshOne(env: Env, read: ReadGuild, eventId: string) {
  const token = crypto.randomUUID();
  const now = Date.now();
  // Use the same lease as the publisher so that an older edit cannot overwrite
  // a newer Discord response. Re-read the canonical raid under that lease.
  const row = await env.DB.prepare(
    `UPDATE discord_raid_signups SET lease_owner=?,lease_until=?
     WHERE event_id=? AND lease_until<=? AND message_id IS NOT NULL AND event_id IN
     (SELECT event_id FROM discord_raid_chart_queue WHERE generation>synced_generation AND retry_at<=?)
     RETURNING guild_id,channel_id,message_id,scheduled_id,interactive`,
  )
    .bind(token, now + 120000, eventId, now, now)
    .first<Publication>();
  if (!row) return;
  try {
    const job = await env.DB.prepare(
      "SELECT generation,failures FROM discord_raid_chart_queue WHERE event_id=?",
    )
      .bind(eventId)
      .first<{ generation: number; failures: number }>();
    if (!job) return;
    try {
      const cfg = await config(env);
      let patchedAt: number | null = null;
      if (
        cfg &&
        cfg.guildId === row.guild_id &&
        cfg.pollsChannelId === row.channel_id
      ) {
        const { document } = await read(env);
        const event = document.state.events.find((e) => e.id === eventId);
        if (event && Date.parse(event.end) > Date.now()) {
          const visible = await chartVisibleIds(
            env,
            eventId,
            row.guild_id,
            row.channel_id,
            row.message_id,
            document,
          );
          const body = raidMessageBody(
            event,
            document.state.characters,
            visible,
            !!row.interactive,
            row.scheduled_id,
            row.guild_id,
          );
          // Repository reads can be slow. Verify ownership one last time and
          // allow enough time for the bounded Discord PATCH to finish.
          const held = await env.DB.prepare(
            "UPDATE discord_raid_signups SET lease_until=? WHERE event_id=? AND lease_owner=? RETURNING event_id",
          )
            .bind(Date.now() + 30000, eventId, token)
            .first();
          if (!held) return;
          const sent = await discordFetch(
            env,
            "/channels/" + row.channel_id + "/messages/" + row.message_id,
            body,
            "PATCH",
          );
          if (sent.id !== row.message_id)
            throw new Error("Discord did not confirm this chart.");
          const expected = body.embeds[0],
            shown = sent.embeds?.[0];
          if (
            (Number(sent.flags) & 4) !== 0 ||
            shown?.title !== expected.title ||
            shown?.description !== expected.description ||
            shown?.fields?.length !== expected.fields.length ||
            expected.fields.some(
              (f, i) =>
                f.name !== shown.fields[i]?.name ||
                f.value !== shown.fields[i]?.value,
            )
          )
            throw new DiscordError(
              "Discord suppressed the raid chart. Check Embed Links and update the signup.",
              false,
              403,
            );
          patchedAt = Date.now();
        }
      }
      await env.DB.prepare(
        `UPDATE discord_raid_chart_queue SET synced_generation=?,failures=0,retry_at=0,
         patched_at=COALESCE(?,patched_at) WHERE event_id=? AND ${ourLease}`,
      )
        .bind(job.generation, patchedAt, eventId, token)
        .run();
    } catch (error) {
      // Missing message, invalid credentials or missing access require manual
      // repair. A successful explicit publish resets the inactive job.
      const blocked =
        error instanceof DiscordError &&
        [401, 403, 404].includes(error.upstreamStatus);
      const wait = Math.max(
        Math.min(6 * 3600000, 30000 * 2 ** Math.min(job.failures, 10)),
        error instanceof DiscordError ? error.retryAfterMs : 0,
      );
      await env.DB.prepare(
        `UPDATE discord_raid_chart_queue SET failures=failures+1,retry_at=? WHERE event_id=? AND ${ourLease}`,
      )
        .bind(
          blocked ? Number.MAX_SAFE_INTEGER : Date.now() + wait,
          eventId,
          token,
        )
        .run();
    }
  } finally {
    await env.DB.prepare(
      "UPDATE discord_raid_signups SET lease_until=0,lease_owner=NULL WHERE event_id=? AND lease_owner=?",
    )
      .bind(eventId, token)
      .run();
  }
}

export async function flushRaidCharts(
  env: Env,
  read: ReadGuild,
  eventId?: string,
) {
  if (eventId) {
    await refreshOne(env, read, eventId);
    // A second signup may have arrived while the first PATCH was in flight.
    // Only outstanding unlocked work can acquire the second lease.
    await refreshOne(env, read, eventId);
    return;
  }
  const due = await env.DB.prepare(
    `SELECT j.event_id FROM discord_raid_chart_queue j
     JOIN discord_raid_signups s ON j.event_id=s.event_id
     WHERE j.generation>j.synced_generation AND j.retry_at<=? AND s.lease_until<=?
     ORDER BY j.retry_at,j.rowid LIMIT 3`,
  )
    .bind(Date.now(), Date.now())
    .all<{ event_id: string }>();
  for (const job of due.results) await refreshOne(env, read, job.event_id);
}
