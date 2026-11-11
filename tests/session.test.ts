import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionStore } from "../src/lib/session";

const token = "a".repeat(43);
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("tab session restoration", () => {
  it("restores a session across page initialization without extending its original expiry", () => {
    vi.useFakeTimers();
    const tab = storage(),
      first = createSessionStore(tab);
    first.save(token, 3600);
    vi.advanceTimersByTime(3500000);
    const reloaded = createSessionStore(tab);
    expect(reloaded.token()).toBe(token);
    vi.advanceTimersByTime(100001);
    expect(reloaded.token()).toBe("");
    expect(tab.values.size).toBe(0);
    expect(createSessionStore(tab).token()).toBe("");
  });
  it("clears both the live session and the saved copy on sign-out", () => {
    const tab = storage(),
      session = createSessionStore(tab);
    session.save(token, 3600);
    session.clear();
    expect(session.token()).toBe("");
    expect(createSessionStore(tab).token()).toBe("");
  });
  it.each([
    "invalid-json",
    JSON.stringify({ token: "bad", expiresAt: Date.now() + 60000 }),
    JSON.stringify({ token, expiresAt: Date.now() - 1 }),
    JSON.stringify({ token, expiresAt: Date.now() + 7200000 }),
  ])("discards malformed, expired, or excessive stored sessions", (raw) => {
    const tab = storage();
    tab.setItem("onslaught:session:v1", raw);
    expect(createSessionStore(tab).token()).toBe("");
    expect(tab.values.size).toBe(0);
  });
  it("uses memory when browser storage is blocked", () => {
    const denied = () => {
      throw new Error("Storage blocked");
    };
    const session = createSessionStore({
      getItem: denied,
      setItem: denied,
      removeItem: denied,
    });
    session.save(token, 3600);
    expect(session.token()).toBe(token);
    session.clear();
    expect(session.token()).toBe("");
  });
  it("retains only the short-lived app token and expiry", () => {
    const tab = storage();
    createSessionStore(tab).save(token, 3600);
    expect(Object.keys(JSON.parse([...tab.values.values()][0]))).toEqual([
      "token",
      "expiresAt",
    ]);
  });
  it("rejects invalid token responses and lifetime extensions", () => {
    const session = createSessionStore(storage());
    expect(() => session.save("not-a-session", 3600)).toThrow("invalid");
    expect(() => session.save(token, 7200)).toThrow("invalid");
    expect(session.token()).toBe("");
  });
});
