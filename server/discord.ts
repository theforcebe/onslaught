import { z } from "zod";
import type { Env } from "./worker";
import type { Identity } from "../src/lib/model";
import {
  accessFor,
  hasSection,
  hasTeam,
  canSeeRequest,
} from "../src/lib/access";
import type { GuildDocument } from "../src/lib/access";
import { ChangeError } from "../src/lib/reducer";
import { emptyCommunity } from "../src/lib/community";
const snowflake = z.string().regex(/^\d{17,20}$/);
export const DiscordConfigSchema = z
  .object({
    guildId: snowflake,
    pollsChannelId: snowflake,
    announcementsChannelId: snowflake,
    requestsChannelId: snowflake,
    guildName: z.string().max(100).optional(),
    channelNames: z.record(z.string(), z.string().max(100)).optional(),
  })
  .strict();
type Config = z.infer<typeof DiscordConfigSchema>;
const recordId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const SendSchema = z
  .object({
    kind: z.enum(["poll", "announcement", "request"]),
    id: recordId,
    destination: z.enum(["channel", "dm"]),
  })
  .strict();
type Receipt = {
  status: "sending" | "sent" | "failed" | "uncertain";
  destination: "channel" | "dm";
  channelId?: string;
  messageId?: string;
  url?: string;
  sentAt?: string;
  error?: string;
  counts?: number[];
  syncedAt?: string;
  checkedAt?: string;
  syncError?: string;
  finalized?: boolean;
  expiresAt?: string;
};
function publicReceipt(r?: Receipt) {
  if (!r) return null;
  const { channelId: _, messageId: __, ...visible } = r;
  return visible;
}
type Link = {
  member_id: string;
  discord_id: string;
  display_name: string;
  dm_opt_in: number;
};
type Deps = {
  authenticated: (r: Request, e: Env) => Promise<Identity>;
  readRepository: (
    e: Env,
  ) => Promise<{ document: GuildDocument; sha: string; url: string }>;
  digest: (s: string) => Promise<string>;
  json: (data: unknown, status?: number) => Response;
  boundedJSON: (r: Request) => Promise<any>;
  limit: (e: Env, key: string, max: number) => Promise<void>;
};
const random = () => crypto.randomUUID() + crypto.randomUUID();
async function config(env: Env): Promise<Config | undefined> {
  const r = await env.DB.prepare(
    "SELECT payload FROM discord_config WHERE key=?",
  )
    .bind("guild")
    .first<{ payload: string }>();
  return r ? DiscordConfigSchema.parse(JSON.parse(r.payload)) : undefined;
}
async function link(env: Env, id: string) {
  return env.DB.prepare(
    "SELECT member_id,discord_id,display_name,dm_opt_in FROM discord_links WHERE member_id=?",
  )
    .bind(id)
    .first<Link>();
}
async function receipt(env: Env, key: string): Promise<Receipt | undefined> {
  const r = await env.DB.prepare(
    "SELECT payload FROM discord_deliveries WHERE key=?",
  )
    .bind(key)
    .first<{ payload: string }>();
  return r ? JSON.parse(r.payload) : undefined;
}
async function saveReceipt(env: Env, key: string, r: Receipt) {
  await env.DB.prepare("UPDATE discord_deliveries SET payload=? WHERE key=?")
    .bind(JSON.stringify(r), key)
    .run();
}
export class DiscordError extends ChangeError {
  constructor(
    message: string,
    public uncertain = false,
    status = 502,
  ) {
    super(message, status);
  }
}
export async function discordFetch(
  env: Env,
  path: string,
  body?: unknown,
  method?: string,
) {
  if (!env.DISCORD_BOT_TOKEN)
    throw new DiscordError(
      "The Discord bot has not been connected yet.",
      false,
      503,
    );
  if (!/^\/(?:channels|users|guilds|oauth2)\//.test(path))
    throw new Error("Unsupported Discord path");
  let response: Response;
  try {
    response = await fetch(`https://discord.com/api/v10${path}`, {
      method: method || (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN.trim()}`,
        "Content-Type": "application/json",
        "User-Agent":
          "OnslaughtRaidHQ (https://theforcebe.github.io/onslaught/, 1.0)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new DiscordError(
      "Discord did not confirm delivery. Check the channel before retrying.",
      body !== undefined,
    );
  }
  if (!response.ok) {
    if (response.status === 429)
      throw new DiscordError(
        "Discord is rate limiting requests. Wait a minute and try again.",
        false,
        429,
      );
    if (response.status === 403)
      throw new DiscordError(
        "Discord denied access. Check the bot channel permissions or the recipient’s DM settings.",
        false,
        403,
      );
    if (response.status === 401)
      throw new DiscordError(
        "The Discord bot credential needs to be updated.",
        false,
        503,
      );
    throw new DiscordError(
      "Discord could not complete this request.",
      body !== undefined && response.status >= 500,
    );
  }
  return response.status === 204 ? {} : ((await response.json()) as any);
}
function getRecord(
  doc: GuildDocument,
  identity: Identity,
  kind: "poll" | "announcement" | "request",
  id: string,
  write = false,
) {
  const c = doc.state.community || emptyCommunity();
  const record =
    kind === "poll"
      ? c.polls.find((p) => p.id === id)
      : kind === "announcement"
        ? c.announcements.find((a) => a.id === id)
        : c.requests.find((r) => r.id === id);
  const section =
    kind === "poll"
      ? "attendance"
      : kind === "announcement"
        ? "community"
        : "consumables";
  const access = accessFor(doc, identity);
  if (
    !record ||
    (kind === "request"
      ? !canSeeRequest(access, record, identity.id)
      : !hasSection(access, section) || !hasTeam(access, record.teamId))
  )
    throw new ChangeError("This record is not available to your account.", 403);
  if (write && !access.admin && access.role !== "officer")
    throw new ChangeError(
      "Only an Admin or Officer with access can post to Discord.",
      403,
    );
  return record;
}
export function discordMessage(
  doc: GuildDocument,
  kind: "poll" | "announcement" | "request",
  id: string,
  now = Date.now(),
) {
  const c = doc.state.community || emptyCommunity();
  const url = "https://theforcebe.github.io/onslaught/#community";
  const base: any = {
    allowed_mentions: { parse: [] },
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "Open raid headquarters", url },
        ],
      },
    ],
  };
  if (kind === "poll") {
    const p = c.polls.find((p) => p.id === id)!;
    if (p.closed || Date.parse(p.closesAt) <= now)
      throw new ChangeError("This poll has already closed.");
    if (p.voting === "discord") {
      const duration = Math.ceil((Date.parse(p.closesAt) - now) / 3600000);
      if (duration < 1 || duration > 768)
        throw new ChangeError(
          "Discord poll duration must be between 1 hour and 32 days.",
        );
      return {
        ...base,
        content: `Raid scheduling · Times in ${p.timeZone}\nSelect every option that works. Results appear in Ønslaught.`,
        poll: {
          question: { text: p.title },
          answers: p.options.map((text) => ({ poll_media: { text } })),
          duration,
          allow_multiselect: true,
          layout_type: 1,
        },
      };
    }
    return {
      ...base,
      content: `**${p.title}**\nTimes in ${p.timeZone}\n${p.options.map((o) => `• ${o}`).join("\n")}\n\nVote on the Ønslaught site. Closes <t:${Math.floor(Date.parse(p.closesAt) / 1000)}:F>.`,
    };
  }
  if (kind === "announcement") {
    const m = c.announcements.find((m) => m.id === id)!;
    return { ...base, content: `**${m.title}**\n${m.body}` };
  }
  const r = c.requests.find((r) => r.id === id)!;
  if (r.cancelled) throw new ChangeError("This request was cancelled.");
  return {
    ...base,
    content: `**Material request for ${r.recipientName}**\n${r.quantity} × ${r.item}\nRequested by ${r.createdByName}${r.dueAt ? `\nDue <t:${Math.floor(Date.parse(r.dueAt) / 1000)}:F>` : ""}${r.notes ? `\n${r.notes}` : ""}\n\nUpdate your fulfilled quantity in Ønslaught. This message is a notification; the site has the current status.`,
  };
}
async function readAuth(env: Env, key: string, remove = false) {
  const row = await env.DB.prepare(
    `${remove ? "DELETE FROM" : "SELECT payload FROM"} auth_records WHERE key=? AND expires_at>?${remove ? " RETURNING payload" : ""}`,
  )
    .bind(key, Date.now())
    .first<{ payload: string }>();
  return row ? JSON.parse(row.payload) : undefined;
}
async function putAuth(env: Env, key: string, payload: unknown) {
  await env.DB.prepare(
    "INSERT INTO auth_records (key,payload,expires_at) VALUES (?,?,?)",
  )
    .bind(key, JSON.stringify(payload), Date.now() + 300000)
    .run();
}
function linkPage(ok: boolean) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Ønslaught Discord connection</title><p>${ok ? "Discord linked. Return to Ønslaught and refresh the connection panel." : "Discord linking could not be completed. Return to Ønslaught and try again."}</p><a href="https://theforcebe.github.io/onslaught/#community">Return to Ønslaught</a>`,
    {
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "Set-Cookie":
          "__Host-onslaught-discord=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
      },
    },
  );
}
export async function handleDiscord(
  req: Request,
  env: Env,
  d: Deps,
): Promise<Response | undefined> {
  const u = new URL(req.url);
  if (
    !u.pathname.startsWith("/api/discord/") &&
    !u.pathname.startsWith("/discord/")
  )
    return undefined;
  if (u.pathname === "/discord/connect" && req.method === "GET") {
    const ticket = u.searchParams.get("ticket") || "";
    if (!/^[A-Za-z0-9-]{72}$/.test(ticket)) return linkPage(false);
    const saved = await readAuth(
      env,
      `discord-ticket:${await d.digest(ticket)}`,
      true,
    );
    if (!saved || !env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET)
      return linkPage(false);
    const state = random(),
      verifier = random();
    await putAuth(env, `discord-oauth:${await d.digest(state)}`, {
      ...saved,
      verifier,
    });
    const auth = new URL("https://discord.com/oauth2/authorize");
    auth.search = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      response_type: "code",
      redirect_uri: `${env.PUBLIC_API_URL}/discord/callback`,
      scope: "identify",
      state,
      code_challenge: await d.digest(verifier),
      code_challenge_method: "S256",
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: auth.href,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Set-Cookie": `__Host-onslaught-discord=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=300`,
      },
    });
  }
  if (u.pathname === "/discord/callback" && req.method === "GET") {
    try {
      const state = u.searchParams.get("state") || "",
        cookie = req.headers
          .get("Cookie")
          ?.match(/(?:^|;\s*)__Host-onslaught-discord=([A-Za-z0-9-]+)/)?.[1];
      if (!cookie || cookie !== state || u.searchParams.has("error"))
        return linkPage(false);
      const saved = await readAuth(
          env,
          `discord-oauth:${await d.digest(state)}`,
          true,
        ),
        code = u.searchParams.get("code");
      if (!saved || !code || code.length > 2000) return linkPage(false);
      const session = await readAuth(env, saved.sessionKey);
      if (!session || session.id !== saved.memberId) return linkPage(false);
      const current = await d.readRepository(env);
      const linkingIdentity: Identity = {
        provider: "battlenet",
        id: session.id,
        label: session.label,
        admin: (env.ADMIN_BNET_IDS || "")
          .split(",")
          .map((x) => x.trim())
          .includes(session.subject),
      };
      if (accessFor(current.document, linkingIdentity).status !== "active")
        return linkPage(false);
      const cfg = await config(env);
      if (!cfg) return linkPage(false);
      const r = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID!,
          client_secret: env.DISCORD_CLIENT_SECRET!,
          grant_type: "authorization_code",
          code,
          redirect_uri: `${env.PUBLIC_API_URL}/discord/callback`,
          code_verifier: saved.verifier,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return linkPage(false);
      const token = (await r.json()) as { access_token?: string };
      if (!token.access_token) return linkPage(false);
      const userResponse = await fetch(
        "https://discord.com/api/v10/users/@me",
        {
          headers: { Authorization: `Bearer ${token.access_token}` },
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        },
      );
      const user = userResponse.ok
        ? ((await userResponse.json()) as {
            id: string;
            username: string;
            global_name?: string;
          })
        : undefined;
      await fetch("https://discord.com/api/oauth2/token/revoke", {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.DISCORD_CLIENT_ID!,
          client_secret: env.DISCORD_CLIENT_SECRET!,
          token: token.access_token,
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => {});
      if (!user || !snowflake.safeParse(user.id).success)
        return linkPage(false);
      await discordFetch(env, `/guilds/${cfg.guildId}/members/${user.id}`);
      const existing = await env.DB.prepare(
        "SELECT member_id FROM discord_links WHERE discord_id=?",
      )
        .bind(user.id)
        .first<{ member_id: string }>();
      if (existing && existing.member_id !== saved.memberId)
        return linkPage(false);
      await env.DB.prepare(
        "INSERT INTO discord_links (member_id,discord_id,display_name,dm_opt_in) VALUES (?,?,?,0) ON CONFLICT(member_id) DO UPDATE SET discord_id=excluded.discord_id,display_name=excluded.display_name,dm_opt_in=0",
      )
        .bind(
          saved.memberId,
          user.id,
          String(user.global_name || user.username).slice(0, 100),
        )
        .run();
      return linkPage(true);
    } catch {
      return linkPage(false);
    }
  }
  const identity = await d.authenticated(req, env),
    current = await d.readRepository(env),
    access = accessFor(current.document, identity);
  if (access.status !== "active")
    throw new ChangeError("Active guild membership is required.", 403);
  await d.limit(env, `discord:${identity.id}`, 30);
  if (u.pathname === "/api/discord/status" && req.method === "GET") {
    const cfg = await config(env),
      own = await link(env, identity.id);
    const linked =
      access.admin ||
      (access.role === "officer" && hasSection(access, "consumables"))
        ? await env.DB.prepare(
            "SELECT member_id,dm_opt_in FROM discord_links",
          ).all<{ member_id: string; dm_opt_in: number }>()
        : undefined;
    const permissions =
      (1n << 10n) | (1n << 11n) | (1n << 14n) | (1n << 16n) | (1n << 49n);
    return d.json({
      recipients:
        linked?.results
          .filter((r) =>
            current.document.members.some(
              (m) => m.id === r.member_id && m.status === "active",
            ),
          )
          .map((r) => ({ id: r.member_id, dmOptIn: !!r.dm_opt_in })) || [],
      botConfigured: !!env.DISCORD_BOT_TOKEN,
      linkConfigured: !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET),
      connected: !!cfg && !!env.DISCORD_BOT_TOKEN,
      guildName: cfg?.guildName || "Ønslaught",
      channelNames: cfg?.channelNames || {},
      ownLink: own
        ? { name: own.display_name, dmOptIn: !!own.dm_opt_in }
        : null,
      ...(access.admin
        ? {
            config: cfg || null,
            installUrl: env.DISCORD_CLIENT_ID
              ? `https://discord.com/oauth2/authorize?client_id=${env.DISCORD_CLIENT_ID}&scope=bot&permissions=${permissions}&guild_id=${cfg?.guildId || "1346205094550700072"}&disable_guild_select=true`
              : null,
            callbackUrl: `${env.PUBLIC_API_URL}/discord/callback`,
          }
        : {}),
    });
  }
  if (u.pathname === "/api/discord/config" && req.method === "POST") {
    if (!access.admin)
      throw new ChangeError("Only an Admin can configure Discord.", 403);
    const input = DiscordConfigSchema.parse(await d.boundedJSON(req));
    const guild = await discordFetch(env, `/guilds/${input.guildId}`);
    const names: Record<string, string> = {};
    for (const key of [
      "pollsChannelId",
      "announcementsChannelId",
      "requestsChannelId",
    ] as const) {
      const channel = await discordFetch(env, `/channels/${input[key]}`);
      if (channel.guild_id !== input.guildId || ![0, 5].includes(channel.type))
        throw new ChangeError(
          "Choose text channels in the connected Discord server.",
        );
      names[key] = String(channel.name).slice(0, 100);
    }
    const cfg = {
      ...input,
      guildName: String(guild.name).slice(0, 100),
      channelNames: names,
    };
    await env.DB.prepare(
      "INSERT INTO discord_config (key,payload) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload",
    )
      .bind("guild", JSON.stringify(cfg))
      .run();
    return d.json({ ok: true });
  }
  if (u.pathname === "/api/discord/link/start" && req.method === "POST") {
    if (
      !env.DISCORD_CLIENT_ID ||
      !env.DISCORD_CLIENT_SECRET ||
      !(await config(env))
    )
      throw new ChangeError("An Admin must finish Discord setup first.", 503);
    const ticket = random();
    const sessionKey = `session:${await d.digest(req.headers.get("Authorization")!.slice(7))}`;
    await putAuth(env, `discord-ticket:${await d.digest(ticket)}`, {
      memberId: identity.id,
      sessionKey,
    });
    return d.json({
      url: `${env.PUBLIC_API_URL}/discord/connect?ticket=${ticket}`,
    });
  }
  if (u.pathname === "/api/discord/preferences" && req.method === "POST") {
    const input = z
      .object({ dmOptIn: z.boolean() })
      .strict()
      .parse(await d.boundedJSON(req));
    if (!(await link(env, identity.id)))
      throw new ChangeError("Link Discord first.");
    await env.DB.prepare(
      "UPDATE discord_links SET dm_opt_in=? WHERE member_id=?",
    )
      .bind(input.dmOptIn ? 1 : 0, identity.id)
      .run();
    return d.json({ ok: true });
  }
  if (u.pathname === "/api/discord/unlink" && req.method === "POST") {
    await env.DB.prepare("DELETE FROM discord_links WHERE member_id=?")
      .bind(identity.id)
      .run();
    return d.json({ ok: true });
  }
  if (u.pathname === "/api/discord/delivery" && req.method === "GET") {
    const query = SendSchema.parse({
      kind: u.searchParams.get("kind"),
      id: u.searchParams.get("id"),
      destination: u.searchParams.get("destination") || "channel",
    });
    const record = getRecord(current.document, identity, query.kind, query.id);
    const key = notificationKey(query, record);
    let r = await receipt(env, key);
    if (
      query.kind === "poll" &&
      r?.status === "sent" &&
      !r.finalized &&
      r.channelId &&
      r.messageId &&
      (!r.checkedAt || Date.now() - Date.parse(r.checkedAt) > 30000)
    ) {
      try {
        const message = await discordFetch(
          env,
          `/channels/${r.channelId}/messages/${r.messageId}`,
        );
        r = { ...r, checkedAt: new Date().toISOString(), syncError: undefined };
        if (message.poll?.results) {
          const p = current.document.state.community!.polls.find(
            (p) => p.id === query.id,
          )!;
          r = {
            ...r,
            counts: p.options.map(
              (_, i) =>
                message.poll.results.answer_counts.find(
                  (a: any) => a.id === i + 1,
                )?.count || 0,
            ),
            syncedAt: new Date().toISOString(),
            finalized: !!message.poll.results.is_finalized,
            expiresAt: message.poll.expiry,
          };
        }
      } catch {
        r = {
          ...r,
          checkedAt: new Date().toISOString(),
          syncError:
            "Discord results could not be refreshed. Showing the last available counts.",
        };
      }
      await saveReceipt(env, key, r);
    }
    return d.json({ receipt: publicReceipt(r) });
  }
  if (u.pathname === "/api/discord/send" && req.method === "POST") {
    const input = SendSchema.parse(await d.boundedJSON(req));
    const record = getRecord(
      current.document,
      identity,
      input.kind,
      input.id,
      true,
    );
    if (input.destination === "dm" && input.kind !== "request")
      throw new ChangeError(
        "Direct messages are only available for assigned material requests.",
      );
    await d.limit(env, `discord-send:${identity.id}`, 6);
    const cfg = await config(env);
    if (!cfg)
      throw new ChangeError("An Admin must connect Discord first.", 503);
    let channelId =
      cfg[
        input.kind === "poll"
          ? "pollsChannelId"
          : input.kind === "announcement"
            ? "announcementsChannelId"
            : "requestsChannelId"
      ];
    const key = notificationKey(input, record),
      existing = await receipt(env, key);
    if (existing?.status === "sent")
      return d.json({ receipt: publicReceipt(existing) });
    if (existing && existing.status !== "failed")
      throw new ChangeError(
        "Delivery is pending or unconfirmed. Check Discord before sending another notification.",
        409,
      );
    // Validate and render before taking the durable delivery lock.
    const message = discordMessage(current.document, input.kind, input.id);
    if (input.destination === "dm") {
      if (!("recipientId" in record) || !record.recipientId)
        throw new ChangeError("Recipient not found.");
      const recipient = current.document.members.find(
        (m) => m.id === record.recipientId && m.status === "active",
      );
      const recipientAccess = recipient
        ? accessFor(current.document, {
            provider: "battlenet",
            id: recipient.id,
            label: recipient.label,
          })
        : undefined;
      if (!recipientAccess || recipientAccess.status !== "active")
        throw new ChangeError(
          "The recipient no longer has access to this request.",
        );
      const target = await link(env, record.recipientId);
      if (!target?.dm_opt_in)
        throw new ChangeError(
          "This member has not linked Discord and opted into request DMs. Use the shared channel.",
        );
      await discordFetch(
        env,
        `/guilds/${cfg.guildId}/members/${target.discord_id}`,
      );
      const dm = await discordFetch(env, "/users/@me/channels", {
        recipient_id: target.discord_id,
      });
      channelId = dm.id;
    } else {
      const channel = await discordFetch(env, `/channels/${channelId}`);
      if (channel.guild_id !== cfg.guildId)
        throw new ChangeError(
          "The configured channel is outside the connected server.",
        );
    }
    const initial: Receipt = {
      status: "sending",
      destination: input.destination,
      channelId,
    };
    const locked = existing
      ? await env.DB.prepare(
          "UPDATE discord_deliveries SET payload=? WHERE key=? AND json_extract(payload,'$.status')='failed' RETURNING key",
        )
          .bind(JSON.stringify(initial), key)
          .first()
      : await env.DB.prepare(
          "INSERT INTO discord_deliveries (key,payload) VALUES (?,?) ON CONFLICT(key) DO NOTHING RETURNING key",
        )
          .bind(key, JSON.stringify(initial))
          .first();
    if (!locked)
      throw new ChangeError("This notification is already being sent.", 409);
    try {
      const sent = await discordFetch(env, `/channels/${channelId}/messages`, {
        ...message,
        nonce: (await d.digest(key)).slice(0, 24),
        enforce_nonce: true,
      });
      const r: Receipt = {
        status: "sent",
        destination: input.destination,
        channelId,
        messageId: sent.id,
        url:
          input.destination === "channel"
            ? `https://discord.com/channels/${cfg.guildId}/${channelId}/${sent.id}`
            : undefined,
        sentAt: new Date().toISOString(),
      };
      await saveReceipt(env, key, r);
      return d.json({ receipt: publicReceipt(r) });
    } catch (e) {
      const r: Receipt = {
        ...initial,
        status:
          e instanceof DiscordError && !e.uncertain ? "failed" : "uncertain",
        error:
          e instanceof DiscordError
            ? e.message
            : "Discord delivery could not be confirmed. Check the destination.",
      };
      await saveReceipt(env, key, r);
      throw e;
    }
  }
  return d.json({ error: "Not found." }, 404);
}

function notificationKey(
  input: { kind: string; id: string; destination: string },
  record: { id: string; recipientId?: string; openToGuild?: boolean },
) {
  const base = `${input.kind}:${input.id}:${input.destination}`;
  return input.destination === "dm" && record.openToGuild
    ? `${base}:${record.recipientId || "unassigned"}`
    : base;
}
