import { z } from "zod";
import type { Env } from "./worker";
import type { Identity } from "../src/lib/model";
import {
  MemberSchema,
  type GuildDocument,
  type Member,
} from "../src/lib/access";
import {
  ChatSendSchema,
  ChatReadSchema,
  type ChatMessage,
} from "../src/lib/chat";
import { ChangeError } from "../src/lib/reducer";
import { rejectCredentials } from "../src/lib/parser";

type Dependencies = {
  authenticated: (r: Request, e: Env) => Promise<Identity>;
  readRepository: (e: Env) => Promise<{ document: GuildDocument }>;
  limit: (e: Env, key: string, max: number) => Promise<void>;
  boundedJSON: (r: Request) => Promise<unknown>;
  json: (data: unknown, status?: number) => Response;
};
type Row = {
  seq: number;
  thread_key: string;
  sender_id: string;
  sender_label: string;
  recipient_id: string | null;
  body: string;
  sent_at: number;
};
const message = (r: Row): ChatMessage => ({
  seq: r.seq,
  senderId: r.sender_id,
  senderName: r.sender_label,
  body: r.body,
  sentAt: r.sent_at,
});
// Only membership is cached, in private D1, for at most 15 seconds. Failed refreshes fail closed.
async function members(env: Env, deps: Dependencies): Promise<Member[]> {
  const hit = await env.DB.prepare(
    "SELECT payload FROM chat_membership WHERE key=? AND expires_at>?",
  )
    .bind("guild", Date.now())
    .first<{ payload: string }>();
  if (hit) return z.array(MemberSchema).parse(JSON.parse(hit.payload));
  const current = (await deps.readRepository(env)).document.members;
  await env.DB.prepare(
    "INSERT INTO chat_membership(key,payload,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at",
  )
    .bind("guild", JSON.stringify(current), Date.now() + 15000)
    .run();
  return current;
}
export async function invalidateChatMembers(env: Env) {
  await env.DB.prepare("DELETE FROM chat_membership WHERE key=?")
    .bind("guild")
    .run();
}
export function conversation(
  identity: Identity,
  people: Member[],
  peer?: string,
) {
  if (!peer) return "general";
  if (
    peer === identity.id ||
    !people.some((m) => m.id === peer && m.status === "active")
  )
    throw new ChangeError("Choose another active guild member.", 403);
  return `dm:${[identity.id, peer].sort().join(":")}`;
}
export async function handleChat(
  req: Request,
  env: Env,
  deps: Dependencies,
): Promise<Response | undefined> {
  const u = new URL(req.url);
  if (!u.pathname.startsWith("/api/chat/")) return;
  const identity = await deps.authenticated(req, env);
  await deps.limit(
    env,
    `chat-${req.method === "GET" ? "read" : u.pathname.endsWith("/messages") ? "send" : "seen"}:${identity.id}`,
    req.method === "POST" && u.pathname.endsWith("/messages") ? 20 : 90,
  );
  const all = await members(env, deps);
  if (
    !identity.admin &&
    !all.some((m) => m.id === identity.id && m.status === "active")
  )
    throw new ChangeError("Guild chat is available to approved members.", 403);
  const active = all.filter((m) => m.status === "active");
  if (u.pathname === "/api/chat/status" && req.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT m.thread_key, COUNT(*) AS count FROM chat_messages m
      LEFT JOIN chat_reads r ON r.member_id=? AND r.thread_key=m.thread_key
      WHERE (m.recipient_id IS NULL OR m.recipient_id=?) AND m.sender_id<>? AND m.seq>COALESCE(r.last_seq,0)
      GROUP BY m.thread_key`,
    )
      .bind(identity.id, identity.id, identity.id)
      .all<{ thread_key: string; count: number }>();
    const unread: Record<string, number> = {};
    for (const row of rows.results) {
      const peer =
        row.thread_key === "general"
          ? "general"
          : row.thread_key
              .split(":")
              .find((v) => v !== "dm" && v !== identity.id);
      if (peer && (peer === "general" || active.some((m) => m.id === peer)))
        unread[peer] = row.count;
    }
    return deps.json({
      people: active
        .filter((m) => m.id !== identity.id)
        .map(({ id, label, role }) => ({ id, label, role })),
      unread,
    });
  }
  if (u.pathname === "/api/chat/messages" && req.method === "GET") {
    const query = z
      .object({
        peer: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,100}$/)
          .optional(),
        after: z.coerce
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER)
          .optional(),
        before: z.coerce
          .number()
          .int()
          .positive()
          .max(Number.MAX_SAFE_INTEGER)
          .optional(),
      })
      .strict()
      .parse(Object.fromEntries(u.searchParams));
    if (query.after !== undefined && query.before !== undefined)
      throw new ChangeError("Choose one message cursor.");
    const thread = conversation(identity, all, query.peer);
    const forward = query.after !== undefined;
    const rows = await env.DB.prepare(
      `SELECT * FROM chat_messages WHERE thread_key=? AND seq${forward ? ">" : "<"}? ORDER BY seq ${forward ? "ASC" : "DESC"} LIMIT 51`,
    )
      .bind(thread, query.after ?? query.before ?? Number.MAX_SAFE_INTEGER)
      .all<Row>();
    const slice = rows.results.slice(0, 50);
    return deps.json({
      messages: (forward ? slice : slice.reverse()).map(message),
      hasMore: rows.results.length > 50,
    });
  }
  if (u.pathname === "/api/chat/messages" && req.method === "POST") {
    const input = ChatSendSchema.parse(await deps.boundedJSON(req));
    try {
      rejectCredentials(input.body);
    } catch {
      throw new ChangeError(
        "That message looks like it contains a credential. Remove it before sending.",
      );
    }
    const thread = conversation(identity, all, input.peer);
    await env.DB.prepare(
      "INSERT INTO chat_messages(thread_key,sender_id,sender_label,recipient_id,body,sent_at,client_id) VALUES(?,?,?,?,?,?,?) ON CONFLICT(sender_id,client_id) DO NOTHING",
    )
      .bind(
        thread,
        identity.id,
        identity.label,
        input.peer || null,
        input.body,
        Date.now(),
        input.clientId,
      )
      .run();
    const saved = await env.DB.prepare(
      "SELECT * FROM chat_messages WHERE sender_id=? AND client_id=?",
    )
      .bind(identity.id, input.clientId)
      .first<Row>();
    if (!saved || saved.thread_key !== thread || saved.body !== input.body)
      throw new ChangeError(
        "This send was already used for another message. Refresh before trying again.",
        409,
      );
    return deps.json({ message: message(saved) });
  }
  if (u.pathname === "/api/chat/read" && req.method === "POST") {
    const input = ChatReadSchema.parse(await deps.boundedJSON(req));
    const thread = conversation(identity, all, input.peer);
    // A caller cannot move the read cursor beyond a real message in their conversation.
    const last = await env.DB.prepare(
      "SELECT MAX(seq) AS seq FROM chat_messages WHERE thread_key=? AND seq<=?",
    )
      .bind(thread, input.through)
      .first<{ seq: number | null }>();
    await env.DB.prepare(
      "INSERT INTO chat_reads(member_id,thread_key,last_seq) VALUES(?,?,?) ON CONFLICT(member_id,thread_key) DO UPDATE SET last_seq=MAX(last_seq,excluded.last_seq)",
    )
      .bind(identity.id, thread, last?.seq || 0)
      .run();
    return deps.json({ ok: true });
  }
  return deps.json({ error: "Chat route not found." }, 404);
}
