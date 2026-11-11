import { describe, it, expect, vi, afterEach } from "vitest";
import {
  handleDiscord,
  discordFetch,
  discordMessage,
  DiscordError,
} from "../server/discord";
import type { Env } from "../server/worker";
import { privateFixture } from "./access-fixture";
import { digest } from "../server/worker";
const guild = "1346205094550700072",
  channel = "1570172913955377303";
function setup() {
  const doc = privateFixture();
  doc.members[0].role = "officer";
  const now = new Date().toISOString();
  doc.state.community = {
    announcements: [
      {
        id: "announcement",
        title: "Guild message",
        body: "Hello @everyone <@123>",
        createdBy: "member-id",
        createdByName: "Officer",
        createdAt: now,
        teamId: "vanguard",
      },
    ],
    polls: [
      {
        id: "poll",
        title: "Which night?",
        options: ["Tue 7 PM", "Fri 7 PM"],
        timeZone: "America/Los_Angeles",
        closesAt: new Date(Date.now() + 86400000).toISOString(),
        voting: "discord",
        closed: false,
        votes: {},
        createdBy: "member-id",
        createdByName: "Officer",
        createdAt: now,
        teamId: "vanguard",
      },
    ],
    requests: [
      {
        id: "request",
        item: "Dreamfoil",
        quantity: 40,
        recipientId: "member-id",
        recipientName: "Officer",
        createdBy: "member-id",
        createdByName: "Officer",
        createdAt: now,
        updatedAt: now,
        notes: "For flasks",
        fulfilled: 0,
        cancelled: false,
        updates: [],
        teamId: "vanguard",
      },
    ],
    replies: [],
  };
  const records = new Map<string, string>();
  records.set(
    "config:guild",
    JSON.stringify({
      guildId: guild,
      pollsChannelId: channel,
      announcementsChannelId: channel,
      requestsChannelId: channel,
    }),
  );
  const links = new Map<string, any>();
  const db = {
    prepare(sql: string) {
      let args: any[] = [];
      return {
        bind(...values: any[]) {
          args = values;
          return this;
        },
        async all() {
          return {
            results: [...links.entries()].map(([id, l]) => ({
              member_id: id,
              dm_opt_in: l.dm_opt_in,
            })),
          };
        },
        async first() {
          if (sql.startsWith("SELECT payload FROM discord_config"))
            return records.has("config:" + args[0])
              ? { payload: records.get("config:" + args[0]) }
              : null;
          if (sql.startsWith("SELECT payload FROM discord_deliveries"))
            return records.has(args[0])
              ? { payload: records.get(args[0]) }
              : null;
          if (sql.startsWith("SELECT member_id,discord_id"))
            return links.get(args[0]) || null;
          if (sql.startsWith("INSERT INTO discord_deliveries")) {
            if (records.has(args[0])) return null;
            records.set(args[0], args[1]);
            return { key: args[0] };
          }
          if (sql.startsWith("UPDATE discord_deliveries")) {
            const old = JSON.parse(records.get(args[1]) || "null");
            if (old?.status !== "failed") return null;
            records.set(args[1], args[0]);
            return { key: args[1] };
          }
          if (sql.includes("auth_records")) {
            const raw = records.get(args[0]);
            if (sql.startsWith("DELETE")) records.delete(args[0]);
            return raw ? { payload: raw } : null;
          }
          return null;
        },
        async run() {
          if (sql.startsWith("UPDATE discord_deliveries"))
            records.set(args[1], args[0]);
          if (sql.startsWith("INSERT INTO auth_records"))
            records.set(args[0], args[1]);
          if (sql.startsWith("UPDATE discord_links")) {
            const l = links.get(args[1]);
            if (l) l.dm_opt_in = args[0];
          }
          return { success: true };
        },
      };
    },
  };
  const env = {
    DB: db,
    DISCORD_BOT_TOKEN: "test-only-bot-credential",
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "test-only-oauth-secret",
    APP_ORIGIN: "https://theforcebe.github.io",
    PUBLIC_API_URL: "https://gateway.example",
    ADMIN_BNET_IDS: "",
  } as unknown as Env;
  let identity = {
    provider: "battlenet" as const,
    id: "member-id",
    label: "Officer",
    admin: false,
  };
  const deps = {
    authenticated: async () => identity,
    readRepository: async () => ({
      document: doc,
      sha: "sha",
      url: "https://repo.example",
    }),
    digest,
    json: (x: unknown, status = 200) => Response.json(x, { status }),
    boundedJSON: (r: Request) => r.json(),
    limit: async () => {},
  };
  const call = (path: string, body?: unknown) =>
    handleDiscord(
      new Request("https://gateway.example" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + "a".repeat(43),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      deps,
    );
  return { doc, env, deps, call, records, links, identity };
}
afterEach(() => vi.unstubAllGlobals());
describe("Discord integration boundaries", () => {
  it("builds native polls with one source of voting and suppresses mentions", () => {
    const s = setup();
    const m = discordMessage(s.doc, "poll", "poll");
    expect(m.poll.answers).toHaveLength(2);
    expect(m.poll.allow_multiselect).toBe(true);
    expect(m.allowed_mentions).toEqual({ parse: [] });
    expect(
      discordMessage(s.doc, "announcement", "announcement").allowed_mentions,
    ).toEqual({ parse: [] });
  });
  it("never follows redirects with the bot credential or includes secrets in errors", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        expect(init.redirect).toBe("manual");
        expect(init.headers.Authorization).toBe("Bot test-only-bot-credential");
        return new Response("test-only-bot-credential", {
          status: 302,
          headers: { Location: "https://evil.example" },
        });
      }),
    );
    await expect(discordFetch(s.env, `/channels/${channel}`)).rejects.toThrow(
      "could not complete",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("requires Admin or Officer and current team/section access for sends", async () => {
    const s = setup();
    s.doc.members[0].role = "raider";
    await expect(
      s.call("/api/discord/send", {
        kind: "announcement",
        id: "announcement",
        destination: "channel",
      }),
    ).rejects.toThrow("Admin or Officer");
    s.doc.members[0].role = "officer";
    s.doc.members[0].teamIds = ["second"];
    await expect(
      s.call("/api/discord/send", {
        kind: "announcement",
        id: "announcement",
        destination: "channel",
      }),
    ).rejects.toThrow("not available");
  });
  it("requires active membership even for connection status", async () => {
    const s = setup();
    s.doc.members[0].status = "suspended";
    await expect(s.call("/api/discord/status")).rejects.toThrow("Active guild");
  });
  it("keeps another member’s Discord identity and credentials out of status", async () => {
    const s = setup();
    s.links.set("someone-else", {
      member_id: "someone-else",
      discord_id: "999999999999999999",
      display_name: "Other user",
      dm_opt_in: 1,
    });
    s.doc.members.push({
      ...s.doc.members[0],
      id: "someone-else",
      label: "Approved helper",
      role: "guild_member",
      sections: [],
      teamIds: [],
    });
    const r = await s.call("/api/discord/status");
    const data = (await r!.json()) as any;
    expect(data.ownLink).toBeNull();
    expect(data.recipients).toEqual([{ id: "someone-else", dmOptIn: true }]);
    expect(data.config).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("999999");
    expect(JSON.stringify(data)).not.toContain("test-only");
  });
  it("posts once and returns the prior receipt on a retry", async () => {
    const s = setup();
    const mock = vi.fn(async (_u, init) =>
      init?.method === "POST"
        ? Response.json({ id: "123456789012345678" })
        : Response.json({ guild_id: guild, type: 0 }),
    );
    vi.stubGlobal("fetch", mock);
    const input = {
      kind: "announcement",
      id: "announcement",
      destination: "channel",
    };
    const first = await s.call("/api/discord/send", input);
    const second = await s.call("/api/discord/send", input);
    expect(await second!.json()).toEqual(await first!.json());
    expect(mock.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(
      1,
    );
    const body = JSON.parse(
      mock.mock.calls.find((c) => c[1]?.method === "POST")![1].body,
    );
    expect(body.enforce_nonce).toBe(true);
    expect(body.allowed_mentions.parse).toEqual([]);
  });
  it("rejects channels from another server before posting", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ guild_id: "999999999999999999" })),
    );
    await expect(
      s.call("/api/discord/send", {
        kind: "announcement",
        id: "announcement",
        destination: "channel",
      }),
    ).rejects.toThrow("outside");
    expect(s.records.has("announcement:announcement:channel")).toBe(false);
  });
  it("requires explicit recipient opt-in and linked identity before creating a DM", async () => {
    const s = setup();
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      s.call("/api/discord/send", {
        kind: "request",
        id: "request",
        destination: "dm",
      }),
    ).rejects.toThrow("opted into");
    expect(fetch).not.toHaveBeenCalled();
    s.doc.members[0].sections = []; // Assigned recipients remain eligible for a DM without a private section grant.
    s.links.set("member-id", {
      member_id: "member-id",
      discord_id: "123456789012345678",
      display_name: "Officer",
      dm_opt_in: 1,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) =>
        String(url).includes("/members/")
          ? Response.json({ user: { id: "123456789012345678" } })
          : String(url).endsWith("/users/@me/channels")
            ? Response.json({ id: "888888888888888888" })
            : Response.json({ id: "777777777777777777" }),
      ),
    );
    const r = await s.call("/api/discord/send", {
      kind: "request",
      id: "request",
      destination: "dm",
    });
    expect(((await r!.json()) as any).receipt.status).toBe("sent");
  });
  it("marks timeouts uncertain and prevents duplicate automatic retries", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        if (init?.method === "POST") throw new Error("network timeout");
        return Response.json({ guild_id: guild });
      }),
    );
    const input = {
      kind: "announcement",
      id: "announcement",
      destination: "channel",
    };
    await expect(s.call("/api/discord/send", input)).rejects.toBeInstanceOf(
      DiscordError,
    );
    expect(
      JSON.parse(s.records.get("announcement:announcement:channel")!).status,
    ).toBe("uncertain");
    await expect(s.call("/api/discord/send", input)).rejects.toThrow(
      "unconfirmed",
    );
  });
  it("sends a volunteer request once per claimed recipient while preserving retry protection", async () => {
    const s = setup();
    s.doc.state.community!.requests[0].openToGuild = true;
    s.doc.members.push({
      ...s.doc.members[0],
      id: "new-helper",
      label: "Helper",
      role: "guild_member",
      sections: [],
      teamIds: [],
    });
    for (const id of ["member-id", "new-helper"])
      s.links.set(id, {
        member_id: id,
        discord_id: "123456789012345678",
        display_name: id,
        dm_opt_in: 1,
      });
    const mock = vi.fn(async (url, init) =>
      String(url).includes("/members/")
        ? Response.json({ user: { id: "123456789012345678" } })
        : String(url).endsWith("/users/@me/channels")
          ? Response.json({ id: "888888888888888888" })
          : Response.json({ id: "777777777777777777" }),
    );
    vi.stubGlobal("fetch", mock);
    const input = { kind: "request", id: "request", destination: "dm" };
    await s.call("/api/discord/send", input);
    s.doc.state.community!.requests[0].recipientId = "new-helper";
    expect(
      (
        (await (await s.call(
          "/api/discord/delivery?kind=request&id=request&destination=dm",
        ))!.json()) as any
      ).receipt,
    ).toBeNull();
    await s.call("/api/discord/send", input);
    await s.call("/api/discord/send", input);
    expect(
      mock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/messages") && init?.method === "POST",
      ),
    ).toHaveLength(2);
  });
  it("handles rate limits as a visible retryable failure", async () => {
    const s = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) =>
        init?.method === "POST"
          ? new Response("{}", { status: 429 })
          : Response.json({ guild_id: guild }),
      ),
    );
    await expect(
      s.call("/api/discord/send", {
        kind: "announcement",
        id: "announcement",
        destination: "channel",
      }),
    ).rejects.toThrow("rate limiting");
    expect(
      JSON.parse(s.records.get("announcement:announcement:channel")!).status,
    ).toBe("failed");
  });
  it("mirrors native poll counts and keeps unknown results distinct from zero", async () => {
    const s = setup();
    s.records.set(
      "poll:poll:channel",
      JSON.stringify({
        status: "sent",
        destination: "channel",
        channelId: channel,
        messageId: "123456789012345678",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          poll: {
            results: {
              is_finalized: false,
              answer_counts: [{ id: 1, count: 4 }],
            },
          },
        }),
      ),
    );
    const r = await s.call(
      "/api/discord/delivery?kind=poll&id=poll&destination=channel",
    );
    expect(((await r!.json()) as any).receipt.counts).toEqual([4, 0]);
    s.records.set(
      "poll:poll:channel",
      JSON.stringify({
        status: "sent",
        destination: "channel",
        channelId: channel,
        messageId: "123456789012345678",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ poll: {} })),
    );
    const unknown = await s.call(
      "/api/discord/delivery?kind=poll&id=poll&destination=channel",
    );
    expect(((await unknown!.json()) as any).receipt.counts).toBeUndefined();
  });
  it("refuses OAuth callbacks without the matching browser cookie", async () => {
    const s = setup();
    vi.stubGlobal("fetch", vi.fn());
    const r = await s.call("/discord/callback?state=forged&code=untrusted");
    expect(await r!.text()).toContain("could not be completed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("ties account-link initiation to the current app session without sending its token to Discord", async () => {
    const s = setup();
    const r = await s.call("/api/discord/link/start", {});
    const body = (await r!.json()) as any;
    expect(body.url).toMatch(
      /^https:\/\/gateway.example\/discord\/connect\?ticket=/,
    );
    expect(body.url).not.toContain("a".repeat(43));
    const saved = JSON.parse(
      [...s.records.entries()].find(([k]) =>
        k.startsWith("discord-ticket:"),
      )![1],
    );
    expect(saved.memberId).toBe("member-id");
    expect(saved.sessionKey).toMatch(/^session:/);
  });
});

