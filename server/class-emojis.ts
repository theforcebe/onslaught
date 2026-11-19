import { CLASSES, type WowClass } from "../src/lib/model";
import { discordFetch, DiscordError } from "./discord";
import { classImages } from "./class-emoji-images";
import type { ClassEmojis } from "./raid-chart";
import type { Env } from "./worker";

const snowflake = /^\d{17,20}$/;
const keyFor = (app: string) => "class-emojis:v1:" + app;
const emojiName = (cls: WowClass) => "ons_" + cls;

/** Reads locally on the Worker. Creating emojis never delays an RSVP. */
export async function classEmojis(env: Env): Promise<ClassEmojis> {
  if (!env.DISCORD_CLIENT_ID) return {};
  const row = await env.DB.prepare(
    "SELECT json_extract(payload,'$.ids') AS ids FROM discord_config WHERE key=?",
  )
    .bind(keyFor(env.DISCORD_CLIENT_ID))
    .first<{ ids: string | null }>();
  if (!row?.ids) return {};
  const ids = JSON.parse(row.ids) as ClassEmojis;
  const markup: ClassEmojis = {};
  for (const cls of CLASSES) {
    const id = ids[cls];
    if (typeof id === "string" && snowflake.test(id)) {
      markup[cls] = `<:${emojiName(cls)}:${id}>`;
    }
  }
  return markup;
}

function imageData(bytes: ArrayBuffer) {
  const image = new Uint8Array(bytes);
  // Workers' Data modules are byte buffers; chunk before invoking fromCharCode.
  let binary = "";
  for (let i = 0; i < image.length; i += 8192) {
    binary += String.fromCharCode(...image.subarray(i, i + 8192));
  }
  return "data:image/png;base64," + btoa(binary);
}

type Emoji = { id: string; name: string; available?: boolean };

export async function provisionClassEmojis(env: Env): Promise<void> {
  const app = env.DISCORD_CLIENT_ID;
  if (!app || !snowflake.test(app) || !env.DISCORD_BOT_TOKEN) return;
  const key = keyFor(app);
  const now = Date.now();
  const owner = crypto.randomUUID();
  const attempt = JSON.stringify({ owner, retryAt: now + 180_000 });
  const lease = await env.DB.prepare(
    `INSERT INTO discord_config(key,payload) VALUES(?,?)
     ON CONFLICT(key) DO UPDATE SET payload=excluded.payload
     WHERE json_extract(discord_config.payload,'$.complete') IS NOT 1
       AND json_extract(discord_config.payload,'$.retryAt') <= ?
     RETURNING key`,
  )
    .bind(key, attempt, now)
    .first();
  if (!lease) return;
  const stillOwned = "key=? AND json_extract(payload,'$.owner')=?";
  try {
    const path = `/applications/${app}/emojis`;
    // Re-list after a partial or uncertain upload. Never create a second copy
    // solely because the previous request timed out before returning its ID.
    const reply = await discordFetch(env, path);
    if (!Array.isArray(reply.items)) throw new Error("Invalid emoji catalog");
    const existing = new Map<string, Emoji>(
      (reply.items as Emoji[]).map((item) => [item.name, item]),
    );
    const ids: ClassEmojis = {};
    for (const cls of CLASSES) {
      const name = emojiName(cls);
      const emoji: Emoji =
        existing.get(name) ??
        (await discordFetch(env, path, {
          name,
          image: imageData(classImages[cls]),
        }));
      if (
        emoji.name !== name ||
        !snowflake.test(emoji.id) ||
        emoji.available === false
      ) {
        throw new Error("Discord did not confirm the class emoji");
      }
      ids[cls] = emoji.id;
    }
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE discord_raid_chart_queue SET generation=generation+1
         WHERE EXISTS(SELECT 1 FROM discord_config WHERE ${stillOwned})`,
      ).bind(key, owner),
      env.DB.prepare(
        `UPDATE discord_config SET payload=? WHERE ${stillOwned}`,
      ).bind(JSON.stringify({ complete: true, ids }), key, owner),
    ]);
  } catch (error) {
    const status = error instanceof DiscordError ? error.upstreamStatus : 502;
    const wait = error instanceof DiscordError ? error.retryAfterMs : 0;
    const retryAt = Date.now() + Math.max(300_000, wait);
    await env.DB.prepare(
      `UPDATE discord_config SET payload=? WHERE ${stillOwned}`,
    )
      .bind(JSON.stringify({ retryAt, status }), key, owner)
      .run();
    throw error;
  }
}
