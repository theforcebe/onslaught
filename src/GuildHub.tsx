import { ItemTooltip } from "./ItemTooltip";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Link2,
  Megaphone,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Send,
  Users,
} from "lucide-react";
import { Field, Form, Modal } from "./components";
import { Dropdown } from "./Dropdown";
import { hasSection, hasTeam } from "./lib/access";
import type { Access, GuildView } from "./lib/access";
import { makeId } from "./lib/model";
import type { Identity, RaidAction, RaidState } from "./lib/model";
import { emptyCommunity } from "./lib/community";
import type { SchedulePoll } from "./lib/community";
import { discordCall } from "./lib/api";

type Props = {
  state: RaidState;
  access: Access;
  identity?: Identity;
  people: NonNullable<GuildView["people"]>;
  demo: boolean;
  change: (a: RaidAction) => Promise<void>;
  refresh: () => Promise<void>;
};
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
type DiscordState = {
  botConfigured: boolean;
  linkConfigured: boolean;
  connected: boolean;
  guildName: string;
  channelNames: Record<string, string>;
  ownLink: { name: string; dmOptIn: boolean } | null;
  config?: {
    guildId: string;
    pollsChannelId: string;
    announcementsChannelId: string;
    requestsChannelId: string;
  } | null;
  installUrl?: string;
  callbackUrl?: string;
};
const when = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
const defaultDiscord: DiscordState = {
  botConfigured: false,
  linkConfigured: false,
  connected: false,
  guildName: "Ønslaught",
  channelNames: {},
  ownLink: null,
};
const defaultChannels = {
  pollsChannelId: "1570172913955377303",
  announcementsChannelId: "1570172980842078248",
  requestsChannelId: "1570172876475072772",
};
const read = (f: FormData, k: string) => String(f.get(k) || "");
const DRAFT_NIGHTS = [
  "Monday · 7:00–10:00 PM",
  "Tuesday · 7:00–10:00 PM",
  "Wednesday · 7:00–10:00 PM",
  "Thursday · 7:00–10:00 PM",
  "Friday · 7:00–10:00 PM",
  "Saturday · 7:00–10:00 PM",
  "Sunday · 7:00–10:00 PM",
];