describe("Discord link callback and receipt privacy", () => {
  it("rejects a link callback after the app session disappears, before contacting Discord", async () => {
    const s = setup(),
      state = "test-state";
    s.records.set(
      "discord-oauth:" + (await digest(state)),
      JSON.stringify({
        memberId: "member-id",
        sessionKey: "session:revoked",
        verifier: "proof-key",
      }),
    );
    vi.stubGlobal("fetch", vi.fn());
    const r = await handleDiscord(
      new Request(
        "https://gateway.example/discord/callback?state=" +
          state +
          "&code=test",
        { headers: { Cookie: "__Host-onslaught-discord=" + state } },
      ),
      s.env,
      s.deps,
    );
    expect(await r!.text()).toContain("could not be completed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rechecks suspension during linking and does not exchange credentials", async () => {
    const s = setup(),
      state = "test-state";
    s.records.set(
      "discord-oauth:" + (await digest(state)),
      JSON.stringify({
        memberId: "member-id",
        sessionKey: "session:live",
        verifier: "proof-key",
      }),
    );
    s.records.set(
      "session:live",
      JSON.stringify({ id: "member-id", label: "Officer" }),
    );
    s.doc.members[0].status = "suspended";
    vi.stubGlobal("fetch", vi.fn());
    const r = await handleDiscord(
      new Request(
        "https://gateway.example/discord/callback?state=" +
          state +
          "&code=test",
        { headers: { Cookie: "__Host-onslaught-discord=" + state } },
      ),
      s.env,
      s.deps,
    );
    expect(await r!.text()).toContain("could not be completed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retains stale poll counts during an outage without exposing internal message IDs", async () => {
    const s = setup();
    s.records.set(
      "poll:poll:channel",
      JSON.stringify({
        status: "sent",
        destination: "channel",
        channelId: channel,
        messageId: "123456789012345678",
        counts: [4, 2],
        syncedAt: "2026-11-10T00:00:00.000Z",
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    const r = await s.call(
      "/api/discord/delivery?kind=poll&id=poll&destination=channel",
    );
    const data = (await r!.json()) as any;
    expect(data.receipt.counts).toEqual([4, 2]);
    expect(data.receipt.syncError).toContain("could not be refreshed");
    expect(data.receipt.channelId).toBeUndefined();
    expect(data.receipt.messageId).toBeUndefined();
  });
});
