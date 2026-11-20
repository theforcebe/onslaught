import { describe, it, expect, vi, afterEach } from "vitest";
import {
  newChatAlert,
  chatBell,
  notifyChatDiscordPreference,
  onChatDiscordPreference,
} from "../src/lib/chat-alerts";
const latest = { seq: 42, peer: "bob", senderName: "Bob", kind: "dm" as const };
afterEach(() => vi.unstubAllGlobals());
describe("chat alerts", () => {
  it("synchronizes the open account's Discord chat consent across views and discards stale account events", () => {
    const connection = vi.fn(),
      messenger = vi.fn();
    const leave = onChatDiscordPreference("alice", connection);
    const close = onChatDiscordPreference("alice", messenger);
    try {
      const enabled = { linked: true, enabled: true };
      notifyChatDiscordPreference("bob", enabled);
      expect(connection).not.toHaveBeenCalled();
      notifyChatDiscordPreference("alice", enabled);
      expect(connection).toHaveBeenCalledWith(enabled);
      expect(messenger).toHaveBeenCalledWith(enabled);
      close();
      notifyChatDiscordPreference("alice", { linked: false, enabled: false });
      expect(messenger).toHaveBeenCalledTimes(1);
      expect(connection).toHaveBeenLastCalledWith({
        linked: false,
        enabled: false,
      });
    } finally {
      close();
      leave();
    }
  });
  it("alerts for fresh DMs in a closed or background chat, but not old unread history or repeated polls", () => {
    expect(newChatAlert(latest, 41, { peer: "bob", visible: false })).toBe(
      true,
    );
    expect(newChatAlert(latest, 41, { peer: "carol", visible: true })).toBe(
      true,
    );
    expect(newChatAlert(latest, null, { peer: "", visible: false })).toBe(
      false,
    );
    expect(newChatAlert(latest, 42, { peer: "", visible: false })).toBe(false);
    expect(newChatAlert(latest, 43, { peer: "", visible: false })).toBe(false);
    expect(newChatAlert(latest, 41, { peer: "bob", visible: true })).toBe(
      false,
    );
    expect(newChatAlert(null, 41, { peer: "", visible: false })).toBe(false);
  });
  it("plays two brief tones only after the browser audio context is unlocked", async () => {
    const tone = {
      frequency: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const gain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    class Audio {
      state = "suspended";
      currentTime = 0;
      destination = {};
      async resume() {
        this.state = "running";
      }
      async close() {}
      createOscillator() {
        return tone;
      }
      createGain() {
        return gain;
      }
    }
    vi.stubGlobal("AudioContext", Audio);
    const bell = chatBell();
    bell.play();
    expect(tone.start).not.toHaveBeenCalled();
    await bell.unlock();
    bell.play();
    expect(tone.start).toHaveBeenCalledTimes(2);
    expect(tone.stop).toHaveBeenCalledTimes(2);
    bell.close();
  });
});
