import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { CLASSES } from "../src/lib/model";
import { classEmojis, provisionClassEmojis } from "../server/class-emojis";
import type { Env } from "../server/worker";
import { chatDatabase } from "./chat-db";

// Vitest treats PNGs as browser URLs. Supply the same byte buffers that
// Wrangler's Data module rule gives the deployed Worker.
vi.mock("../server/class-emoji-images", async () => {
  const { CLASSES } = await import("../src/lib/model");
  return {
    classImages: Object.fromEntries(
      CLASSES.map((cls) => [
        cls,
        Uint8Array.from(readFileSync("server/class-emojis/" + cls + ".png"))
          .buffer,
      ]),
    ),
  };
});

const app = "100000000000000001",
  catalog = "https://discord.com/api/v10/applications/" + app + "/emojis";
const dbs: ReturnType<typeof chatDatabase>[] = [];
function setup() {
  const db = chatDatabase();
  dbs.push(db);
  db.sqlite.exec(readFileSync("server/raid-signups.sql", "utf8"));
  db.sqlite.exec(
    "INSERT INTO discord_raid_signups(event_id,guild_id,channel_id,message_id) VALUES('raid','g','c','m'); INSERT INTO discord_raid_chart_queue(event_id) VALUES('raid')",
  );
  const env = {
    DB: db.db,
    DISCORD_CLIENT_ID: app,
    DISCORD_BOT_TOKEN: "fixture",
  } as Env;
  return { env, sqlite: db.sqlite };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const db of dbs.splice(0)) db.sqlite.close();
});

it("reuses matching application emojis, uploads the supplied class images, and caches the set across concurrent runs", async () => {
  const { env, sqlite } = setup();
  const classes = CLASSES.map((cls, i) => ({
    id: String(100000000000000001n + BigInt(i)),
    name: "ons_" + cls,
  }));
  const byName = new Map(classes.map((emoji) => [emoji.name, emoji]));
  const http = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(catalog);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bot fixture");
    if (init.method === "GET") return Response.json({ items: [classes[0]] });
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    const file = readFileSync(
      "server/class-emojis/" + body.name.slice(4) + ".png",
    );
    expect(body.image).toBe("data:image/png;base64," + file.toString("base64"));
    expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([128, 128]);
    expect(file.length).toBeLessThanOrEqual(256 * 1024);
    return Response.json(byName.get(body.name));
  });
  vi.stubGlobal("fetch", http);
  expect(await classEmojis(env)).toEqual({});
  await Promise.all([provisionClassEmojis(env), provisionClassEmojis(env)]);
  await provisionClassEmojis(env);
  expect(await classEmojis(env)).toEqual(
    Object.fromEntries(
      classes.map((emoji) => [
        emoji.name.slice(4),
        "<:" + emoji.name + ":" + emoji.id + ">",
      ]),
    ),
  );
  expect(http).toHaveBeenCalledTimes(CLASSES.length);
  expect(
    sqlite.prepare("SELECT generation FROM discord_raid_chart_queue").get()
      ?.generation,
  ).toBe(2);
  expect(
    await classEmojis({ ...env, DISCORD_CLIENT_ID: "100000000000000002" }),
  ).toEqual({});
});

it("honors the retry delay and re-lists actual Discord uploads before retrying", async () => {
  const { env, sqlite } = setup();
  vi.useFakeTimers({ toFake: ["Date"] });
  const items: { name: string; id: string }[] = [];
  let paused = false;
  const http = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === "GET") return Response.json({ items });
    const { name } = JSON.parse(String(init.body));
    if (items.length === 1 && !paused) {
      paused = true;
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": "601" },
      });
    }
    expect(items.some((emoji) => emoji.name === name)).toBe(false);
    const emoji = {
      name,
      id: String(100000000000000001n + BigInt(items.length)),
    };
    items.push(emoji);
    return Response.json(emoji);
  });
  vi.stubGlobal("fetch", http);
  await expect(provisionClassEmojis(env)).rejects.toMatchObject({
    upstreamStatus: 429,
  });
  expect(await classEmojis(env)).toEqual({});
  expect(
    sqlite.prepare("SELECT generation FROM discord_raid_chart_queue").get()
      ?.generation,
  ).toBe(1);
  vi.setSystemTime(Date.now() + 600_000);
  await provisionClassEmojis(env);
  expect(http).toHaveBeenCalledTimes(3);
  vi.setSystemTime(Date.now() + 2000);
  await provisionClassEmojis(env);
  expect(Object.keys(await classEmojis(env))).toHaveLength(CLASSES.length);
  expect(items).toHaveLength(CLASSES.length);
});
