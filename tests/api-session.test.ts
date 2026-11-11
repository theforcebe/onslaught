import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionStore } from "../src/lib/session";
import { project } from "../src/lib/access";
import { privateFixture } from "./access-fixture";

const token = "s".repeat(43);
const values = new Map<string, string>();
const tab = {
  getItem: (key: string) => values.get(key) || null,
  setItem: (key: string, value: string) => {
    values.set(key, value);
  },
  removeItem: (key: string) => {
    values.delete(key);
  },
};
const identity = {
  provider: "battlenet" as const,
  id: "member-id",
  label: "Verified member",
  accountId: "456",
};
beforeEach(() => {
  vi.resetModules();
  values.clear();
  vi.stubEnv("VITE_API_URL", "https://gateway.example");
  vi.stubGlobal("window", { sessionStorage: tab });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("restored sessions use current server authorization", () => {
  it("restores a tab session and obtains identity and permissions from the server", async () => {
    createSessionStore(tab).save(token, 3600);
    const fetcher = vi.fn(async () =>
      Response.json(project(privateFixture(), identity)),
    );
    vi.stubGlobal("fetch", fetcher);
    const api = await import("../src/lib/api");
    const view = await api.loadGuild();
    expect(fetcher.mock.calls[0]).toEqual([
      "https://gateway.example/api/state",
      expect.objectContaining({
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    expect(view.identity).toMatchObject({
      label: "Verified member",
      admin: false,
    });
    expect(view.access.role).toBe("raider");
    expect(view.state.loot.map((item) => item.id)).toEqual(["first-loot"]);
  });
  it("clears a server-revoked session and returns the public view", async () => {
    createSessionStore(tab).save(token, 3600);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Session expired" }, { status: 401 }),
      )
      .mockResolvedValueOnce(Response.json(project(privateFixture())));
    vi.stubGlobal("fetch", fetcher);
    const api = await import("../src/lib/api");
    const view = await api.loadGuild();
    expect(api.sessionActive()).toBe(false);
    expect(values.size).toBe(0);
    expect(view.identity).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("PRIVATE-");
    expect(fetcher.mock.calls[1][0]).toBe("https://gateway.example/api/public");
  });
  it("clears the tab session even if the logout network request fails", async () => {
    createSessionStore(tab).save(token, 3600);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    const api = await import("../src/lib/api");
    await api.logout();
    expect(api.sessionActive()).toBe(false);
    expect(values.size).toBe(0);
    expect(createSessionStore(tab).token()).toBe("");
  });
  it("cannot resurrect a private response that arrives after sign-out", async () => {
    createSessionStore(tab).save(token, 3600);
    let finishRead!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/api/state"))
          return new Promise<Response>((resolve) => {
            finishRead = resolve;
          });
        return Promise.resolve(Response.json(project(privateFixture())));
      }),
    );
    const api = await import("../src/lib/api");
    const reading = api.loadGuild();
    await api.logout();
    finishRead(Response.json(project(privateFixture(), identity)));
    const view = await reading;
    expect(JSON.stringify(view)).not.toContain("PRIVATE-");
    expect(view.identity).toBeUndefined();
    expect(api.sessionActive()).toBe(false);
  });
});
