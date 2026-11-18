import { z } from "zod";
import {
  actionScope,
  authorizeAction,
  type GuildDocument,
} from "../src/lib/access";
import { applyChange, ChangeError } from "../src/lib/reducer";
import {
  label,
  type Character,
  type Identity,
  type RaidAction,
  type RaidEvent,
} from "../src/lib/model";
import { buildKey, characterBuilds, signupBuildKind } from "../src/lib/raid";
import { config } from "./discord";
import {
  attendanceLabels,
  interactionPath,
  publicKeyRecord,
  raidUrl,
  snowflake,
  type Attendance,
} from "./discord-raids";
import type { Env } from "./worker";
import { recordDiscordChartSignup } from "./raid-chart-sync";

type Deps = {
  refreshChart?: (eventId: string) => void;
  limit: (env: Env, key: string, max: number) => Promise<void>;
  readRepository: (
    env: Env,
  ) => Promise<{ document: GuildDocument; url: string; sha: string }>;
  writeRepository: (
    env: Env,
    url: string,
    sha: string,
    doc: GuildDocument,
  ) => Promise<void>;
};
const interaction = z.object({
  type: z.literal(3),
  id: snowflake,
  application_id: snowflake,
  guild_id: snowflake,
  channel_id: snowflake,
  token: z.string().regex(/^[\w.+=/-]{1,512}$/),
  member: z.object({ user: z.object({ id: snowflake }) }),
  message: z.object({ id: snowflake }),
  data: z.object({
    custom_id: z.string().max(100),
    values: z.array(z.string().max(100)).max(1).optional(),
  }),
});
type Click = z.infer<typeof interaction>;
type Build = ReturnType<typeof characterBuilds>[number];
type Choice = {
  characterId: string;
  build?: Build;
  kind?: ReturnType<typeof signupBuildKind>;
  label: string;
  current?: Attendance;
  keepRecorded?: boolean;
};
type Menu = {
  discordId: string;
  memberId: string;
  eventId: string;
  status: Attendance;
  choices: Choice[];
  originalMessage: string;
  showOnChart?: boolean;
  page?: number;
  pageCount?: number;
};
type Reply = { content: string; components?: unknown[] };
const selectLimit = 25;
const menuControl = /^raid:(pick|prev|next):([a-f0-9-]{36})$/;
const hexBytes = (s: string) =>
  Uint8Array.from(s.match(/../g)!, (part) => parseInt(part, 16));

