import { describe, it, expect, vi } from "vitest";
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
    GITHUB_TOKEN: "test-service-value",
    IDENTITY_KEY: "test-identity-key-long-enough",
    APP_ORIGIN: "https://theforcebe.github.io",
    PUBLIC_API_URL: "https://gateway.example",
    GITHUB_REPOSITORY: "theforcebe/onslaught",
    ADMIN_BNET_IDS: "123",
    MEMBER_BNET_IDS: "456",
  } as unknown as Env;
  return { env, rows };
}
const ctx = { waitUntil: () => {} } as any;
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