function PollCard({
  poll: p,
  actorId,
  lead,
  connected,
  demo,
  change,
  send,
  onError,
}: {
  poll: SchedulePoll;
  actorId: string;
  lead: boolean;
  connected: boolean;
  demo: boolean;
  change: Props["change"];
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
    void sync();
    if (p.voting !== "discord" || !connected || demo) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void sync();
    }, 30000);
    return () => clearInterval(timer);
  }, [p.id, connected, demo]);
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
    <article className="hub-poll panel">
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
            {p.voting === "site" ? (
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
        {p.voting === "site" && !closed && (
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
        {p.voting === "discord" && receipt?.url && (
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

export function GuildHub(p: Props) {
  const { state, access, people, demo, change } = p,
    c = state.community || emptyCommunity();
  const actorId = demo ? "demo-admin" : p.identity?.id || "",
    lead = access.admin || access.role === "officer";
  const tabs = [
    ...(hasSection(access, "community")
      ? [{ id: "board", label: "Guild board", icon: Megaphone }]
      : []),
    ...(hasSection(access, "attendance")
      ? [{ id: "polls", label: "Raid-night polls", icon: BarChart3 }]
      : []),
    ...(hasSection(access, "consumables")
      ? [{ id: "requests", label: "Material requests", icon: Package }]
      : []),
    { id: "connection", label: "Discord connection", icon: Link2 },
  ];
  const [selected, setSelected] = useState(tabs[0]?.id || "connection"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [compose, setCompose] = useState(""),
    [discord, setDiscord] = useState<DiscordState>(defaultDiscord),
    [sendRecord, setSendRecord] = useState<{
      kind: "poll" | "announcement" | "request";
      id: string;
      destination: "channel" | "dm";
    }>(),
    [delivery, setDelivery] = useState<Delivery | null>(null),
    [requestFilter, setRequestFilter] = useState("open"),
    [recipient, setRecipient] = useState(""),
    [scope, setScope] = useState(""),
    [pollMode, setPollMode] = useState("site");
  const tab = tabs.some((t) => t.id === selected) ? selected : tabs[0].id;
  const teams = [
    ...new Map(
      [
        ...state.teams.map((t) => ({ id: t.id, name: t.name })),
        ...state.events.map((e) => ({
          id: e.teamId,
          name:
            e.publicTeamName ||
            state.teams.find((t) => t.id === e.teamId)?.name ||
            "Raid team",
        })),
        ...state.characters
          .filter((c) => c.teamId)
          .map((c) => ({
            id: c.teamId!,
            name:
              c.publicTeamName ||
              state.teams.find((t) => t.id === c.teamId)?.name ||
              "Raid team",
          })),
      ]
        .filter((t) => hasTeam(access, t.id))
        .map((t) => [t.id, t]),
    ).values(),
  ];
  const refreshDiscord = async () => {
    if (demo) return;
    try {
      setDiscord(await discordCall("status"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refreshDiscord();
  }, [demo]);
  useEffect(() => {
    const eligible = people.filter(
      (m) => !scope || m.allTeams || m.teamIds.includes(scope),
    );
    if (!eligible.some((m) => m.id === recipient))
      setRecipient(eligible[0]?.id || "");
  }, [scope, people, recipient]);
  useEffect(() => {
    if (demo) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void p.refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [demo]);
  const perform = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openSend = (
    kind: "poll" | "announcement" | "request",
    id: string,
    destination: "channel" | "dm" = "channel",
  ) => {
    setDelivery(null);
    setSendRecord({ kind, id, destination });
    if (!demo && discord.connected)
      void discordCall(
        `delivery?kind=${kind}&id=${encodeURIComponent(id)}&destination=${destination}`,
      )
        .then((r) => setDelivery(r.receipt))
        .catch((e) => setError(e.message));
  };
  const contextField = (
    <Field label="Visible to">
      <Dropdown
        label="Record visibility"
        value={scope}
        onChange={setScope}
        options={[
          { value: "", label: "Guild-wide · members with section access" },
          ...teams.map((t) => ({ value: t.id, label: t.name })),
        ]}
      />
    </Field>
  );
  const requests = c.requests.filter((r) =>
    requestFilter === "all" || requestFilter === "mine"
      ? requestFilter === "all" || r.recipientId === actorId
      : !r.cancelled && r.fulfilled < r.quantity,
  );
  const openRequests = c.requests.filter(
      (r) => !r.cancelled && r.fulfilled < r.quantity,
    ),
    finished = c.requests.filter(
      (r) => !r.cancelled && r.fulfilled === r.quantity,
    );
  const discussion = (kind: "request" | "announcement", id: string) => (
    <details className="hub-discussion">
      <summary>
        <MessageSquare size={14} /> Discussion (
        {c.replies.filter((r) => r.kind === kind && r.recordId === id).length})
      </summary>
      {c.replies
        .filter((r) => r.kind === kind && r.recordId === id)
        .map((r) => (
          <div className="hub-reply" key={r.id}>
            <strong>{r.createdByName}</strong>
            <small>{when(r.createdAt)}</small>
            <p>{r.body}</p>
          </div>
        ))}
      <Form
        key={
          c.replies.filter((r) => r.kind === kind && r.recordId === id).length
        }
        onSubmit={(f) =>
          void perform(async () => {
            await change({
              type: "community.reply",
              id: makeId(),
              kind,
              recordId: id,
              body: read(f, "body"),
            });
          })
        }
      >
        <Field label="Add a reply">
          <textarea
            name="body"
            required
            maxLength={500}
            rows={2}
            placeholder="A short update or question for the team…"
          />
        </Field>
        <button className="btn secondary" disabled={busy}>
          Post reply
        </button>
      </Form>
    </details>
  );
  const sendTitle =
    sendRecord?.kind === "poll"
      ? c.polls.find((x) => x.id === sendRecord.id)?.title
      : sendRecord?.kind === "announcement"
        ? c.announcements.find((x) => x.id === sendRecord.id)?.title
        : c.requests.find((x) => x.id === sendRecord?.id)?.item;
  return (
    <div className="guild-hub">
      <div className="hub-tabs" role="tablist" aria-label="Guild coordination">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setSelected(t.id)}
          >
            <t.icon size={17} />
            {t.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {tab !== "connection" && (
        <div className="hub-connection-strip">
          <span
            className={discord.connected ? "connected-dot" : "disconnected-dot"}
          />
          <span>
            {demo
              ? "Fictional workspace · no messages are sent"
              : discord.connected
                ? `Discord configured for ${discord.guildName}`
                : "Discord setup pending · site coordination is available"}
          </span>
          <button
            className="btn text"
            onClick={() => setSelected("connection")}
          >
            Manage connection
          </button>
        </div>
      )}
      {tab === "board" && (
        <>
          <div className="section-heading">
            <div>
              <h2>From the guild</h2>
              <p className="muted">
                Announcements and focused conversations, together in one place.
              </p>
            </div>
            {lead && (
              <button
                className="btn primary"
                onClick={() => {
                  setScope("");
                  setCompose("announcement");
                }}
              >
                <Plus size={16} /> Write announcement
              </button>
            )}
          </div>
          {!c.announcements.length && (
            <div className="hub-empty panel">
              <Megaphone />
              <h3>A home for guild updates</h3>
              <p>
                Admins and Officers can post announcements here, then share them
                to Discord.
              </p>
            </div>
          )}
          <div className="hub-announcements">
            {c.announcements.map((m) => (
              <article className="panel hub-announcement" key={m.id}>
                <div className="hub-meta">
                  <span>{m.createdByName}</span>
                  <time>{when(m.createdAt)}</time>
                  <span>
                    {teams.find((t) => t.id === m.teamId)?.name || "Guild-wide"}
                  </span>
                </div>
                <h3>{m.title}</h3>
                <p className="hub-body">{m.body}</p>
                {lead && (
                  <button
                    className="btn secondary"
                    onClick={() => openSend("announcement", m.id)}
                  >
                    <Send size={14} /> Post to Discord
                  </button>
                )}
                {discussion("announcement", m.id)}
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "polls" && (
        <>
          <div className="section-heading">
            <div>
              <h2>Find your raid nights</h2>
              <p className="muted">
                Compare availability before putting dates on the calendar.
              </p>
            </div>
            {lead && (
              <button
                className="btn primary"
                onClick={() => {
                  setScope("");
                  setPollMode(discord.connected ? "discord" : "site");
                  setCompose("poll");
                }}
              >
                <Plus size={16} /> New scheduling poll
              </button>
            )}
          </div>
          {!c.polls.length && (
            <div className="hub-empty panel">
              <BarChart3 />
              <h3>Which nights work for the team?</h3>
              <p>
                Create a poll with nights and times. Results will appear as an
                availability chart here.
              </p>
            </div>
          )}
          <div className="hub-polls">
            {c.polls.map((poll) => (
              <PollCard
                key={poll.id}
                poll={poll}
                actorId={actorId}
                lead={lead}
                connected={discord.connected}
                demo={demo}
                change={change}
                send={() => openSend("poll", poll.id)}
                onError={setError}
              />
            ))}
          </div>
        </>
      )}
      {tab === "requests" && (
        <>
          <div className="section-heading">
            <div>
              <h2>Keep the raid supplied</h2>
              <p className="muted">
                Assign materials, track progress, and see who has delivered.
              </p>
            </div>
            {lead && (
              <button
                className="btn primary"
                onClick={() => {
                  setScope("");
                  setRecipient(people[0]?.id || "");
                  setCompose("request");
                }}
              >
                <Plus size={16} /> Request materials
              </button>
            )}
          </div>
          <div className="request-overview">
            <div>
              <Package />
              <strong>{openRequests.length}</strong>
              <span>Open requests</span>
            </div>
            <div>
              <CheckCircle2 />
              <strong>{finished.length}</strong>
              <span>Fulfilled</span>
            </div>
            <div>
              <Clock3 />
              <strong>
                {
                  openRequests.filter(
                    (r) => r.dueAt && Date.parse(r.dueAt) < Date.now(),
                  ).length
                }
              </strong>
              <span>Past due</span>
            </div>
            <div>
              <Users />
              <strong>
                {new Set(openRequests.map((r) => r.recipientId)).size}
              </strong>
              <span>Members helping</span>
            </div>
          </div>
          <div className="segmented hub-filter">
            {[
              { id: "open", name: "Open requests" },
              { id: "mine", name: "Assigned to me" },
              { id: "all", name: "All requests" },
            ].map((x) => (
              <button
                key={x.id}
                className={requestFilter === x.id ? "active" : ""}
                onClick={() => setRequestFilter(x.id)}
              >
                {x.name}
              </button>
            ))}
          </div>
          {!requests.length && (
            <div className="hub-empty panel">
              <Package />
              <h3>No requests in this view</h3>
              <p>
                Requests keep the item, recipient, dates and fulfillment history
                together.
              </p>
            </div>
          )}
          <div className="material-report">
            {requests.map((r) => (
              <article className="material-row panel" key={r.id}>
                <div className="material-heading">
                  <div>
                    <span
                      className={`badge ${r.fulfilled === r.quantity ? "green" : ""}`}
                    >
                      {r.cancelled
                        ? "Cancelled"
                        : r.fulfilled === r.quantity
                          ? "Fulfilled"
                          : r.fulfilled
                            ? "In progress"
                            : "Requested"}
                    </span>
                    <h3>
                      {r.itemId ? (
                        <ItemTooltip
                          id={r.itemId}
                          name={r.item}
                          className="item-name"
                          icon
                        />
                      ) : (
                        r.item
                      )}
                    </h3>
                    <p>
                      Assigned to <strong>{r.recipientName}</strong>
                    </p>
                  </div>
                  <div className="material-quantity">
                    <strong>
                      {r.fulfilled}
                      <small>/{r.quantity}</small>
                    </strong>
                    <span>delivered</span>
                  </div>
                </div>
                <div className="material-progress">
                  <div
                    style={{ width: `${(100 * r.fulfilled) / r.quantity}%` }}
                  />
                </div>
                <div className="hub-meta">
                  <span>
                    By {r.createdByName} · {when(r.createdAt)}
                  </span>
                  <span>
                    {r.dueAt ? `Due ${when(r.dueAt)}` : "No due date"}
                  </span>
                  <span>Updated {when(r.updatedAt)}</span>
                </div>
                {r.notes && <p className="hub-body">{r.notes}</p>}
                <div className="hub-card-actions">
                  {!r.cancelled &&
                    (access.admin || r.recipientId === actorId) && (
                      <button
                        className="btn primary"
                        onClick={() => setCompose(`fulfill:${r.id}`)}
                      >
                        <Check size={15} /> Update fulfillment
                      </button>
                    )}
                  {lead && !r.cancelled && (
                    <>
                      <button
                        className="btn secondary"
                        onClick={() => openSend("request", r.id)}
                      >
                        <Send size={14} /> Notify channel
                      </button>
                      <button
                        className="btn text"
                        onClick={() => openSend("request", r.id, "dm")}
                      >
                        Send optional DM
                      </button>
                      {(access.admin || r.createdBy === actorId) && (
                        <button
                          className="btn text"
                          onClick={() =>
                            void change({
                              type: "material.cancel",
                              requestId: r.id,
                            }).catch((e) => setError(e.message))
                          }
                        >
                          Cancel request
                        </button>
                      )}
                    </>
                  )}
                </div>
                {!!r.updates.length && (
                  <details className="details">
                    <summary>Fulfillment history ({r.updates.length})</summary>
                    {r.updates.map((u, i) => (
                      <div className="hub-reply" key={i}>
                        <strong>
                          {u.byName} · {u.quantity}/{r.quantity}
                        </strong>
                        <small>{when(u.at)}</small>
                        {u.note && <p>{u.note}</p>}
                      </div>
                    ))}
                  </details>
                )}
                {discussion("request", r.id)}
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "connection" && (
        <div className="discord-settings">
          <section className="panel discord-link-card">
            <Link2 size={29} />
            <div>
              <h2>Your Discord connection</h2>
              <p>
                Battle.net remains your sign-in. Linking Discord lets the guild
                send you assigned material requests.
              </p>
              {discord.ownLink ? (
                <>
                  <p className="badge green">
                    Linked as {discord.ownLink.name}
                  </p>
                  <label className="discord-opt-in">
                    <input
                      type="checkbox"
                      checked={discord.ownLink.dmOptIn}
                      disabled={busy}
                      onChange={(e) =>
                        void perform(async () => {
                          await discordCall("preferences", {
                            dmOptIn: e.target.checked,
                          });
                          await refreshDiscord();
                        })
                      }
                    />{" "}
                    Allow direct messages for material requests assigned to me
                  </label>
                  <p className="muted">
                    Your Discord privacy settings must also allow the bot to
                    send you DMs.
                  </p>
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await discordCall("unlink", {});
                        await refreshDiscord();
                      })
                    }
                  >
                    Unlink Discord
                  </button>
                </>
              ) : (
                <button
                  className="btn primary"
                  disabled={
                    demo ||
                    !discord.connected ||
                    !discord.linkConfigured ||
                    busy
                  }
                  onClick={() => {
                    const popup = window.open(
                      "about:blank",
                      "onslaught-discord-link",
                      "popup,width=540,height=740",
                    );
                    if (!popup) {
                      setError(
                        "Allow the Discord linking popup and try again.",
                      );
                      return;
                    }
                    void perform(async () => {
                      try {
                        const result = await discordCall("link/start", {});
                        const url = new URL(result.url);
                        if (
                          url.origin !==
                            new URL(import.meta.env.VITE_API_URL).origin ||
                          url.pathname !== "/discord/connect"
                        )
                          throw new Error("Invalid Discord connection URL.");
                        popup.location.href = url.href;
                      } catch (e) {
                        popup.close();
                        throw e;
                      }
                    });
                  }}
                >
                  Link my Discord
                </button>
              )}
              <button
                className="btn text"
                disabled={demo || busy}
                onClick={() => void refreshDiscord()}
              >
                <RefreshCw size={15} /> Refresh connection
              </button>
            </div>
          </section>
          {access.admin && (
            <section className="panel discord-admin">
              <h3>Connect the Ønslaught server</h3>
              <p className="muted">
                The bot needs View Channel, Send Messages, Embed Links, Read
                Message History, and Send Polls in the channels you choose. It
                does not need Administrator permission or message-content
                access.
              </p>
              <ol className="discord-setup-list">
                <li>
                  <strong>Create the Discord application</strong>
                  <span>
                    Use the Discord developer portal. Add the callback below
                    under OAuth2 redirects.
                  </span>
                  <a
                    href="https://discord.com/developers/applications"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open developer portal <ExternalLink size={13} />
                  </a>
                  <code>
                    {discord.callbackUrl ||
                      "https://onslaught-gateway.onslaught-raid.workers.dev/discord/callback"}
                  </code>
                </li>
                <li>
                  <strong>Store the bot credentials privately</strong>
                  <span>
                    Add DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID and
                    DISCORD_CLIENT_SECRET as Cloudflare Worker secrets. Never
                    paste them into this site or chat.
                  </span>
                  <span className="badge">
                    Bot {discord.botConfigured ? "ready" : "pending"} · Account
                    linking {discord.linkConfigured ? "ready" : "pending"}
                  </span>
                </li>
                <li>
                  <strong>Install the bot in your server</strong>
                  {discord.installUrl ? (
                    <a
                      className="btn secondary"
                      href={discord.installUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Authorize Ønslaught bot <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span>
                      Available after the application ID is configured.
                    </span>
                  )}
                </li>
                <li>
                  <strong>Choose channels</strong>
                  <span>
                    Enable Developer Mode in Discord, then use Copy Server ID /
                    Copy Channel ID. The three channel IDs below come from your
                    announcements, raid scheduling, and material request
                    invites.
                  </span>
                </li>
              </ol>
              <Form
                key={JSON.stringify(discord.config)}
                onSubmit={(f) =>
                  void perform(async () => {
                    await discordCall("config", {
                      guildId: read(f, "guildId"),
                      pollsChannelId: read(f, "pollsChannelId"),
                      announcementsChannelId: read(f, "announcementsChannelId"),
                      requestsChannelId: read(f, "requestsChannelId"),
                    });
                    await refreshDiscord();
                  })
                }
              >
                <Field label="Discord server ID">
                  <input
                    name="guildId"
                    required
                    pattern="[0-9]{17,20}"
                    defaultValue={
                      discord.config?.guildId || "1346205094550700072"
                    }
                  />
                </Field>
                <div className="form-grid">
                  {[
                    {
                      key: "pollsChannelId",
                      label: "Scheduling polls channel",
                    },
                    {
                      key: "announcementsChannelId",
                      label: "Guild announcements channel",
                    },
                    {
                      key: "requestsChannelId",
                      label: "Material requests channel",
                    },
                  ].map((x) => (
                    <Field key={x.key} label={x.label}>
                      <input
                        name={x.key}
                        required
                        pattern="[0-9]{17,20}"
                        defaultValue={
                          discord.config?.[
                            x.key as keyof typeof discord.config
                          ] ||
                          defaultChannels[x.key as keyof typeof defaultChannels]
                        }
                      />
                    </Field>
                  ))}
                </div>
                <button
                  className="btn primary"
                  disabled={demo || busy || !discord.botConfigured}
                >
                  Validate & save channels
                </button>
              </Form>
            </section>
          )}
        </div>
      )}
      {!!compose && (
        <Modal
          title={
            compose === "poll"
              ? "Plan your raid nights"
              : compose === "announcement"
                ? "Write a guild announcement"
                : compose === "request"
                  ? "Assign a material request"
                  : "Update fulfillment"
          }
          onClose={() => setCompose("")}
        >
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          <Form
            onSubmit={(f) =>
              void perform(async () => {
                let action: RaidAction;
                if (compose === "poll")
                  action = {
                    type: "poll.create",
                    poll: {
                      id: makeId(),
                      title: read(f, "title"),
                      options: read(f, "options")
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      timeZone: read(f, "timeZone"),
                      closesAt: new Date(read(f, "closesAt")).toISOString(),
                      voting: pollMode as "site" | "discord",
                      ...(scope ? { teamId: scope } : {}),
                    },
                  };
                else if (compose === "announcement")
                  action = {
                    type: "announcement.create",
                    announcement: {
                      id: makeId(),
                      title: read(f, "title"),
                      body: read(f, "body"),
                      ...(scope ? { teamId: scope } : {}),
                    },
                  };
                else if (compose === "request")
                  action = {
                    type: "material.create",
                    request: {
                      id: makeId(),
                      recipientId: recipient,
                      item: read(f, "item"),
                      quantity: Number(read(f, "quantity")),
                      notes: read(f, "notes"),
                      ...(read(f, "itemId")
                        ? { itemId: Number(read(f, "itemId")) }
                        : {}),
                      ...(read(f, "dueAt")
                        ? { dueAt: new Date(read(f, "dueAt")).toISOString() }
                        : {}),
                      ...(scope ? { teamId: scope } : {}),
                    },
                  };
                else
                  action = {
                    type: "material.progress",
                    requestId: compose.split(":")[1],
                    quantity: Number(read(f, "quantity")),
                    note: read(f, "note"),
                  };
                await change(action);
                setCompose("");
              })
            }
          >
            {["poll", "announcement"].includes(compose) && (
              <Field label="Title">
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={compose === "poll" ? 200 : 150}
                  defaultValue={
                    compose === "poll" ? "Which nights can you raid?" : ""
                  }
                />
              </Field>
            )}
            {compose === "announcement" && (
              <Field label="Message">
                <textarea
                  name="body"
                  rows={6}
                  required
                  maxLength={1800}
                  placeholder="What does the guild need to know?"
                />
              </Field>
            )}
            {compose === "poll" && (
              <>
                <Field label="Nights and times · one option per line">
                  <textarea
                    name="options"
                    required
                    rows={7}
                    defaultValue={DRAFT_NIGHTS.join("\n")}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Time zone for all choices">
                    <input
                      name="timeZone"
                      required
                      defaultValue={state.guild.timeZone}
                    />
                  </Field>
                  <Field label="Voting closes · your device time">
                    <input
                      name="closesAt"
                      type="datetime-local"
                      required
                      defaultValue={new Date(
                        Date.now() +
                          7 * 86400000 -
                          new Date().getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)}
                    />
                  </Field>
                </div>
                <Field label="Where members vote">
                  <Dropdown
                    label="Voting location"
                    value={pollMode}
                    onChange={setPollMode}
                    options={[
                      {
                        value: "site",
                        label: "Ønslaught site",
                        detail: "Members vote here; Discord gets a link.",
                      },
                      ...(discord.connected
                        ? [
                            {
                              value: "discord",
                              label: "Native Discord poll",
                              detail:
                                "Members vote in Discord; results appear here.",
                            },
                          ]
                        : []),
                    ]}
                  />
                </Field>
                <p className="muted">
                  Each poll has one voting location to avoid duplicate
                  responses. Native Discord polls use whole-hour durations.
                </p>
              </>
            )}
            {compose === "request" && (
              <>
                <Field label="Assign to member">
                  <Dropdown
                    label="Request recipient"
                    value={recipient}
                    onChange={setRecipient}
                    options={people
                      .filter(
                        (m) =>
                          !scope || m.allTeams || m.teamIds.includes(scope),
                      )
                      .map((m) => ({ value: m.id, label: m.label }))}
                  />
                </Field>
                {!people.length && (
                  <p className="notice">
                    Approve members and grant Consumables access in Members &
                    access first.
                  </p>
                )}
                <div className="form-grid">
                  <Field label="Material or item">
                    <input
                      name="item"
                      required
                      maxLength={150}
                      placeholder="Dreamfoil, flasks, food…"
                    />
                  </Field>
                  <Field label="Quantity">
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      max={100000}
                      defaultValue={20}
                      required
                    />
                  </Field>
                  <Field label="Item ID · optional">
                    <input name="itemId" type="number" min={1} />
                  </Field>
                  <Field label="Due · optional, your device time">
                    <input name="dueAt" type="datetime-local" />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea
                    name="notes"
                    maxLength={1000}
                    rows={3}
                    placeholder="Where to deliver, who to trade, or crafting details…"
                  />
                </Field>
              </>
            )}
            {["poll", "announcement", "request"].includes(compose) ? (
              contextField
            ) : (
              <>
                <Field label="Total quantity fulfilled so far">
                  <input
                    name="quantity"
                    type="number"
                    min={0}
                    max={
                      c.requests.find((r) => r.id === compose.split(":")[1])
                        ?.quantity
                    }
                    defaultValue={
                      c.requests.find((r) => r.id === compose.split(":")[1])
                        ?.fulfilled
                    }
                    required
                  />
                </Field>
                <Field label="Delivery note · optional">
                  <textarea name="note" maxLength={500} rows={3} />
                </Field>
                <p className="muted">
                  Set the total delivered, including previous deliveries.
                  Matching the requested quantity marks it fulfilled.
                </p>
              </>
            )}
            <div className="form-actions">
              <span className="muted">
                {compose.startsWith("fulfill:")
                  ? "Saved with a timestamp."
                  : "Save here first, then preview a Discord notification."}
              </span>
              <button
                className="btn primary"
                disabled={busy || (compose === "request" && !recipient)}
              >
                {busy
                  ? "Saving…"
                  : compose.startsWith("fulfill:")
                    ? "Save fulfillment"
                    : "Save to guild"}
              </button>
            </div>
          </Form>
        </Modal>
      )}
      {sendRecord && (
        <Modal
          title={
            sendRecord.destination === "dm"
              ? "Send a request DM"
              : "Post to Discord"
          }
          onClose={() => setSendRecord(undefined)}
        >
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          <div className="discord-post-preview">
            <span className="badge">
              {sendRecord.destination === "dm"
                ? "Recipient’s opted-in Discord DM"
                : `#${discord.channelNames[sendRecord.kind === "poll" ? "pollsChannelId" : sendRecord.kind === "announcement" ? "announcementsChannelId" : "requestsChannelId"] || "configured channel"}`}
            </span>
            <h3>{sendTitle}</h3>
            {sendRecord.kind === "announcement" ? (
              <p>{c.announcements.find((m) => m.id === sendRecord.id)?.body}</p>
            ) : sendRecord.kind === "request" ? (
              (() => {
                const r = c.requests.find((r) => r.id === sendRecord.id)!;
                return (
                  <>
                    <p>
                      {r.quantity} × {r.item} for {r.recipientName}
                    </p>
                    <p>
                      Requested by {r.createdByName}
                      {r.dueAt ? ` · Due ${when(r.dueAt)}` : ""}
                    </p>
                    <p>{r.notes}</p>
                    <small>
                      Includes a link to update fulfillment on the site.
                    </small>
                  </>
                );
              })()
            ) : (
              <>
                <p>
                  {c.polls
                    .find((x) => x.id === sendRecord.id)
                    ?.options.join("\n")}
                </p>
                <p>
                  Time zone:{" "}
                  {c.polls.find((x) => x.id === sendRecord.id)?.timeZone}
                </p>
                <small>
                  {c.polls.find((x) => x.id === sendRecord.id)?.voting ===
                  "discord"
                    ? "A native Discord poll. Votes will be mirrored here."
                    : "A link to the website poll."}
                </small>
              </>
            )}
          </div>
          <p className="muted">
            {sendRecord.destination === "channel"
              ? "Anyone with access to that Discord channel can read this copy. Site access rules still control the linked record."
              : "Only linked members who opted into request DMs can receive this. If Discord blocks the DM, use the shared channel."}{" "}
            No mass mentions are sent.
          </p>
          {delivery?.status === "sent" ? (
            <p className="notice">
              <CheckCircle2 size={16} />
              Sent {delivery.sentAt ? when(delivery.sentAt) : ""}
              {delivery.url && (
                <a href={delivery.url} target="_blank" rel="noreferrer">
                  Open Discord message
                </a>
              )}
            </p>
          ) : (
            <>
              {delivery?.error && <p className="notice">{delivery.error}</p>}
              <button
                className="btn primary"
                disabled={
                  busy ||
                  demo ||
                  !discord.connected ||
                  delivery?.status === "sending" ||
                  delivery?.status === "uncertain"
                }
                onClick={() =>
                  void perform(async () => {
                    const result = await discordCall("send", sendRecord);
                    setDelivery(result.receipt);
                  })
                }
              >
                <Send size={15} />
                {busy
                  ? "Sending…"
                  : sendRecord.destination === "dm"
                    ? "Send request DM"
                    : "Send to channel"}
              </button>
              {(!discord.connected || demo) && (
                <p className="muted">
                  {demo
                    ? "Demo mode never sends Discord messages."
                    : "Finish the Discord connection before sending."}
                </p>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