async function signedBody(req: Request, env: Env) {
  const timestamp = req.headers.get("X-Signature-Timestamp") || "";
  const signature = req.headers.get("X-Signature-Ed25519") || "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !/^[\da-f]{128}$/i.test(signature)
  )
    throw new ChangeError("Invalid Discord signature.", 401);
  const reader = req.body?.getReader();
  if (!reader) throw new ChangeError("Missing interaction.", 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 128 * 1024) {
      await reader.cancel();
      throw new ChangeError("Interaction too large.", 413);
    }
    parts.push(part.value);
  }
  const stored = await env.DB.prepare(
    "SELECT payload FROM discord_config WHERE key=?",
  )
    .bind(publicKeyRecord)
    .first<{ payload: string }>();
  if (!stored)
    throw new ChangeError("Configure Discord signup buttons first.", 503);
  const trusted = JSON.parse(stored.payload);
  if (
    trusted.appId !== env.DISCORD_CLIENT_ID ||
    !/^[\da-f]{64}$/i.test(trusted.key)
  )
    throw new ChangeError("Check the Discord application connection.", 503);
  const prefix = new TextEncoder().encode(timestamp),
    data = new Uint8Array(prefix.length + size);
  data.set(prefix);
  let offset = prefix.length;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    hexBytes(trusted.key),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  if (!(await crypto.subtle.verify("Ed25519", key, hexBytes(signature), data)))
    throw new ChangeError("Invalid Discord signature.", 401);
  return JSON.parse(new TextDecoder().decode(data.subarray(prefix.length)));
}
async function linkedMember(
  env: Env,
  click: Click,
  document: GuildDocument,
): Promise<Identity> {
  const link = await env.DB.prepare(
    "SELECT member_id FROM discord_links WHERE discord_id=?",
  )
    .bind(click.member.user.id)
    .first<{ member_id: string }>();
  const member = document.members.find((m) => m.id === link?.member_id);
  if (!member || member.status !== "active")
    throw new ChangeError(
      "Link your Discord account in Ønslaught under Guild coordination → Discord connection. Approved guild membership is required.",
    );
  return { provider: "battlenet", id: member.id, label: member.label };
}
async function loadMenu(env: Env, click: Click, id: string) {
  const row = await env.DB.prepare(
    "SELECT payload FROM auth_records WHERE key=? AND expires_at>?",
  )
    .bind("raid-menu:" + id, Date.now())
    .first<{ payload: string }>();
  const menu: Menu | undefined = row ? JSON.parse(row.payload) : undefined;
  if (!menu || menu.discordId !== click.member.user.id)
    throw new ChangeError(
      "This character menu expired. Choose your availability on the raid post again.",
    );
  return menu;
}
async function makeMenu(env: Env, menu: Menu, page = 0): Promise<Reply> {
  const pageCount = Math.ceil(menu.choices.length / selectLimit);
  if (page < 0 || page >= pageCount)
    throw new ChangeError("Your roster changed. Open the raid signup again.");
  const choices = menu.choices.slice(
    page * selectLimit,
    (page + 1) * selectLimit,
  );
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO auth_records(key,payload,expires_at) VALUES(?,?,?)",
  )
    .bind(
      "raid-menu:" + id,
      JSON.stringify({ ...menu, choices, page, pageCount }),
      Date.now() + 10 * 60 * 1000,
    )
    .run();
  const choose = menu.choices.some((c) => c.build)
    ? "Choose your character and build"
    : "Choose your character";
  return {
    content:
      choose +
      ` for **${attendanceLabels[menu.status]}**.` +
      (menu.choices.some((c) => c.kind === "Alternate")
        ? " Pick **Alternate** to play that role for this raid."
        : "") +
      " Your character name and response will appear on the signup chart in this channel." +
      (pageCount > 1 ? `\nPage ${page + 1} of ${pageCount}` : ""),
    components: [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: "raid:pick:" + id,
            placeholder: choose,
            options: choices.map((choice, i) => ({
              label: choice.label.slice(0, 100),
              value: String(i),
              ...(choice.current
                ? {
                    description: `Current signup · ${attendanceLabels[choice.current]}`,
                  }
                : {}),
            })),
          },
        ],
      },
      ...(pageCount > 1
        ? [
            {
              type: 1,
              components: [
                ...(page > 0
                  ? [
                      {
                        type: 2,
                        style: 2,
                        label: "Previous page",
                        custom_id: "raid:prev:" + id,
                      },
                    ]
                  : []),
                ...(page + 1 < pageCount
                  ? [
                      {
                        type: 2,
                        style: 2,
                        label: "Next page",
                        custom_id: "raid:next:" + id,
                      },
                    ]
                  : []),
              ],
            },
          ]
        : []),
    ],
  };
}
function choicesFor(
  c: Character,
  event: RaidEvent,
  status: Attendance,
): Choice[] {
  const current = event.signups[c.id];
  if (status === "absent")
    return [{ characterId: c.id, label: c.name, current }];
  const builds = characterBuilds(c);
  const recorded = event.signupBuilds?.[c.id];
  const selected = recorded ?? builds[0];
  // An existing RSVP can retain its recorded build after a member edits their profile.
  if (recorded && !builds.some((b) => buildKey(b) === buildKey(recorded)))
    builds.push(recorded);
  if (!builds.length) return [{ characterId: c.id, label: c.name, current }];
  return builds.map((build) => {
    const kind = signupBuildKind(c, build);
    return {
      characterId: c.id,
      build,
      kind,
      label: `${kind} · ${build.spec} (${label(build.role)}) · ${c.name}`,
      current:
        selected && buildKey(build) === buildKey(selected)
          ? current
          : undefined,
      keepRecorded: kind === "Raid build" || undefined,
    };
  });
}
export async function processRaidClick(
  env: Env,
  click: Click,
  d: Deps,
): Promise<Reply> {
  await d.limit(env, "discord-rsvp:" + click.member.user.id, 30);
  const control = menuControl.exec(click.data.custom_id);
  const menu = control ? await loadMenu(env, click, control[2]) : undefined;
  const cfg = await config(env);
  if (
    !cfg ||
    cfg.guildId !== click.guild_id ||
    cfg.pollsChannelId !== click.channel_id
  )
    throw new ChangeError(
      "Use the post in the guild’s current raid scheduling channel.",
    );
  const posted = await env.DB.prepare(
    "SELECT event_id FROM discord_raid_signups WHERE message_id=? AND guild_id=? AND channel_id=?",
  )
    .bind(
      menu?.originalMessage || click.message.id,
      click.guild_id,
      click.channel_id,
    )
    .first<{ event_id: string }>();
  if (!posted || (menu && posted.event_id !== menu.eventId))
    throw new ChangeError("This raid signup is no longer available.");
  const status =
    menu?.status || (click.data.custom_id.split(":")[2] as Attendance);
  const showOnChart = menu
    ? menu.showOnChart === true
    : click.data.custom_id.startsWith("raid:chart:");
  if (!Object.hasOwn(attendanceLabels, status))
    throw new ChangeError("Choose a valid attendance response.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const { document, sha, url } = await d.readRepository(env);
    const actor = await linkedMember(env, click, document);
    if (menu && menu.memberId !== actor.id)
      throw new ChangeError(
        "Your linked account has changed. Open the raid post again.",
      );
    const event = document.state.events.find((e) => e.id === posted.event_id);
    if (!event || Date.parse(event.end) <= Date.now())
      throw new ChangeError("Signups have closed for this raid.");
    const own = document.state.characters.filter(
      (c) => c.ownerBattleNet === actor.id,
    );
    if (!own.length)
      return {
        content:
          "Import your character or ask an admin to link your roster entry in [Ønslaught](" +
          raidUrl(event.id) +
          "), then sign up here.",
      };
    const choices = own.flatMap((c) => choicesFor(c, event, status));
    let choice = choices[0];
    if (menu) {
      if (control && control[1] !== "pick") {
        const page = (menu.page ?? 0) + (control[1] === "next" ? 1 : -1);
        if (page < 0 || page >= (menu.pageCount ?? 1))
          throw new ChangeError(
            "Choose an available page from your signup menu.",
          );
        return makeMenu(env, { ...menu, choices }, page);
      }
      const index = click.data.values?.[0];
      if (!index || !/^\d{1,2}$/.test(index))
        throw new ChangeError("Choose a character from the raid menu.");
      const selected = menu.choices[Number(index)];
      if (!selected) throw new ChangeError("Choose an option from this page.");
      const valid = choices.find(
        (item) =>
          item.characterId === selected?.characterId &&
          item.build?.spec === selected?.build?.spec &&
          item.build?.role === selected?.build?.role &&
          !!item.keepRecorded === !!selected?.keepRecorded,
      );
      if (!valid)
        throw new ChangeError(
          "Your character or spec options changed. Open the raid post and choose again.",
        );
      choice = valid;
    } else if (choices.length > 1)
      return makeMenu(env, {
        choices,
        discordId: click.member.user.id,
        memberId: actor.id,
        eventId: event.id,
        status,
        originalMessage: click.message.id,
        showOnChart: true,
      });
    const action: RaidAction = {
      type: "event.signup",
      eventId: event.id,
      characterId: choice.characterId,
      status,
      ...(choice.build && !choice.keepRecorded ? { build: choice.build } : {}),
    };
    const identity = authorizeAction(document, actor, action);
    const request = {
      version: 1 as const,
      id: "discord-" + click.id,
      expectedRevision: document.state.revision,
      action,
    };
    const next = applyChange(document.state, request, identity);
    if (next.revision !== document.state.revision) {
      next.audit[0].scope = actionScope(next, action);
      try {
        await d.writeRepository(env, url, sha, { ...document, state: next });
      } catch (err) {
        if (err instanceof ChangeError && err.status === 409 && attempt < 2)
          continue;
        throw err;
      }
    }
    let queued = true;
    try {
      await recordDiscordChartSignup(
        env,
        event.id,
        showOnChart
          ? {
              guildId: click.guild_id,
              channelId: click.channel_id,
              messageId: menu?.originalMessage || click.message.id,
              memberId: actor.id,
              characterId: choice.characterId,
            }
          : undefined,
        click.id,
      );
      d.refreshChart?.(event.id);
    } catch {
      // The repository write is already committed. Retrying the RSVP safely
      // records missing chart work without changing the saved attendance.
      queued = false;
    }
    return {
      content:
        choice.label +
        " · **" +
        attendanceLabels[status] +
        "** for [" +
        event.title.replace(/[\[\]\\]/g, "") +
        "](" +
        raidUrl(event.id) +
        ")." +
        (choice.build && choices.length > 1
          ? " Choose Going or Maybe again to change your raid build."
          : "") +
        (queued
          ? ""
          : " Your attendance is saved. Choose your response again to refresh the Discord chart."),
    };
  }
  throw new ChangeError(
    "Another signup was saved at the same time. Choose your response again.",
  );
}
async function finish(env: Env, click: Click, d: Deps) {
  let reply: Reply;
  try {
    reply = await processRaidClick(env, click, d);
  } catch (err) {
    reply = {
      content:
        err instanceof ChangeError
          ? err.message
          : "Could not confirm your signup. Check the raid planner or use the raid post again.",
    };
  }
  const url =
    "https://discord.com/api/v10/webhooks/" +
    click.application_id +
    "/" +
    encodeURIComponent(click.token) +
    "/messages/@original";
  // The deferred acknowledgment may still be in flight during very fast local errors.
  for (let n = 0; n < 3; n++) {
    const r = await fetch(url, {
      method: "PATCH",
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        components: [],
        ...reply,
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok || (r.status !== 404 && r.status !== 429 && r.status < 500)) break;
    const delay =
      r.status === 429
        ? Math.min(
            4000,
            Math.max(500, Number(r.headers.get("Retry-After") || 1) * 1000),
          )
        : 500 * (n + 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
export async function handleRaidInteraction(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  d: Deps,
) {
  if (new URL(req.url).pathname !== interactionPath) return;
  if (req.method !== "POST") throw new ChangeError("Use POST.", 405);
  const payload = await signedBody(req, env);
  if (
    payload.application_id !== undefined &&
    payload.application_id !== env.DISCORD_CLIENT_ID
  )
    throw new ChangeError("Wrong Discord application.", 401);
  if (payload.type === 1) return Response.json({ type: 1 });
  const parsed = interaction.safeParse(payload);
  if (
    !parsed.success ||
    (!/^raid:(?:chart|rsvp):(?:going|tentative|absent)$/.test(
      parsed.data.data.custom_id,
    ) &&
      !menuControl.test(parsed.data.data.custom_id))
  )
    return Response.json({
      type: 4,
      data: { flags: 64, content: "This action is unavailable." },
    });
  ctx.waitUntil(finish(env, parsed.data, d).catch(() => {}));
  if (/^raid:(?:prev|next):/.test(parsed.data.data.custom_id))
    return Response.json({ type: 6 });
  return Response.json({ type: 5, data: { flags: 64 } });
}
