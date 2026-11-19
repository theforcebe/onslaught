import { afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { privateFixture } from "./access-fixture";
import { chatDatabase } from "./chat-db";
import {
  handleRaidPublish,
  signupPath,
  publicKeyRecord,
  raidUrl,
} from "../server/discord-raids";
import {
  handleRaidInteraction,
  processRaidClick,
} from "../server/raid-interactions";
import type { Env } from "../server/worker";
import { project, type GuildDocument } from "../src/lib/access";
import { confirmedRaiders, raidNightCharacter } from "../src/lib/raid";
import { guildRoute } from "../src/lib/navigation";
import { ChangeError } from "../src/lib/reducer";

const guild = "100000000000000001",
  channel = "100000000000000002",
  app = "100000000000000003",
  post = "100000000000000004",
  calendarId = "100000000000000005",
  user = "100000000000000006";
const databases: ReturnType<typeof chatDatabase>[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const db of databases.splice(0)) db.sqlite.close();
});
function fixture() {
  const database = chatDatabase();
  databases.push(database);
  const sqlite = database.sqlite;
  sqlite.exec(readFileSync("server/raid-signups.sql", "utf8"));
  sqlite.prepare("INSERT INTO discord_config VALUES('guild',?)").run(
    JSON.stringify({
      guildId: guild,
      pollsChannelId: channel,
      requestsChannelId: channel,
      announcementsChannelId: channel,
    }),
  );
  sqlite
    .prepare("INSERT INTO discord_links VALUES(?,?,?,0)")
    .run("member-id", user, "Discord user");
  const env = {
    DB: database.db,
    DISCORD_BOT_TOKEN: "fixture",
    DISCORD_CLIENT_ID: app,
    PUBLIC_API_URL: "https://hq.example",
  } as Env;
  const store = { doc: privateFixture() };
  const event = store.doc.state.events[0];
  event.start = new Date(Date.now() + 86400000).toISOString();
  event.end = new Date(Date.now() + 92000000).toISOString();
  event.signups = {};
  const actor = {
    provider: "battlenet" as const,
    id: "member-id",
    label: "Member",
  };
  const deps = {
    authenticated: async () => actor,
    readRepository: async () => ({
      document: store.doc,
      sha: "fixture",
      url: "unused",
    }),
    writeRepository: vi.fn(
      async (_env: Env, _url: string, _sha: string, next: GuildDocument) => {
        store.doc = next;
      },
    ),
    limit: async () => {},
    boundedJSON: (r: Request) => r.json(),
    json: (data: unknown) => Response.json(data),
  };
  const call = async (path = signupPath, method = "POST") =>
    (await handleRaidPublish(
      new Request(env.PUBLIC_API_URL + path, {
        method,
        body:
          method === "POST" ? JSON.stringify({ eventId: event.id }) : undefined,
      }),
      env,
      deps,
    ))!.json();
  const click = {
    type: 3 as const,
    id: "200000000000000001",
    application_id: app,
    guild_id: guild,
    channel_id: channel,
    token: "test",
    member: { user: { id: user } },
    message: { id: post },
    data: { custom_id: "raid:rsvp:going" },
  };
  const register = () =>
    sqlite
      .prepare(
        "INSERT INTO discord_raid_signups(event_id,guild_id,channel_id,message_id,interactive) VALUES(?,?,?,?,1)",
      )
      .run(event.id, guild, channel, post);
  return { sqlite, env, store, event, deps, call, click, register };
}
describe("Discord raid signups", () => {
  it("verifies the calendar grant and configures signup buttons without posting", async () => {
    const { sqlite, store, call } = fixture();
    store.doc.members[0].role = "admin";
    let endpoint = "";
    let grant = false;
    const api = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/applications/@me")) {
        if (init?.method === "PATCH") {
          expect(
            sqlite
              .prepare("SELECT payload FROM discord_config WHERE key=?")
              .get(publicKeyRecord),
          ).toBeTruthy();
          endpoint = JSON.parse(String(init.body)).interactions_endpoint_url;
        }
        return Response.json({
          id: app,
          verify_key: "aa".repeat(32),
          interactions_endpoint_url: endpoint || null,
        });
      }
      if (path.endsWith("/members/" + app))
        return Response.json({ roles: ["bot-role"] });
      if (path.endsWith("/roles"))
        return Response.json([
          { id: guild, permissions: "0" },
          { id: "bot-role", permissions: grant ? String(1n << 44n) : "0" },
        ]);
      throw Error("Unexpected Discord API call");
    });
    vi.stubGlobal("fetch", api);
    expect(await call(signupPath + "/setup")).toMatchObject({
      interactive: true,
      calendarReady: false,
    });
    grant = true;
    expect(await call(signupPath + "/setup")).toMatchObject({
      interactive: true,
      calendarReady: true,
    });
    expect(
      api.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(1);
    expect(
      api.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });
  it("publishes and refreshes an event and signup without duplicating either or sharing notes", async () => {
    const { env, store, event, call } = fixture();
    store.doc.members[0].role = "officer";
    const api = vi.fn(async (url: string, options?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/applications/@me"))
        return Response.json({
          id: app,
          verify_key: "aa".repeat(32),
          interactions_endpoint_url:
            env.PUBLIC_API_URL + "/discord/interactions",
        });
      if (path.endsWith("/channels/" + channel))
        return Response.json({ guild_id: guild });
      if (path.endsWith("/scheduled-events") && options?.method === "GET")
        return Response.json([]);
      if (path.includes("/scheduled-events"))
        return Response.json({ id: calendarId });
      if (path.includes("/messages")) return Response.json({ id: post });
      throw Error("Unexpected API");
    });
    vi.stubGlobal("fetch", api);
    const first = await call();
    event.start = new Date(Date.parse(event.start) + 86400000).toISOString();
    event.end = new Date(Date.parse(event.end) + 86400000).toISOString();
    event.title = "Rescheduled guild raid";
    event.instance = "Updated meeting point";
    const second = await call();
    expect(first).toEqual(second);
    expect(first.signup).toMatchObject({
      interactive: true,
      scheduledEventUrl:
        "https://discord.com/events/" + guild + "/" + calendarId,
    });
    expect(
      api.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(2);
    const sent = JSON.parse(
      String(
        api.mock.calls.find(
          ([u, i]) => u.endsWith("/messages") && i?.method === "POST",
        )![1]!.body,
      ),
    );
    expect(
      sent.components[0].components.map((b: any) => b.custom_id || b.url),
    ).toContain(raidUrl(event.id));
    expect(sent.allowed_mentions).toEqual({ parse: [] });
    expect(
      sent.components[0].components
        .slice(0, 3)
        .map((b: { custom_id: string }) => b.custom_id),
    ).toEqual([
      "raid:chart:going",
      "raid:chart:tentative",
      "raid:chart:absent",
    ]);
    expect(sent.content).toContain("this channel");
    expect(sent.embeds).toHaveLength(1);
    expect(JSON.stringify(sent)).not.toContain("PRIVATE-FIRST");
    expect(
      api.mock.calls.filter(([, i]) => i?.method === "PATCH"),
    ).toHaveLength(2);
    const updated = (resource: string) =>
      JSON.parse(
        String(
          api.mock.calls.find(
            ([url, opts]) => url.endsWith(resource) && opts?.method === "PATCH",
          )![1]?.body,
        ),
      );
    const calendar = updated("/scheduled-events/" + calendarId);
    expect(calendar).toMatchObject({
      name: event.title,
      scheduled_start_time: event.start,
      scheduled_end_time: event.end,
      entity_metadata: { location: event.instance },
    });
    const card = updated("/messages/" + post);
    expect(card.content).toContain(event.title);
    expect(card.embeds).toHaveLength(1);
    expect(card.content).toContain(
      "<t:" + Math.floor(Date.parse(event.start) / 1000) + ":F>",
    );
    expect(JSON.stringify([card, calendar])).not.toContain("PRIVATE-");
    const link = card.components[0].components.find(
      (b: { url?: string }) => b.url === raidUrl(event.id),
    ).url;
    const route = guildRoute(new URL(link).hash);
    const publicNight = project(store.doc).state.events.find(
      (e) => e.id === route.raidId,
    );
    expect(route.page).toBe("planner");
    expect(publicNight).toMatchObject({
      title: event.title,
      start: event.start,
      notes: "",
      signups: {},
    });
  });
  it("falls back to an exact-raid link when events or interaction setup are unavailable", async () => {
    const { store, event, call } = fixture();
    store.doc.members[0].role = "officer";
    let message: any;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.endsWith("/applications/@me"))
        return Response.json({
          id: app,
          verify_key: "aa".repeat(32),
          interactions_endpoint_url: "https://another.example/active",
        });
      if (url.endsWith("/channels/" + channel))
        return Response.json({ guild_id: guild });
      if (url.includes("scheduled-events"))
        return Response.json({}, { status: 403 });
      message = JSON.parse(String(init.body));
      return Response.json({ id: post });
    });
    const result = await call();
    expect(result.signup.interactive).toBe(false);
    expect(result.signup.notice).toContain("Create Events");
    expect(message.embeds).toHaveLength(1);
    expect(message.components[0].components).toEqual([
      {
        type: 2,
        style: 5,
        label: "Sign up in Ønslaught",
        url: raidUrl(event.id),
      },
    ]);
  });
  it("protects publication and app setup with guild authorizations", async () => {
    const { call, store } = fixture();
    await expect(call()).rejects.toThrow("Officer");
    store.doc.members[0].role = "officer";
    store.doc.members[0].teamIds = [];
    await expect(call()).rejects.toThrow("Officer");
    await expect(call(signupPath + "/setup")).rejects.toThrow("Admin");
  });
  it("turns a signed fresh PING into PONG and rejects a signature over the wrong body", async () => {
    const { env, deps, sqlite } = fixture();
    const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const key = Buffer.from(
      await crypto.subtle.exportKey("raw", keys.publicKey),
    ).toString("hex");
    sqlite
      .prepare("INSERT INTO discord_config VALUES(?,?)")
      .run(publicKeyRecord, JSON.stringify({ appId: app, key }));
    const time = String(Math.floor(Date.now() / 1000)),
      body = JSON.stringify({ type: 1 });
    const sig = Buffer.from(
      await crypto.subtle.sign(
        "Ed25519",
        keys.privateKey,
        Buffer.from(time + body),
      ),
    ).toString("hex");
    const ping = (data: string, stamp = time) =>
      handleRaidInteraction(
        new Request(env.PUBLIC_API_URL + "/discord/interactions", {
          method: "POST",
          headers: {
            "X-Signature-Ed25519": sig,
            "X-Signature-Timestamp": stamp,
          },
          body: data,
        }),
        env,
        {} as ExecutionContext,
        deps,
      );
    expect(await (await ping(body))!.json()).toEqual({ type: 1 });
    await expect(ping(body + " ")).rejects.toThrow("signature");
    await expect(ping(body, "1600000000")).rejects.toThrow("signature");
  });
  it("commits a linked member’s Discord RSVP to the canonical raid exactly once, retrying a conflicting update", async () => {
    const { env, deps, click, store, register } = fixture();
    register();
    const character = store.doc.state.characters[0];
    character.role = "tank";
    character.class = "warrior";
    character.spec = "Protection";
    store.doc.members[0].sections = [];
    deps.writeRepository.mockRejectedValueOnce(
      new ChangeError("conflict", 409),
    );
    const response = await processRaidClick(env, click, deps);
    expect(response.content).toContain("Going");
    expect(store.doc.state.events[0].signups[character.id]).toBe("going");
    expect(store.doc.state.events[0].signupBuilds?.[character.id]).toEqual({
      spec: "Protection",
      role: "tank",
    });
    await processRaidClick(env, click, deps);
    expect(deps.writeRepository).toHaveBeenCalledTimes(2);
  });
  it("projects a signed Discord RSVP and role choice into the planner and guild board", async () => {
    const { env, deps, click, store, sqlite, event, register } = fixture();
    register();
    store.doc.state.events = [event];
    const main = store.doc.state.characters[0];
    Object.assign(main, {
      class: "warrior",
      spec: "Protection",
      role: "tank",
      alternateBuilds: [{ spec: "Fury", role: "melee" }],
    });
    const guest = store.doc.state.characters[1];
    event.signups[guest.id] = "going";
    const member = store.doc.members[0];
    member.sections = [];
    const officer = {
      ...member,
      id: "officer",
      label: "Raid lead",
      role: "officer" as const,
      sections: ["attendance", "planner"] as typeof member.sections,
    };
    store.doc.members.push(officer);

    const keys = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const key = Buffer.from(
      await crypto.subtle.exportKey("raw", keys.publicKey),
    ).toString("hex");
    sqlite
      .prepare("INSERT INTO discord_config VALUES(?,?)")
      .run(publicKeyRecord, JSON.stringify({ appId: app, key }));
    let reply: {
      content: string;
      components?: Array<{
        components: Array<{
          custom_id: string;
          options: Array<{ label: string; value: string }>;
        }>;
      }>;
    };
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe(
        "https://discord.com/api/v10/webhooks/" +
          app +
          "/" +
          click.token +
          "/messages/@original",
      );
      expect(init.method).toBe("PATCH");
      reply = JSON.parse(String(init.body));
      return Response.json({});
    });
    const sendSigned = async (payload: object) => {
      const body = JSON.stringify(payload),
        time = String(Math.floor(Date.now() / 1000));
      const signature = Buffer.from(
        await crypto.subtle.sign(
          "Ed25519",
          keys.privateKey,
          Buffer.from(time + body),
        ),
      ).toString("hex");
      const background: Promise<unknown>[] = [];
      const res = await handleRaidInteraction(
        new Request(env.PUBLIC_API_URL + "/discord/interactions", {
          method: "POST",
          body,
          headers: {
            "X-Signature-Timestamp": time,
            "X-Signature-Ed25519": signature,
          },
        }),
        env,
        {
          waitUntil: (p: Promise<unknown>) => background.push(p),
        } as unknown as ExecutionContext,
        deps,
      );
      expect(await res!.json()).toEqual({ type: 5, data: { flags: 64 } });
      await Promise.all(background);
      return reply;
    };
    const prompt = await sendSigned(click);
    const select = prompt.components![0].components[0];
    const fury = select.options.find((o) => o.label.includes("Fury"))!;
    const confirmation = await sendSigned({
      ...click,
      id: "200000000000000002",
      message: { id: "200000000000000003" },
      data: { custom_id: select.custom_id, values: [fury.value] },
    });
    expect(confirmation.content).toContain("Going");
    const view = (person: typeof member) =>
      project(store.doc, {
        provider: "battlenet",
        id: person.id,
        label: person.label,
      });
    const mine = view(member);
    expect(mine.state.events[0].signups).toEqual({ [main.id]: "going" });
    expect(mine.upcomingAttendance).toMatchObject({
      eventId: event.id,
      going: 2,
    });
    expect(
      raidNightCharacter(mine.state.characters[0], mine.state.events[0]),
    ).toMatchObject({ spec: "Fury", role: "melee" });

    const lead = view(officer);
    expect(
      confirmedRaiders(lead.state.characters, lead.state.events[0]).map(
        (c) => c.id,
      ),
    ).toEqual([main.id]);
    expect(lead.state.events[0].signups[guest.id]).toBeUndefined();
    officer.allTeams = true;
    const granted = view(officer);
    expect(granted.state.events[0].signups[guest.id]).toBe("going");
    expect(
      granted.state.characters.find((c) => c.id === guest.id)?.teamId,
    ).toBe("second");

    const visitor = project(store.doc);
    expect(visitor.state.events[0]).toMatchObject({
      signups: {},
      signupBuilds: {},
    });
    expect(visitor.upcomingAttendance).toBeUndefined();
  });
  it("rechecks character ownership and saved alternate builds when a private selection is submitted", async () => {
    const { env, deps, click, store, register } = fixture();
    register();
    const other = store.doc.state.characters[1];
    const char = store.doc.state.characters[0];
    char.role = "tank";
    char.class = "warrior";
    char.spec = "Protection";
    char.alternateBuilds = [{ spec: "Fury", role: "melee" }];
    other.ownerBattleNet = char.ownerBattleNet;
    const prompt = await processRaidClick(env, click, deps),
      select = (prompt.components as any)[0].components[0];
    expect(select.options).toHaveLength(3);
    const pick = {
      ...click,
      id: "200000000000000002",
      message: { id: "200000000000000003" },
      data: { custom_id: select.custom_id, values: ["1"] },
    };
    await processRaidClick(env, pick, deps);
    expect(store.doc.state.events[0].signupBuilds?.[char.id]).toEqual({
      spec: "Fury",
      role: "melee",
    });
    await expect(
      processRaidClick(env, { ...pick, member: { user: { id: app } } }, deps),
    ).rejects.toThrow("menu expired");
    store.doc.state.characters[0].alternateBuilds = [];
    await expect(processRaidClick(env, pick, deps)).rejects.toThrow(
      "options changed",
    );
    store.doc.members[0].status = "suspended";
    await expect(processRaidClick(env, click, deps)).rejects.toThrow(
      "membership",
    );
  });
  it("requires a recognized post, current guild/channel and a linked account", async () => {
    const { env, deps, click, register } = fixture();
    await expect(processRaidClick(env, click, deps)).rejects.toThrow(
      "no longer available",
    );
    register();
    await expect(
      processRaidClick(env, { ...click, guild_id: app }, deps),
    ).rejects.toThrow("scheduling channel");
    await expect(
      processRaidClick(env, { ...click, member: { user: { id: app } } }, deps),
    ).rejects.toThrow("Link your Discord");
    expect(deps.writeRepository).not.toHaveBeenCalled();
  });
  it("accepts a linked bootstrap admin with no member row and honors their chart privacy", async () => {
    const { env, deps, click, register, sqlite, store, event, call } =
      fixture();
    register();
    const subject = "712356",
      key = "raid-admin-fixture",
      id = createHmac("sha256", key)
        .update("battlenet:" + subject)
        .digest("base64url");
    env.IDENTITY_KEY = key;
    env.ADMIN_BNET_IDS = " 123, " + subject;
    store.doc.members = [];
    const character = store.doc.state.characters[0];
    character.ownerBattleNet = id;
    sqlite
      .prepare("UPDATE discord_links SET member_id=? WHERE discord_id=?")
      .run(id, user);
    deps.authenticated = async () => ({
      provider: "battlenet",
      id,
      label: "Fixture admin",
      admin: true,
    });
    await processRaidClick(
      env,
      { ...click, data: { custom_id: "raid:chart:absent" } },
      deps,
    );
    expect(store.doc.state.events[0].signups[character.id]).toBe("absent");
    const status = () => call(signupPath + "?eventId=" + event.id, "GET");
    expect(await status()).toMatchObject({
      myListedCharacters: [character.id],
    });
    for (const listed of [false, true]) {
      await handleRaidPublish(
        new Request(env.PUBLIC_API_URL + signupPath + "/visibility", {
          method: "POST",
          body: JSON.stringify({
            eventId: event.id,
            characterId: character.id,
            messageId: post,
            listed,
          }),
        }),
        env,
        deps,
      );
      expect((await status()).myListedCharacters).toEqual(
        listed ? [character.id] : [],
      );
    }
    env.ADMIN_BNET_IDS = "123";
    await expect(processRaidClick(env, click, deps)).rejects.toThrow(
      "membership",
    );
    expect((await status()).myListedCharacters).toEqual([]);
  });
  it("distinguishes two Feral roles and lets the member switch back to main for this night", async () => {
    const { env, deps, click, store, event, register } = fixture();
    register();
    const c = store.doc.state.characters[0];
    Object.assign(c, {
      class: "druid",
      spec: "Feral",
      role: "tank",
      alternateBuilds: [{ spec: "Feral", role: "melee" }],
    });
    const secondNight = {
      ...event,
      id: "second-night",
      signups: { [c.id]: "going" as const },
      signupBuilds: { [c.id]: { spec: "Feral", role: "melee" as const } },
      lineup: {},
    };
    store.doc.state.events.push(secondNight);
    const chartClick = { ...click, data: { custom_id: "raid:chart:going" } };
    const prompt = await processRaidClick(env, chartClick, deps);
    expect(prompt.content).toContain("character and class appear");
    expect(prompt.content).toContain("Alternate");
    const menu = (prompt.components as any)[0].components[0];
    expect(menu.options.map((o: { label: string }) => o.label)).toEqual([
      `Main · Feral (Tank) · ${c.name}`,
      `Alternate · Feral (Melee) · ${c.name}`,
    ]);
    expect(deps.writeRepository).not.toHaveBeenCalled();
    const choose = (custom_id: string, value: string, id: string) =>
      processRaidClick(
        env,
        { ...click, id, data: { custom_id, values: [value] } },
        deps,
      );
    expect(
      (await choose(menu.custom_id, "1", "200000000000000021")).content,
    ).toContain("Alternate · Feral (Melee)");
    const again = await processRaidClick(
      env,
      { ...click, data: { custom_id: "raid:chart:tentative" } },
      deps,
    );
    const updated = (again.components as any)[0].components[0];
    expect(updated.options[1].description).toBe("Current signup · Going");
    expect(updated.options[0].description).toBeUndefined();
    expect(
      (await choose(updated.custom_id, "0", "200000000000000022")).content,
    ).toContain("Main · Feral (Tank)");
    expect(store.doc.state.events[0].signups[c.id]).toBe("tentative");
    expect(store.doc.state.events[0].signupBuilds?.[c.id]).toEqual({
      spec: "Feral",
      role: "tank",
    });
    expect(store.doc.state.characters[0]).toEqual(c);
    expect(store.doc.state.events.find((e) => e.id === secondNight.id)).toEqual(
      secondNight,
    );
  });
  it("keeps a historical build for its existing RSVP only while that selection is still current", async () => {
    const { env, deps, click, store, event, register } = fixture();
    register();
    const c = store.doc.state.characters[0];
    Object.assign(c, {
      class: "druid",
      spec: "Restoration",
      role: "healer",
      alternateBuilds: [],
    });
    event.signups[c.id] = "going";
    event.signupBuilds = { [c.id]: { spec: "Feral", role: "tank" } };
    const prompt = await processRaidClick(
      env,
      { ...click, data: { custom_id: "raid:chart:tentative" } },
      deps,
    );
    const menu = (prompt.components as any)[0].components[0];
    expect(menu.options[1]).toMatchObject({
      label: `Raid build · Feral (Tank) · ${c.name}`,
      description: "Current signup · Going",
    });
    const selection = {
      ...click,
      data: { custom_id: menu.custom_id, values: ["1"] },
    };
    await processRaidClick(env, selection, deps);
    expect(store.doc.state.events[0].signupBuilds?.[c.id]).toEqual({
      spec: "Feral",
      role: "tank",
    });
    expect(store.doc.state.events[0].signups[c.id]).toBe("tentative");
    store.doc.state.events[0].signupBuilds![c.id] = {
      spec: "Restoration",
      role: "healer",
    };
    await expect(processRaidClick(env, selection, deps)).rejects.toThrow(
      "options changed",
    );
  });
  it("paginates large rosters inside Discord and only accepts the offered options from the linked member", async () => {
    const { env, deps, click, store, event, register, sqlite } = fixture();
    register();
    const base = store.doc.state.characters[0];
    store.doc.state.characters = Array.from({ length: 14 }, (_, i) => ({
      ...base,
      id: "raider-" + i,
      name: "Raider " + i,
      class: "druid",
      role: "tank",
      spec: "Feral",
      alternateBuilds: [{ role: "melee", spec: "Feral" }],
    }));
    const clicked = (custom_id: string, values?: string[]) => ({
      ...click,
      data: { custom_id, values },
      id: "200000000000000030",
    });
    const page = await processRaidClick(env, clicked("raid:chart:going"), deps);
    const [first, nav] = page.components as any[];
    expect(page.content).toContain("Page 1 of 2");
    expect(first.components[0].options).toHaveLength(25);
    expect(nav.components.map((b: { label: string }) => b.label)).toEqual([
      "Next page",
    ]);
    const nextId = nav.components[0].custom_id;
    await expect(
      processRaidClick(
        env,
        { ...clicked(nextId), member: { user: { id: post } } },
        deps,
      ),
    ).rejects.toThrow("menu expired");
    await expect(
      processRaidClick(
        env,
        clicked(first.components[0].custom_id, ["25"]),
        deps,
      ),
    ).rejects.toThrow("from this page");
    const secondPage = await processRaidClick(env, clicked(nextId), deps);
    expect(secondPage.content).toContain("Page 2 of 2");
    const [last, back] = secondPage.components as any[];
    expect(back.components.map((b: { label: string }) => b.label)).toEqual([
      "Previous page",
    ]);
    expect(last.components[0].options).toHaveLength(3);
    expect(last.components[0].options[2].label).toContain(
      "Alternate · Feral (Melee) · Raider 13",
    );
    expect(
      (await processRaidClick(env, clicked(back.components[0].custom_id), deps))
        .content,
    ).toContain("Page 1 of 2");
    await expect(
      processRaidClick(
        env,
        clicked(back.components[0].custom_id.replace(":prev:", ":next:")),
        deps,
      ),
    ).rejects.toThrow("available page");
    await expect(
      processRaidClick(env, clicked(last.components[0].custom_id, ["3"]), deps),
    ).rejects.toThrow("from this page");
    expect(deps.writeRepository).not.toHaveBeenCalled();
    const reply = await processRaidClick(
      env,
      clicked(last.components[0].custom_id, ["2"]),
      deps,
    );
    expect(reply.content).toContain("Alternate · Feral (Melee) · Raider 13");
    expect(
      store.doc.state.events.find((e) => e.id === event.id)?.signupBuilds?.[
        "raider-13"
      ],
    ).toEqual({ spec: "Feral", role: "melee" });
    sqlite
      .prepare(
        "UPDATE auth_records SET expires_at=0 WHERE key LIKE 'raid-menu:%'",
      )
      .run();
    await expect(processRaidClick(env, clicked(nextId), deps)).rejects.toThrow(
      "menu expired",
    );
  });
});
