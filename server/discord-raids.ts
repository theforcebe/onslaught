import { z } from "zod";
import {
  accessFor,
  hasSection,
  hasTeam,
  type GuildDocument,
} from "../src/lib/access";
import type { Identity, RaidEvent } from "../src/lib/model";
import { ChangeError } from "../src/lib/reducer";
import { config, DiscordError, discordFetch } from "./discord";
import { classEmojis } from "./class-emojis";
import {
  attendanceLabels,
  calendarUrl,
  raidMessageBody,
  raidUrl,
} from "./raid-message";
import {
  chartVisibleIds,
  queueRaidChart,
  setChartName,
} from "./raid-chart-sync";
import type { Env } from "./worker";

export const signupPath = "/api/discord/raid-signup";
export const interactionPath = "/discord/interactions";
export { raidUrl, attendanceLabels };
export type Attendance = keyof typeof attendanceLabels;
export const snowflake = z.string().regex(/^\d{17,20}$/);
export const publicKeyRecord = "raid-interaction-public-key";
const eventInput = z
  .object({ eventId: z.string().regex(/^[\w-]{1,100}$/) })
  .strict();

type SignupRow = {
  event_id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  scheduled_id: string | null;
  interactive: number;
  notice: string | null;
  message_attempt: number;
};
type ReadDeps = {
  json: (data: unknown, status?: number) => Response;
  authenticated: (req: Request, env: Env) => Promise<Identity>;
  readRepository: (env: Env) => Promise<{ document: GuildDocument }>;
  boundedJSON: (req: Request) => Promise<unknown>;
  limit: (env: Env, key: string, max: number) => Promise<void>;
  refreshChart?: (eventId: string) => void;
};
const rowFor = (env: Env, eventId: string) =>
  env.DB.prepare("SELECT * FROM discord_raid_signups WHERE event_id=?")
    .bind(eventId)
    .first<SignupRow>();
