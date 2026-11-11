import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, Send, RefreshCw } from "lucide-react";
import type { RaidAction } from "./lib/model";
import type { SchedulePoll } from "./lib/community";
import { discordCall } from "./lib/api";
const when = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
type Delivery = {
  status: string;
  destination: string;
  url?: string;
  sentAt?: string;
  error?: string;
  counts?: number[];
  syncedAt?: string;
  finalized?: boolean;
  expiresAt?: string;
  syncError?: string;
};
export function PollCard({
  summary = false,
  poll: p,
  actorId,
  lead,
  connected,
  demo,
  change,
  send,
  onError,
}: {
  summary?: boolean;
  poll: SchedulePoll;
  actorId: string;
  lead: boolean;
  connected: boolean;
  demo: boolean;
  change: (a: RaidAction) => Promise<void>;
  send: () => void;
  onError: (s: string) => void;
}) {
  const [choices, setChoices] = useState<number[]>(p.votes[actorId] || []),
    [receipt, setReceipt] = useState<Delivery | null>(null),
    [busy, setBusy] = useState(false);
  const sync = async () => {
    if (demo || !connected) return;
    try {
      setReceipt(
        (
          await discordCall(
            `delivery?kind=poll&id=${encodeURIComponent(p.id)}&destination=channel`,
          )
        ).receipt,
      );
    } catch (e) {
      onError((e as Error).message);
    }
  };
  useEffect(() => {
    if (receipt?.finalized) return;
    void sync();
    if (p.voting !== "discord" || !connected || demo) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 30000);
    return () => clearInterval(timer);
  }, [p.id, connected, demo, receipt?.finalized]);
  const closed =
    p.closed || Date.parse(receipt?.expiresAt || p.closesAt) <= Date.now();
  const counts =
    p.voting === "site"
      ? p.options.map(
          (_, i) => Object.values(p.votes).filter((v) => v.includes(i)).length,
        )
      : receipt?.counts;
  const maximum = Math.max(1, ...(counts || []));
  const votes = counts?.reduce((n, x) => n + x, 0) || 0;
  const dirty =
    JSON.stringify([...choices].sort()) !==
    JSON.stringify([...(p.votes[actorId] || [])].sort());
  return (
    <article className={`hub-poll panel ${summary ? "poll-summary" : ""}`}>
      <header>
        <div>
          <span className={`badge ${closed ? "" : "green"}`}>
            {closed ? "Closed" : "Open poll"}
          </span>
          <h3>{p.title}</h3>
          <p>
            {p.timeZone} ·{" "}
            {p.voting === "discord" ? "Vote in Discord" : "Vote here"} · Choose
            all that work
          </p>
        </div>
        <BarChart3 size={24} />
      </header>
      <div className="poll-chart">
        {p.options.map((option, i) => (
          <div className="poll-option" key={option}>
            {p.voting === "site" && !summary ? (
              <label>
                <input
                  type="checkbox"
                  checked={choices.includes(i)}
                  disabled={closed || busy}
                  onChange={(e) =>
                    setChoices(
                      e.target.checked
                        ? [...choices, i]
                        : choices.filter((x) => x !== i),
                    )
                  }
                />
                <span>{option}</span>
              </label>
            ) : (
              <span>{option}</span>
            )}
            <div className="poll-bar-track">
              <div
                style={{ width: `${((counts?.[i] || 0) / maximum) * 100}%` }}
              />
            </div>
            <strong>{counts ? counts[i] : "—"}</strong>
          </div>
        ))}
      </div>
      <div className="poll-caption">
        <span>
          {counts
            ? `${votes} selections${p.voting === "site" ? ` from ${Object.values(p.votes).filter((v) => v.length).length} members` : ""}`
            : "Discord results will appear after publishing."}
        </span>
        <span>Closes {when(receipt?.expiresAt || p.closesAt)}</span>
      </div>
      <div className="hub-card-actions">
        {p.voting === "site" && !closed && !summary && (
          <button
            className="btn primary"
            disabled={busy || !dirty}
            onClick={async () => {
              setBusy(true);
              try {
                await change({ type: "poll.vote", pollId: p.id, choices });
              } catch (e) {
                onError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save my availability"}
          </button>
        )}
        {p.voting === "discord" && receipt?.url && !summary && (
          <a
            className="btn primary"
            href={receipt.url}
            target="_blank"
            rel="noreferrer"
          >
            Vote in Discord <ExternalLink size={14} />
          </a>
        )}
        {lead && !closed && (
          <button className="btn secondary" onClick={send}>
            <Send size={14} />
            {receipt?.status === "sent"
              ? "View Discord post"
              : "Post to Discord"}
          </button>
        )}
        {lead && p.voting === "site" && !closed && (
          <button
            className="btn text"
            onClick={() =>
              void change({ type: "poll.close", pollId: p.id }).catch((e) =>
                onError(e.message),
              )
            }
          >
            Close poll
          </button>
        )}
        {p.voting === "discord" && connected && (
          <button
            className="icon-btn"
            aria-label={`Refresh results for ${p.title}`}
            onClick={() => void sync()}
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>
      {receipt?.syncError && <p className="notice">{receipt.syncError}</p>}
      {receipt?.syncedAt && (
        <small className="muted">
          Synced {when(receipt.syncedAt)} ·{" "}
          {receipt.finalized
            ? "Final results"
            : "Discord counts may change until finalized"}
        </small>
      )}
    </article>
  );
}
