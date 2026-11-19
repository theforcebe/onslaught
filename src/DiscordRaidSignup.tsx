import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink, Send } from "lucide-react";
import { discordCall } from "./lib/api";
import type { Character } from "./lib/model";

type Receipt = {
  messageId: string;
  url: string;
  scheduledEventUrl?: string;
  interactive: boolean;
  notice?: string;
};
export function DiscordRaidSignup({
  eventId,
  lead,
  ownSignups,
}: {
  eventId: string;
  lead: boolean;
  ownSignups: Pick<Character, "id" | "name">[];
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [listed, setListed] = useState<string[]>([]);
  const [changingName, setChangingName] = useState(false);
  const ownSignupIds = ownSignups.map((c) => c.id).join("/");
  useEffect(() => {
    let current = true;
    setReady(false);
    setError("");
    discordCall("raid-signup?eventId=" + encodeURIComponent(eventId))
      .then((result) => {
        if (current) {
          setReceipt(result.signup);
          setListed(result.myListedCharacters || []);
          setReady(true);
        }
      })
      .catch((e) => {
        if (current)
          setError(e.message || "Discord signup details could not be loaded.");
      });
    return () => {
      current = false;
    };
  }, [eventId, retry, ownSignupIds]);
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === "visible") setRetry((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, []);
  if (!lead && !receipt && !error) return null;
  return (
    <section className="discord-raid-signup" aria-label="Discord raid signup">
      <div className="button-row">
        {receipt?.url && (
          <a
            className="btn text"
            href={receipt.url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} /> Discord signup
          </a>
        )}
        {receipt?.scheduledEventUrl && (
          <a
            className="btn text"
            href={receipt.scheduledEventUrl}
            target="_blank"
            rel="noreferrer"
          >
            <CalendarDays size={15} /> Discord event
          </a>
        )}
        {lead && (
          <button
            className="btn secondary"
            disabled={busy || changingName || !ready}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await discordCall("raid-signup", { eventId });
                setReceipt(result.signup);
                setRetry((n) => n + 1);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Discord could not publish this signup.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Send size={15} />
            {busy
              ? "Publishing…"
              : receipt
                ? "Update Discord signup"
                : "Post signup to Discord"}
          </button>
        )}
        {error && !ready && (
          <button className="btn text" onClick={() => setRetry((v) => v + 1)}>
            Retry
          </button>
        )}
      </div>
      {receipt?.url &&
        ownSignups.map((c) => (
          <label className="discord-chart-sharing" key={c.id}>
            <input
              type="checkbox"
              checked={listed.includes(c.id)}
              disabled={busy || changingName || !ready}
              onChange={async (e) => {
                const show = e.currentTarget.checked;
                setChangingName(true);
                setError("");
                try {
                  await discordCall("raid-signup/visibility", {
                    eventId,
                    characterId: c.id,
                    messageId: receipt.messageId,
                    listed: show,
                  });
                  setListed((old) =>
                    show
                      ? [...new Set([...old, c.id])]
                      : old.filter((id) => id !== c.id),
                  );
                  setRetry((n) => n + 1);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Discord chart visibility could not be saved.",
                  );
                } finally {
                  setChangingName(false);
                }
              }}
            />{" "}
            List {c.name} by name on this Discord chart
          </label>
        ))}
      {lead && receipt?.notice && <p role="status">{receipt.notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
