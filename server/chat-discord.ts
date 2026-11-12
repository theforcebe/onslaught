import type { Env } from "./worker";
import { DiscordError, discordFetch } from "./discord";
import type { ChatDelivery, ChatMessage } from "../src/lib/chat";

export async function chatDiscordPreference(env: Env, member: string) {
  const link = await env.DB.prepare(
    `SELECT l.discord_id,p.discord_id AS opted_in FROM discord_links l
     LEFT JOIN chat_discord_preferences p ON p.member_id=l.member_id AND p.discord_id=l.discord_id
     WHERE l.member_id=?`,
  )
    .bind(member)
    .first<{ discord_id: string; opted_in: string | null }>();
  return { linked: !!link, enabled: !!link?.opted_in };
}

// A message gets one delivery attempt, including across concurrent/retried sends.
// An uncertain network result must never cause duplicate private messages.
export async function forwardChatDM(
  env: Env,
  recipient: string,
  message: ChatMessage,
): Promise<ChatDelivery> {
  const claim = await env.DB.prepare(
    "INSERT INTO chat_discord_deliveries(message_seq,status) VALUES(?,'sending') ON CONFLICT(message_seq) DO NOTHING RETURNING message_seq",
  )
    .bind(message.seq)
    .first();
  if (!claim) {
    const saved = await env.DB.prepare(
      "SELECT status FROM chat_discord_deliveries WHERE message_seq=?",
    )
      .bind(message.seq)
      .first<{ status: ChatDelivery }>();
    return saved?.status || "uncertain";
  }
  let status: ChatDelivery = "disabled";
  try {
    const target = await env.DB.prepare(
      `SELECT l.discord_id FROM discord_links l JOIN chat_discord_preferences p
       ON p.member_id=l.member_id AND p.discord_id=l.discord_id WHERE l.member_id=?`,
    )
      .bind(recipient)
      .first<{ discord_id: string }>();
    const config = await env.DB.prepare(
      "SELECT payload FROM discord_config WHERE key='guild'",
    ).first<{ payload: string }>();
    if (target) {
      status = "failed";
      const guildId = config && JSON.parse(config.payload).guildId;
      if (env.DISCORD_BOT_TOKEN && /^\d{17,20}$/.test(guildId || "")) {
        await discordFetch(
          env,
          `/guilds/${guildId}/members/${target.discord_id}`,
        );
        const channel = await discordFetch(env, "/users/@me/channels", {
          recipient_id: target.discord_id,
        });
        if (!/^\d{17,20}$/.test(channel.id || ""))
          throw new Error("Invalid DM channel");
        await discordFetch(env, `/channels/${channel.id}/messages`, {
          allowed_mentions: { parse: [] },
          embeds: [
            {
              title: "Private message · Ønslaught",
              author: { name: message.senderName.slice(0, 256) },
              description: message.body,
              color: 0xc74045,
              url: "https://theforcebe.github.io/onslaught/",
              footer: {
                text: "Reply in Guild chat on Ønslaught. Replies to this bot are not forwarded.",
              },
            },
          ],
        });
        status = "sent";
      }
    }
  } catch (e) {
    status = e instanceof DiscordError && e.uncertain ? "uncertain" : "failed";
  }
  await env.DB.prepare(
    "UPDATE chat_discord_deliveries SET status=? WHERE message_seq=?",
  )
    .bind(status, message.seq)
    .run();
  return status;
}
