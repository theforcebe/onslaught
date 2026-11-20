import { useEffect, useRef, useState } from "react";
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
  const [draft, setChoices] = useState<number[]>(),
    [receipt, setReceipt] = useState<Delivery | null>(null),
    [busy, setBusy] = useState(false);
  const requestNumber = useRef(0);
  const choices = draft ?? p.votes[actorId] ?? [];
  const sync = async () => {
    if (demo || !connected || (summary && p.voting === "site")) return;
    const current = ++requestNumber.current;
    try {
      const data = await discordCall(
        `delivery?kind=poll&id=${encodeURIComponent(p.id)}&destination=channel`,
      );
      if (current === requestNumber.current) setReceipt(data.receipt);
    } catch (e) {
      if (current === requestNumber.current) onError((e as Error).message);
    }
  };
  useEffect(() => {
    if (receipt?.finalized) return;
    void sync();
    const timer =
      p.voting === "discord" && connected && !demo
        ? setInterval(() => {
            if (document.visibilityState === "visible") void sync();
          }, 30000)
        : undefined;
    return () => {
      requestNumber.current++;
      clearInterval(timer);
    };
  }, [p.id, p.voting, summary, connected, demo, receipt?.finalized]);
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
  const indexed = p.options.map((option, i) => ({ option, i }));
  const rows =
    summary && counts && indexed.length > 3
      ? indexed.sort((a, b) => counts[b.i] - counts[a.i]).slice(0, 3)
      : indexed;
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
            {summary
              ? p.voting === "discord"
                ? "Discord results"
                : "Results · vote in Raid planner"
              : p.voting === "discord"
                ? "Vote in Discord · choose all that work"
                : "Vote here · choose all that work"}
          </p>
        </div>
        <BarChart3 size={24} />
      </header>
      <div className="poll-chart">
        {rows.map(({ option, i }) => (
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
        {rows.length < p.options.length && (
          <span>
            Top {rows.length} of {p.options.length} options
          </span>
        )}
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
                setChoices(undefined);
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
        {p.voting === "discord" && receipt?.url && !closed && (
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
        {p.voting === "discord" && connected && !summary && (
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
      {receipt?.syncedAt && !summary && (
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
