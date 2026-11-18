import { afterEach, expect, it, vi } from "vitest";
import { digest } from "../server/worker";

const gateway = "https://gateway.example";
const token = "s".repeat(43);
const code = "c".repeat(43);
function browser() {
  vi.resetModules();
  const data = new Map<string, string>();
  let url = new URL(
    "https://guild.example/onslaught/?from=discord#planner?raid=first",
  );
  const assign = vi.fn();
  Object.assign(url, { assign });
  const history = {
    replaceState: vi.fn((_s, _title, href: string) => {
      url = new URL(href);
    }),
  };
  vi.stubGlobal("window", {
    get location() {
      return url;
    },
    history,
    sessionStorage: {
      getItem: (k: string) => data.get(k) || null,
      setItem: (k: string, v: string) => data.set(k, v),
      removeItem: (k: string) => data.delete(k),
    },
  });
  const arrive = () => {
    url = new URL("https://guild.example/onslaught/#bnet-return=" + code);
  };
  return { data, assign, arrive, location: () => url.href };
}
afterEach(() => vi.unstubAllGlobals());
it("authenticates without an opener, strips the return code and restores the raid link", async () => {
  const { assign, arrive, location } = browser();
  const { startBattleNetRedirect, finishBattleNetRedirect } =
    await import("../src/lib/battlenet");
  await startBattleNetRedirect(gateway);
  const start = new URL(assign.mock.calls[0][0]);
  expect(start.pathname).toBe("/auth/start");
  expect(start.searchParams.get("flow")).toBe("redirect");
  arrive();
  const exchange = vi.fn(async (url, options) => {
    expect(url).toBe(gateway + "/auth/exchange");
    const body = JSON.parse(options.body);
    expect(body.code).toBe(code);
    expect(await digest(body.verifier)).toBe(
      start.searchParams.get("challenge"),
    );
    expect(location()).toBe(
      "https://guild.example/onslaught/?from=discord#planner?raid=first",
    );
    return Response.json({ token, expiresIn: 3600 });
  });
  vi.stubGlobal("fetch", exchange);
  await finishBattleNetRedirect(gateway);
  expect((await import("../src/lib/session")).guildSession.token()).toBe(token);
  arrive();
  await expect(finishBattleNetRedirect(gateway)).rejects.toThrow(
    /original sign-in tab/,
  );
  expect(exchange).toHaveBeenCalledTimes(1);
});
it("returns a recoverable error without exchanging a code when the browser loses tab storage", async () => {
  const { arrive, location } = browser();
  arrive();
  const exchange = vi.fn();
  vi.stubGlobal("fetch", exchange);
  const { finishBattleNetRedirect } = await import("../src/lib/battlenet");
  await expect(finishBattleNetRedirect(gateway)).rejects.toThrow(
    /Safari or Chrome/,
  );
  expect(location()).toBe("https://guild.example/onslaught/");
  expect(exchange).not.toHaveBeenCalled();
});
