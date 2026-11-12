import type { ChatNotification } from "./chat";

export function newChatAlert(
  latest: ChatNotification | null | undefined,
  previous: number | null,
  reading: { peer: string; visible: boolean },
) {
  return (
    !!latest &&
    previous !== null &&
    latest.seq > previous &&
    !(reading.visible && latest.peer === reading.peer)
  );
}

// Browsers require a user gesture before they allow sound. Unlock on ordinary
// pointer/keyboard interaction; synthesize a short bell instead of downloading audio.
export function chatBell() {
  let context: AudioContext | undefined;
  return {
    async unlock() {
      try {
        context ||= new AudioContext();
        if (context.state === "suspended") await context.resume();
      } catch {
        /* Sound is optional; visual alerts always remain available. */
      }
    },
    play() {
      if (!context || context.state !== "running") return;
      for (const [frequency, delay] of [
        [880, 0],
        [1174.66, 0.12],
      ]) {
        const tone = context.createOscillator(),
          gain = context.createGain(),
          start = context.currentTime + delay;
        tone.type = "sine";
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        tone.connect(gain);
        gain.connect(context.destination);
        tone.start(start);
        tone.stop(start + 0.32);
        tone.onended = () => {
          tone.disconnect();
          gain.disconnect();
        };
      }
    },
    close() {
      void context?.close().catch(() => {});
      context = undefined;
    },
  };
}
