import { describe, it, expect, vi, afterEach } from "vitest";
import { privateFixture } from "./access-fixture";
import worker, { digest, cors } from "../server/worker";
import type { Env } from "../server/worker";
function environment() {
  const rows = new Map<string, { payload: string; expires_at: number }>();
  const db = {
    prepare(sql: string) {
      let args: any[] = [];
      return {
        bind(...a: any[]) {
          args = a;
          return this;
        },
        async run() {
          if (sql.startsWith("INSERT INTO auth_records"))
            rows.set(args[0], { payload: args[1], expires_at: args[2] });
          if (sql.startsWith("DELETE FROM auth_records WHERE key="))
            rows.delete(args[0]);
          return { success: true };
        },
        async first() {
          if (sql.includes("rate_limits")) return { count: 1 };
          const row = rows.get(args[0]);
          if (!row || row.expires_at <= args[1]) return null;
          if (sql.startsWith("DELETE")) rows.delete(args[0]);
          return { payload: row.payload };
        },
      };
    },
  };
  const env = {
    DB: db,
    BNET_CLIENT_ID: "test-client",
    BNET_CLIENT_SECRET: "test-secret",
    GITHUB_TOKEN: "github_pat_" + "t".repeat(60),
    IDENTITY_KEY: "test-identity-key-long-enough",
    APP_ORIGIN: "https://theforcebe.github.io",
    PUBLIC_API_URL: "https://gateway.example",
    GITHUB_REPOSITORY: "theforcebe/onslaught-data",
    ADMIN_BNET_IDS: "123",
  } as unknown as Env;
  return { env, rows };
}
const ctx = { waitUntil: () => {} } as any;
afterEach(() => vi.unstubAllGlobals());
function mockRepository(doc = privateFixture(), isPrivate = true) {
  const writes: any[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      // workerd supports manual/follow, not Fetch's "error" redirect mode.
      // Service credentials must never be forwarded by automatic redirects.
      expect(init?.redirect).toBe("manual");
      if (init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));
        return Response.json({});
      }
      if (url.endsWith("/onslaught-data"))
        return Response.json({ private: isPrivate });
      if (url.includes("/contents/data/guild.json"))
        return Response.json({
          sha: "sha",
          content: Buffer.from(JSON.stringify(doc)).toString("base64"),
        });
      throw Error("Unexpected upstream request");
    }),
  );
  return writes;
}
const post = (
  path: string,
  body: unknown,
  origin = "https://theforcebe.github.io",
  headers = {},
) =>
  new Request(`https://gateway.example${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
describe("credential and OAuth boundaries", () => {
  it.each(["officer", "raider", "guild_member"] as const)(
    "saves an admin's %s assignment with individual grants in the private repository",
    async (role) => {
      const doc = privateFixture(),
        writes = mockRepository(doc),
        { env, rows } = environment();
      const token = "t".repeat(43);
      rows.set(`session:${await digest(token)}`, {
        payload: JSON.stringify({
          subject: "123",
          id: "owner-id",
          label: "Owner",
        }),
        expires_at: Date.now() + 3600000,
      });
      const response = await worker.fetch(
        post(
          "/api/members",
          {
            id: "rank-change",
            expectedRevision: 0,
            member: {
              ...doc.members[0],
              role,
              sections: ["gear"],
              allTeams: false,
              teamIds: ["vanguard"],
            },
          },
          env.APP_ORIGIN,
          { Authorization: `Bearer ${token}` },
        ),
        env,
        ctx,
      );
      expect(response.status).toBe(200);
      const view = (await response.json()) as any;
      expect(view.members[0].role).toBe(role);
      expect(view.members[0].sections).toEqual(["gear"]);
      expect(writes).toHaveLength(1);
      const saved = JSON.parse(
        Buffer.from(writes[0].content, "base64").toString("utf8"),
      );
      expect(saved.members[0]).toMatchObject({
        role,
        sections: ["gear"],
        teamIds: ["vanguard"],
        allTeams: false,
      });
    },
  );
  it("starts new applicants as pending Guild Members without private grants", async () => {
    const writes = mockRepository(),
      { env, rows } = environment();
    const token = "t".repeat(43);
    rows.set(`session:${await digest(token)}`, {
      payload: JSON.stringify({
        subject: "456",
        id: "new-account",
        label: "New member",
      }),
      expires_at: Date.now() + 3600000,
    });
    const response = await worker.fetch(
      post("/api/join", {}, env.APP_ORIGIN, {
        Authorization: `Bearer ${token}`,
      }),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    const view = (await response.json()) as any;
    expect(view.identity).toMatchObject({
      provider: "battlenet",
      id: "new-account",
      admin: false,
      accountId: "456",
    });
    expect(view.access).toMatchObject({
      status: "pending",
      role: "guild_member",
      admin: false,
      sections: [],
      allTeams: false,
      teamIds: [],
    });
    expect(view.members).toBeUndefined();
    const saved = JSON.parse(
      Buffer.from(writes[0].content, "base64").toString("utf8"),
    );
    expect(
      saved.members.find((m: any) => m.id === "new-account"),
    ).toMatchObject({ role: "guild_member", status: "pending", sections: [] });
  });
  it("only permits the exact configured CORS origin", () => {
    const { env } = environment();
    expect(cors("https://attacker.example", env)).toEqual({});
    expect(cors("https://theforcebe.github.io.evil.example", env)).toEqual({});
    expect(cors(env.APP_ORIGIN, env)["Access-Control-Allow-Origin"]).toBe(
      env.APP_ORIGIN,
    );
  });
  it("rejects cross-origin writes before authentication or repository access", async () => {
    const { env } = environment();
    const r = await worker.fetch(
      post("/api/change", {}, "https://evil.example"),
      env,
      ctx,
    );
    expect(r.status).toBe(403);
    expect(r.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
  it("rejects writes without an authenticated session", async () => {
    const { env } = environment();
    const r = await worker.fetch(post("/api/change", {}), env, ctx);
    expect(r.status).toBe(401);
  });
  it("fails closed if credentials are not configured", async () => {
    const { env } = environment();
    env.BNET_CLIENT_SECRET = "";
    const r = await worker.fetch(
      new Request("https://gateway.example/auth/start?challenge=bad"),
      env,
      ctx,
    );
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("test-service-value");
  });
  it("binds OAuth state to a secure HTTP-only same-site cookie", async () => {
    const { env, rows } = environment();
    const challenge = await digest("a".repeat(70));
    const r = await worker.fetch(
      new Request(`https://gateway.example/auth/start?challenge=${challenge}`),
      env,
      ctx,
    );
    expect(r.status).toBe(302);
    expect(r.headers.get("Set-Cookie")).toContain(
      "HttpOnly; Secure; SameSite=Lax",
    );
    expect(r.headers.get("Location")).toContain("scope=openid");
    expect([...rows.keys()][0]).toMatch(/^oauth:/);
    expect(r.headers.get("Location")).not.toContain("test-secret");
  });
  it("rejects callbacks without the matching state cookie and returns no secret", async () => {
    const { env } = environment();
    const r = await worker.fetch(
      new Request(
        "https://gateway.example/auth/callback?state=bad&code=untrusted",
      ),
      env,
      ctx,
    );
    const body = await r.text();
    expect(body).toContain('"error":true');
    expect(body).not.toContain("test-secret");
    expect(r.headers.get("Content-Security-Policy")).toContain(
      "default-src 'none'",
    );
  });
  it("requires a matching proof key and consumes redemption codes once", async () => {
    const { env, rows } = environment();
    const code = "c".repeat(43),
      verifier = "v".repeat(72);
    rows.set(`exchange:${await digest(code)}`, {
      payload: JSON.stringify({
        challenge: await digest(verifier),
        subject: "456",
        id: "member-id",
        label: "Tag#123",
      }),
      expires_at: Date.now() + 60000,
    });
    const r = await worker.fetch(
      post("/auth/exchange", { code, verifier }),
      env,
      ctx,
    );
    expect(r.status).toBe(200);
    const data = (await r.json()) as any;
    expect(data.token).toHaveLength(43);
    expect(data.identity.admin).toBe(false);
    expect([...rows.keys()].every((k) => !k.includes(data.token))).toBe(true);
    expect(
      await (
        await worker.fetch(post("/auth/exchange", { code, verifier }), env, ctx)
      ).text(),
    ).toContain("expired");
  });
  it("rejects incorrect proof keys", async () => {
    const { env, rows } = environment();
    const code = "c".repeat(43);
    rows.set(`exchange:${await digest(code)}`, {
      payload: JSON.stringify({
        challenge: await digest("correct".repeat(12)),
        subject: "123",
      }),
      expires_at: Date.now() + 60000,
    });
    const r = await worker.fetch(
      post("/auth/exchange", { code, verifier: "wrong".repeat(15) }),
      env,
      ctx,
    );
    expect(r.status).toBe(401);
  });
  it("checks current membership for already-issued sessions", async () => {
    mockRepository();
    const { env, rows } = environment();
    const token = "t".repeat(43);
    rows.set(`session:${await digest(token)}`, {
      payload: JSON.stringify({
        subject: "789",
        id: "former-member",
        label: "Former",
      }),
      expires_at: Date.now() + 3600000,
    });
    const r = await worker.fetch(
      post("/api/change", {}, env.APP_ORIGIN, {
        Authorization: `Bearer ${token}`,
      }),
      env,
      ctx,
    );
    expect(r.status).toBe(403);
  });
  it("serves public roster and schedule without serializing private data", async () => {
    mockRepository();
    const { env } = environment();
    const r = await worker.fetch(
      new Request("https://gateway.example/api/public"),
      env,
      ctx,
    );
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain("Public second raid");
    expect(body).not.toContain("PRIVATE-");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
  it("refuses a data repository made public", async () => {
    mockRepository(privateFixture(), false);
    const { env } = environment();
    const r = await worker.fetch(
      new Request("https://gateway.example/api/public"),
      env,
      ctx,
    );
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("PRIVATE-");
  });
  it("requires authentication for private reads and member management", async () => {
    const { env } = environment();
    expect(
      (
        await worker.fetch(
          new Request("https://gateway.example/api/state"),
          env,
          ctx,
        )
      ).status,
    ).toBe(401);
    expect(
      (await worker.fetch(post("/api/members", {}), env, ctx)).status,
    ).toBe(401);
  });
  it("filters read and write responses, then applies revocation to the same session", async () => {
    const doc = privateFixture(),
      writes = mockRepository(doc),
      { env, rows } = environment();
    const token = "t".repeat(43);
    rows.set(`session:${await digest(token)}`, {
      payload: JSON.stringify({
        subject: "456",
        id: "member-id",
        label: "Member",
      }),
      expires_at: Date.now() + 3600000,
    });
    const headers = { Authorization: `Bearer ${token}` };
    const read = () =>
      worker.fetch(
        new Request("https://gateway.example/api/state", { headers }),
        env,
        ctx,
      );
    expect(await (await read()).text()).not.toContain("PRIVATE-SECOND");
    const write = await worker.fetch(
      post(
        "/api/change",
        {
          version: 1,
          id: "test-write",
          expectedRevision: 0,
          action: {
            type: "character.update",
            characterId: doc.state.characters[0].id,
            role: "ranged",
            spec: "Beast Mastery",
            notes: "Updated",
          },
        },
        env.APP_ORIGIN,
        headers,
      ),
      env,
      ctx,
    );
    expect(write.status).toBe(200);
    expect(await write.text()).not.toContain("PRIVATE-SECOND");
    expect(writes).toHaveLength(1);
    doc.members[0].status = "suspended";
    expect(await (await read()).text()).not.toContain("PRIVATE-");
    const denied = await worker.fetch(
      post("/api/change", {}, env.APP_ORIGIN, headers),
      env,
      ctx,
    );
    expect(denied.status).toBe(403);
    expect(writes).toHaveLength(1);
  });
  it("does not trust forged administrator fields or allow a raider to promote themselves", async () => {
    const doc = privateFixture();
    mockRepository(doc);
    const { env, rows } = environment();
    const token = "t".repeat(43);
    rows.set(`session:${await digest(token)}`, {
      payload: JSON.stringify({
        subject: "456",
        id: "member-id",
        label: "Member",
      }),
      expires_at: Date.now() + 3600000,
    });
    const headers = { Authorization: `Bearer ${token}` };
    const r = await worker.fetch(
      post(
        "/api/members",
        {
          id: "promote",
          expectedRevision: 0,
          member: { ...doc.members[0], role: "admin" },
        },
        env.APP_ORIGIN,
        headers,
      ),
      env,
      ctx,
    );
    expect(r.status).toBe(403);
    const forged = await worker.fetch(
      post(
        "/api/change",
        {
          version: 1,
          id: "forged",
          expectedRevision: 0,
          admin: true,
          action: { type: "team.save", team: doc.state.teams[0] },
        },
        env.APP_ORIGIN,
        headers,
      ),
      env,
      ctx,
    );
    expect(forged.status).toBe(400);
  });
  it("revokes sessions on logout", async () => {
    const { env, rows } = environment();
    const token = "t".repeat(43);
    rows.set(`session:${await digest(token)}`, {
      payload: "{}",
      expires_at: Date.now() + 3600000,
    });
    await worker.fetch(
      post("/auth/logout", {}, env.APP_ORIGIN, {
        Authorization: `Bearer ${token}`,
      }),
      env,
      ctx,
    );
    expect(rows.size).toBe(0);
  });
  it("rejects over-sized requests before parsing", async () => {
    const { env } = environment();
    const r = await worker.fetch(
      post("/auth/exchange", { huge: "a".repeat(150001) }),
      env,
      ctx,
    );
    expect(r.status).toBe(413);
  });
});
