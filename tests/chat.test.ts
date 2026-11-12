import { afterEach, describe, it, expect, vi } from "vitest";
import worker, { digest, type Env } from "../server/worker";
import { chatDatabase } from "./chat-db";
import { privateFixture } from "./access-fixture";
import { invalidateChatMembers } from "../server/chat";
const databases: ReturnType<typeof chatDatabase>[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const d of databases.splice(0)) d.sqlite.close();
});
async function setup() {
  const db = chatDatabase();
  databases.push(db);
  let doc = privateFixture();
  doc.members = ["alice", "bob", "carol", "admin"].map((id) => ({
    ...doc.members[0],
    id,
    label: `${id}#1234`,
    sections: [],
    role: id === "admin" ? ("admin" as const) : ("guild_member" as const),
  }));
  const env = {
    DB: db.db,
    BNET_CLIENT_ID: "fixture-client",
    BNET_CLIENT_SECRET: "fixture-secret",
    GITHUB_TOKEN: "github_pat_" + "f".repeat(60),
    IDENTITY_KEY: "fixture-key",
    APP_ORIGIN: "https://app.example",
    PUBLIC_API_URL: "https://gateway.example",
    GITHUB_REPOSITORY: "guild/private",
    ADMIN_BNET_IDS: "",
  } as Env;
  const tokens: Record<string, string> = {};
  for (const id of ["alice", "bob", "carol", "admin", "outsider"]) {
    const token = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64url");
    tokens[id] = token;
    db.sqlite
      .prepare("INSERT INTO auth_records VALUES(?,?,?)")
      .run(
        `session:${await digest(token)}`,
        JSON.stringify({ subject: "123", id, label: `${id}#1234` }),
        Date.now() + 3600000,
      );
  }
  const upstream = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      doc = JSON.parse(
        Buffer.from(JSON.parse(String(init.body)).content, "base64").toString(),
      );
      return Response.json({});
    }
    if (url.includes("/contents/"))
      return Response.json({
        sha: "fixture",
        content: Buffer.from(JSON.stringify(doc)).toString("base64"),
      });
    return Response.json({ private: true });
  });
  vi.stubGlobal("fetch", upstream);
  const call = async (
    id: string,
    path: string,
    body?: unknown,
    origin = env.APP_ORIGIN,
  ) => {
    const r = await worker.fetch(
      new Request(
        `${env.PUBLIC_API_URL}${path.startsWith("/") ? path : "/api/chat/" + path}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: origin,
            ...(tokens[id] ? { Authorization: `Bearer ${tokens[id]}` } : {}),
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      ),
      env,
      { waitUntil: () => {} } as any,
    );
    return {
      status: r.status,
      data: (await r.json()) as any,
      headers: r.headers,
    };
  };
  const send = (
    id: string,
    body: string,
    peer?: string,
    clientId = crypto.randomUUID(),
  ) => call(id, "messages", { body, clientId, ...(peer ? { peer } : {}) });
  return { db, env, doc, call, send, upstream };
}
describe("private guild messenger", () => {
  it("rejects anonymous, unapproved, suspended and cross-origin access", async () => {
    const { call, doc } = await setup();
    doc.members.find((m) => m.id === "bob")!.status = "pending";
    doc.members.find((m) => m.id === "carol")!.status = "suspended";
    expect((await call("anonymous", "status")).status).toBe(401);
    for (const id of ["outsider", "bob", "carol"])
      expect((await call(id, "messages")).status).toBe(403);
    expect(
      (
        await call(
          "alice",
          "messages",
          { body: "Hi", clientId: crypto.randomUUID() },
          "https://evil.example",
        )
      ).status,
    ).toBe(403);
  });
  it("lets every approved rank chat without section grants; the directory has no Discord IDs, grants or account IDs", async () => {
    const { call, send, doc } = await setup();
    doc.members[0].role = "raider";
    doc.members[1].role = "officer";
    for (const id of ["alice", "bob", "carol", "admin"])
      expect((await send(id, "Hello guild")).status).toBe(200);
    const result = await call("alice", "status");
    expect(result.data.people.map((m: any) => Object.keys(m).sort())).toEqual(
      Array(3).fill(["id", "label", "role"]),
    );
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect((await call("alice", "messages")).data.messages).toHaveLength(4);
  });
  it("keeps DMs between participants even when a third member is an admin", async () => {
    const { call, send } = await setup();
    await send("alice", "PRIVATE A AND B", "bob");
    expect(
      (await call("bob", "messages?peer=alice")).data.messages[0].body,
    ).toBe("PRIVATE A AND B");
    for (const id of ["carol", "admin"]) {
      expect((await call(id, "messages?peer=alice")).data.messages).toEqual([]);
      expect((await call(id, "messages?peer=bob")).data.messages).toEqual([]);
      expect((await call(id, "status")).data.unread).toEqual({});
    }
    expect((await call("carol", "messages?thread=dm:alice:bob")).status).toBe(
      400,
    );
    expect((await call("alice", "messages")).data.messages).toEqual([]);
    expect((await call("bob", "status")).data.unread).toEqual({ alice: 1 });
  });
  it("does not accept a spoofed sender, self-DM, missing recipient or a credential", async () => {
    const { call, send } = await setup();
    expect(
      (
        await call("alice", "messages", {
          body: "Fake",
          clientId: crypto.randomUUID(),
          senderId: "bob",
        })
      ).status,
    ).toBe(400);
    expect((await send("alice", "Hello", "alice")).status).toBe(403);
    expect((await send("alice", "Hello", "outsider")).status).toBe(403);
    expect(
      (await send("alice", "client_secret=fictional-credential")).status,
    ).toBe(400);
    expect((await send("alice", " ")).status).toBe(400);
    expect((await send("alice", "x".repeat(2001))).status).toBe(400);
  });
  it("makes retries idempotent and rejects a nonce reused for another message or conversation", async () => {
    const { send, call } = await setup(),
      id = crypto.randomUUID();
    const first = await send("alice", "Hello", "bob", id),
      retry = await send("alice", "Hello", "bob", id);
    expect(retry.data.message.seq).toBe(first.data.message.seq);
    expect((await send("alice", "Different", "bob", id)).status).toBe(409);
    expect((await send("alice", "Hello", "carol", id)).status).toBe(409);
    expect(
      (await call("bob", "messages?peer=alice")).data.messages,
    ).toHaveLength(1);
  });
  it("paginates older and incremental history without gaps", async () => {
    const { db, call } = await setup();
    const insert = db.sqlite.prepare(
      "INSERT INTO chat_messages(thread_key,sender_id,sender_label,body,sent_at,client_id) VALUES('general','bob','Bob',?,?,?)",
    );
    for (let i = 1; i <= 123; i++)
      insert.run(`Message ${i}`, Date.now(), crypto.randomUUID());
    const latest = (await call("alice", "messages")).data;
    expect(latest.messages.map((m: any) => m.seq)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 74),
    );
    expect(latest.hasMore).toBe(true);
    expect(
      (await call("alice", "messages?before=74")).data.messages[0].seq,
    ).toBe(24);
    const forward = (await call("alice", "messages?after=0")).data;
    expect(forward.messages.at(-1).seq).toBe(50);
    expect(forward.hasMore).toBe(true);
    expect(
      (await call("alice", "messages?after=100")).data.messages,
    ).toHaveLength(23);
    expect((await call("alice", "messages?after=100")).data.hasMore).toBe(
      false,
    );
  });
  it("clamps read receipts to visible messages and never moves a read cursor backward", async () => {
    const { call, send } = await setup();
    await send("bob", "One");
    await send("bob", "Two");
    await send("bob", "Secret", "carol");
    await call("alice", "read", { through: 999999 });
    await call("alice", "read", { through: 0 });
    expect((await call("alice", "status")).data.unread).toEqual({});
    await send("bob", "Three");
    expect((await call("alice", "status")).data.unread).toEqual({ general: 1 });
    expect((await call("carol", "status")).data.unread.bob).toBe(1);
  });
  it("throttles messages and caches only membership for a bounded interval", async () => {
    const { send, call, upstream, db, doc } = await setup();
    for (let i = 0; i < 20; i++)
      expect((await send("alice", `Hello ${i}`)).status).toBe(200);
    expect((await send("alice", "Too many")).status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(2);
    doc.members[0].status = "suspended";
    db.sqlite.prepare("UPDATE chat_membership SET expires_at=0").run();
    expect((await call("alice", "messages")).status).toBe(403);
  });
  it("fails closed when refreshing membership fails and invalidates on access changes", async () => {
    const { call, upstream, env, db } = await setup();
    await call("alice", "status");
    const changed = await call("admin", "/api/members", {
      id: "suspend",
      expectedRevision: 0,
      member: {
        id: "alice",
        label: "alice#1234",
        status: "suspended",
        role: "guild_member",
        sections: [],
        allTeams: false,
        teamIds: ["vanguard"],
      },
    });
    expect(changed.status).toBe(200);
    expect(
      db.sqlite.prepare("SELECT COUNT(*) AS n FROM chat_membership").get()?.n,
    ).toBe(0);
    expect((await call("alice", "messages")).status).toBe(403);
    await invalidateChatMembers(env);
    upstream.mockRejectedValue(new Error("offline"));
    expect((await call("bob", "messages")).status).toBe(500);
  });
});
