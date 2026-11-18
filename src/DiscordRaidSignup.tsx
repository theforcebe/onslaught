import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink, Send } from "lucide-react";
import { discordCall } from "./lib/api";

type Receipt = {
  url: string;
  scheduledEventUrl?: string;
  interactive: boolean;
  notice?: string;
};
export function DiscordRaidSignup({
  eventId,
  lead,
}: {
  eventId: string;
  lead: boolean;
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setReady(false);
    setError("");
    discordCall("raid-signup?eventId=" + encodeURIComponent(eventId))
      .then((result) => {
        if (current) {
          setReceipt(result.signup);
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
  }, [eventId, retry]);
  if (!lead && !receipt) return null;
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
            disabled={busy || !ready}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await discordCall("raid-signup", { eventId });
                setReceipt(result.signup);
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
        {lead && error && !ready && (
          <button className="btn text" onClick={() => setRetry((v) => v + 1)}>
            Retry
          </button>
        )}
      </div>
      {lead && receipt?.notice && <p role="status">{receipt.notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