function display(row: SignupRow | null) {
  return row?.message_id
    ? {
        messageId: row.message_id,
        url:
          "https://discord.com/channels/" +
          row.guild_id +
          "/" +
          row.channel_id +
          "/" +
          row.message_id,
        scheduledEventUrl: row.scheduled_id
          ? calendarUrl(row.guild_id, row.scheduled_id)
          : undefined,
        interactive: !!row.interactive,
        notice: row.notice || undefined,
      }
    : null;
}
export async function setupInteractions(env: Env, register: boolean) {
  const endpoint = env.PUBLIC_API_URL + interactionPath;
  const app = await discordFetch(env, "/applications/@me");
  if (
    !env.DISCORD_CLIENT_ID ||
    app.id !== env.DISCORD_CLIENT_ID ||
    !/^[a-f0-9]{64}$/i.test(app.verify_key)
  )
    throw new ChangeError(
      "Check that the bot and Discord connection use the same application.",
      503,
    );
  // Discord validates the URL with a signed PING before accepting the PATCH.
  await env.DB.prepare(
    "INSERT INTO discord_config(key,payload) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",
  )
    .bind(
      publicKeyRecord,
      JSON.stringify({ appId: app.id, key: app.verify_key }),
    )
    .run();
  if (app.interactions_endpoint_url === endpoint) return { interactive: true };
  if (app.interactions_endpoint_url || !register)
    return {
      interactive: false,
      notice: app.interactions_endpoint_url
        ? "This Discord app already has a different interactions endpoint. An admin can review the app in the Discord Developer Portal."
        : "Ask a guild admin to enable Discord signup buttons.",
    };
  try {
    const updated = await discordFetch(
      env,
      "/applications/@me",
      { interactions_endpoint_url: endpoint },
      "PATCH",
    );
    if (updated.interactions_endpoint_url === endpoint)
      return { interactive: true };
  } catch {
    /* Provide the manual setup path alongside a working site link. */
  }
  return {
    interactive: false,
    notice:
      "Set the Discord application's Interactions Endpoint URL to " +
      endpoint +
      " and refresh this signup.",
  };
}
async function calendar(env: Env, event: RaidEvent, row: SignupRow) {
  const url = raidUrl(event.id);
  const resource = "/guilds/" + row.guild_id + "/scheduled-events";
  const payload = {
    name: event.title.slice(0, 100),
    scheduled_start_time: event.start,
    scheduled_end_time: event.end,
    privacy_level: 2,
    entity_type: 3,
    entity_metadata: {
      location: (event.instance || "WoW Forever").slice(0, 100),
    },
    description:
      "Confirm your attendance and choose your character in the raid signup.\n" +
      url,
  };
  if (Date.parse(event.start) <= Date.now())
    return {
      id: row.scheduled_id,
      notice: row.scheduled_id
        ? undefined
        : "This raid has started, so its Discord calendar event cannot be created.",
    };
  try {
    // Reconcile by a unique site URL before creating, including after a lost response.
    let id = row.scheduled_id;
    if (!id) {
      const events = await discordFetch(env, resource);
      id = events.find(
        (e: { creator_id: string; description?: string }) =>
          e.creator_id === env.DISCORD_CLIENT_ID &&
          e.description?.split("\n").includes(url),
      )?.id;
    }
    const result = await discordFetch(
      env,
      id ? resource + "/" + id : resource,
      payload,
      id ? "PATCH" : "POST",
    );
    return { id: snowflake.parse(result.id) };
  } catch (e) {
    return {
      id: row.scheduled_id,
      notice:
        e instanceof DiscordError && e.status === 403
          ? "Give the bot Create Events in the server to publish the calendar event, then refresh this signup."
          : "The Discord calendar event could not be confirmed. Refresh this signup to retry.",
    };
  }
}
async function publish(
  env: Env,
  document: GuildDocument,
  event: RaidEvent,
  admin: boolean,
) {
  const cfg = await config(env);
  if (!cfg)
    throw new ChangeError("Connect the Discord scheduling channel first.", 409);
  const { guildId, pollsChannelId: channelId } = cfg;
  const channel = await discordFetch(env, "/channels/" + channelId);
  if (channel.guild_id !== guildId)
    throw new ChangeError("Check the Discord scheduling channel.", 409);
  const lock = crypto.randomUUID(),
    now = Date.now();
  const row = await env.DB.prepare(
    "INSERT INTO discord_raid_signups(event_id,guild_id,channel_id,lease_until,lease_owner) VALUES(?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET lease_until=excluded.lease_until,lease_owner=excluded.lease_owner WHERE lease_until<? RETURNING *",
  )
    .bind(event.id, guildId, channelId, now + 120000, lock, now)
    .first<SignupRow>();
  if (!row)
    throw new ChangeError(
      "This signup is being published. Refresh in a moment.",
      409,
    );
  try {
    if (row.guild_id !== guildId || row.channel_id !== channelId)
      throw new ChangeError(
        "This raid was published to a different scheduling channel.",
        409,
      );
    const setting = await setupInteractions(env, admin).catch(() => ({
      interactive: false,
      notice:
        "Discord buttons are unavailable. Members can sign up using the raid planner link.",
    }));
    const scheduled = await calendar(env, event, row);
    if (scheduled.id && scheduled.id !== row.scheduled_id)
      await env.DB.prepare(
        "UPDATE discord_raid_signups SET scheduled_id=? WHERE event_id=? AND lease_owner=?",
      )
        .bind(scheduled.id, event.id, lock)
        .run();
    const resource = "/channels/" + channelId + "/messages";
    let messageId = row.message_id;
    if (!messageId && row.message_attempt) {
      const since = String(
        (BigInt(row.message_attempt - 2000) - 1420070400000n) << 22n,
      );
      const recent = await discordFetch(
        env,
        resource + "?after=" + since + "&limit=100",
      );
      messageId = recent.find(
        (msg: {
          author: { id: string };
          components?: Array<{ components: Array<{ url?: string }> }>;
        }) =>
          msg.author.id === env.DISCORD_CLIENT_ID &&
          msg.components?.some((group) =>
            group.components.some((button) => button.url === raidUrl(event.id)),
          ),
      )?.id;
      if (
        !messageId &&
        (recent.length === 100 || Date.now() - row.message_attempt < 10000)
      )
        throw new ChangeError(
          "Discord delivery is unconfirmed. Check the scheduling channel before retrying.",
          409,
        );
    }
    if (!messageId)
      await env.DB.prepare(
        "UPDATE discord_raid_signups SET message_attempt=? WHERE event_id=? AND lease_owner=?",
      )
        .bind(Date.now(), event.id, lock)
        .run();
    const visible = await chartVisibleIds(
      env,
      event.id,
      guildId,
      channelId,
      messageId,
      document,
    );
    const body = raidMessageBody(
      event,
      document.state.characters,
      visible,
      setting.interactive,
      scheduled.id,
      guildId,
      await classEmojis(env),
    );
    const sent = await discordFetch(
      env,
      messageId ? resource + "/" + messageId : resource,
      body,
      messageId ? "PATCH" : "POST",
    );
    const notice = [setting.notice, scheduled.notice].filter(Boolean).join(" ");
    await env.DB.prepare(
      "UPDATE discord_raid_signups SET message_id=?, interactive=?, notice=?, message_attempt=0 WHERE event_id=? AND lease_owner=?",
    )
      .bind(
        snowflake.parse(sent.id),
        Number(setting.interactive),
        notice,
        event.id,
        lock,
      )
      .run();
    // Also pick up signups saved while this post was first being created.
    await queueRaidChart(env, event.id, true).catch(() => {});
    return display(await rowFor(env, event.id));
  } finally {
    await env.DB.prepare(
      "UPDATE discord_raid_signups SET lease_until=0,lease_owner=NULL WHERE event_id=? AND lease_owner=?",
    )
      .bind(event.id, lock)
      .run();
  }
}
export async function handleRaidPublish(req: Request, env: Env, d: ReadDeps) {
  const url = new URL(req.url);
  const visibilityPath = signupPath + "/visibility";
  if (
    ![signupPath, signupPath + "/setup", visibilityPath].includes(url.pathname)
  )
    return;
  const identity = await d.authenticated(req, env);
  const { document } = await d.readRepository(env);
  const a = accessFor(document, identity);
  if (a.status !== "active")
    throw new ChangeError("Active guild membership is required.", 403);
  if (url.pathname.endsWith("/setup") && req.method === "POST") {
    if (!a.admin)
      throw new ChangeError(
        "Only an Admin can set up the Discord application.",
        403,
      );
    await d.limit(env, "discord-raid-setup:" + identity.id, 5);
    const cfg = await config(env);
    if (!cfg)
      throw new ChangeError(
        "Connect the Discord scheduling channel first.",
        409,
      );
    const setup = await setupInteractions(env, true);
    const calendarReady = await canCreateEvents(env, cfg.guildId).catch(
      () => null,
    );
    const calendarNotice =
      calendarReady === false
        ? "Give the bot Create Events under Discord server settings → Roles to add raids to the server calendar."
        : calendarReady === null
          ? "The bot's Create Events permission could not be verified."
          : "";
    return d.json({
      ...setup,
      calendarReady,
      notice:
        [setup.notice, calendarNotice].filter(Boolean).join(" ") || undefined,
    });
  }
  if (url.pathname === visibilityPath && req.method === "POST") {
    await d.limit(env, "discord-raid-visibility:" + identity.id, 30);
    const input = eventInput
      .extend({
        characterId: z.string().regex(/^[\w-]{1,100}$/),
        messageId: snowflake,
        listed: z.boolean(),
      })
      .parse(await d.boundedJSON(req));
    const raid = document.state.events.find((e) => e.id === input.eventId);
    if (!raid || Date.parse(raid.end) <= Date.now())
      throw new ChangeError("This raid is closed.", 409);
    if (
      !document.state.characters.some(
        (c) => c.id === input.characterId && c.ownerBattleNet === identity.id,
      )
    )
      throw new ChangeError("Choose one of your own raid characters.", 403);
    if (input.listed && !Object.hasOwn(raid.signups, input.characterId))
      throw new ChangeError("Set your availability for this raid first.", 409);
    const row = await rowFor(env, raid.id);
    const cfg = await config(env);
    if (
      !cfg ||
      !row ||
      row.message_id !== input.messageId ||
      row.guild_id !== cfg.guildId ||
      row.channel_id !== cfg.pollsChannelId
    )
      throw new ChangeError(
        "Refresh the raid to see the current Discord post.",
        409,
      );
    await setChartName(
      env,
      raid.id,
      {
        guildId: row.guild_id,
        channelId: row.channel_id,
        messageId: input.messageId,
        memberId: identity.id,
        characterId: input.characterId,
      },
      input.listed,
    );
    d.refreshChart?.(raid.id);
    return d.json({ listed: input.listed });
  }
  if (url.pathname !== signupPath || !["GET", "POST"].includes(req.method))
    throw new ChangeError("Unsupported raid signup request.", 405);
  const { eventId } = eventInput.parse(
    req.method === "POST"
      ? await d.boundedJSON(req)
      : { eventId: url.searchParams.get("eventId") },
  );
  const event = document.state.events.find((e) => e.id === eventId);
  if (!event) throw new ChangeError("Raid not found.", 404);
  const canPublish =
    a.admin ||
    (a.role === "officer" &&
      hasSection(a, "attendance") &&
      hasTeam(a, event.teamId));
  if (req.method === "GET") {
    await d.limit(env, "discord-raid-read:" + identity.id, 90);
    const row = await rowFor(env, eventId);
    const visibleIds = row
      ? await chartVisibleIds(
          env,
          eventId,
          row.guild_id,
          row.channel_id,
          row.message_id,
          document,
        )
      : new Set<string>();
    const myListedCharacters = document.state.characters
      .filter((c) => c.ownerBattleNet === identity.id && visibleIds.has(c.id))
      .map((c) => c.id);
    return d.json({ signup: display(row), myListedCharacters, canPublish });
  }
  if (!canPublish)
    throw new ChangeError(
      "Publishing requires Admin or Officer access to this team’s attendance.",
      403,
    );
  if (Date.parse(event.end) <= Date.now())
    throw new ChangeError("This raid has ended.", 409);
  await d.limit(env, "discord-raid-publish:" + identity.id, 6);
  return d.json({
    signup: await publish(env, document, event, a.admin),
    canPublish: true,
  });
}

async function canCreateEvents(env: Env, guildId: string) {
  const [member, roles] = await Promise.all([
    discordFetch(
      env,
      "/guilds/" + guildId + "/members/" + env.DISCORD_CLIENT_ID,
    ),
    discordFetch(env, "/guilds/" + guildId + "/roles"),
  ]);
  const owned = new Set([guildId, ...member.roles]);
  const bits = (roles as Array<{ id: string; permissions: string }>)
    .filter((role) => owned.has(role.id))
    .reduce((sum, role) => sum | BigInt(role.permissions), 0n);
  return (bits & ((1n << 44n) | (1n << 3n))) !== 0n;
}
