import { useState } from "react";
import { Package, Plus, Send, Trophy } from "lucide-react";
import type { Access, GuildView } from "./lib/access";
import { hasSection } from "./lib/access";
import type { RaidAction, RaidState } from "./lib/model";
import { makeId } from "./lib/model";
import { contributionBoard } from "./lib/community";
import { Field, Form, Meter, Modal } from "./components";
import { ItemPicker } from "./ItemPicker";
import type { ItemSuggestion } from "./ItemPicker";
import { ItemTooltip } from "./ItemTooltip";

export function MaterialBoard({
  state,
  access,
  actorId,
  people,
  links,
  change,
  send,
  connected,
}: {
  state: RaidState;
  access: Access;
  actorId: string;
  people: NonNullable<GuildView["people"]>;
  links: { id: string; dmOptIn: boolean }[];
  change: (a: RaidAction) => Promise<void>;
  send: (id: string, destination: "channel" | "dm") => void;
  connected: boolean;
}) {
  const all = state.community?.requests || [],
    lead =
      access.admin ||
      (access.role === "officer" && hasSection(access, "consumables"));
  const [filter, setFilter] = useState("open"),
    [compose, setCompose] = useState(false),
    [selected, setSelected] = useState<ItemSuggestion>(),
    [recipient, setRecipient] = useState(""),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState("");
  const perform = async (a: RaidAction) => {
    setBusy(true);
    setError("");
    try {
      await change(a);
      setCompose(false);
      setEditing("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const records = all.filter(
    (r) =>
      filter === "all" ||
      (filter === "mine"
        ? r.recipientId === actorId || r.createdBy === actorId
        : !r.cancelled &&
          r.fulfilled < r.quantity &&
          (filter !== "lobby" || !r.recipientId)),
  );
  const ranks = contributionBoard(all),
    current = all.find((r) => r.id === editing);
  return (
    <div className="material-workspace">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE GUILD SUPPLY LINE</span>
          <h2>Many hands. Ready for raid.</h2>
          <p className="muted">
            Ask the guild, take a request, and record what you deliver.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setSelected(undefined);
            setRecipient("");
            setSearch("");
            setCompose(true);
            setError("");
          }}
        >
          <Plus size={16} />
          New request
        </button>
      </div>
      {error && (
        <p role="alert" className="notice danger">
          {error}
        </p>
      )}
      <div className="material-layout">
        <section>
          <div
            className="segmented material-filters"
            aria-label="Filter material requests"
          >
            {[
              ["open", "Open"],
              ["lobby", "Up for grabs"],
              ["mine", "My requests"],
              ["all", "History"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? "active" : ""}
                onClick={() => setFilter(id)}
              >
                {label}{" "}
                <small>
                  {
                    all.filter(
                      (r) =>
                        id === "all" ||
                        (id === "mine"
                          ? r.recipientId === actorId || r.createdBy === actorId
                          : !r.cancelled &&
                            r.fulfilled < r.quantity &&
                            (id !== "lobby" || !r.recipientId)),
                    ).length
                  }
                </small>
              </button>
            ))}
          </div>
          {!records.length && (
            <div className="panel empty">
              <Package />
              <h3>
                {filter === "lobby"
                  ? "No unclaimed requests"
                  : "All clear here"}
              </h3>
              <p>
                New requests and delivery updates appear here as the guild
                contributes.
              </p>
            </div>
          )}
          <div className="material-cards">
            {records.map((r) => (
              <article
                className={`panel material-card ${r.fulfilled === r.quantity ? "completed" : ""}`}
                key={r.id}
              >
                <div className="panel-title">
                  <h3>
                    {r.itemId ? (
                      <ItemTooltip id={r.itemId} name={r.item} icon />
                    ) : (
                      r.item
                    )}
                  </h3>
                  <span className="badge">
                    {r.cancelled
                      ? "Cancelled"
                      : r.fulfilled === r.quantity
                        ? "Fulfilled"
                        : r.recipientId
                          ? "In progress"
                          : "Up for grabs"}
                  </span>
                </div>
                <div className="delivery-progress">
                  <strong>
                    {r.fulfilled}
                    <span> / {r.quantity}</span>
                  </strong>
                  <Meter value={r.fulfilled} max={r.quantity} />
                </div>
                <p className="request-owner">
                  {r.recipientId ? (
                    <>
                      Taken by <strong>{r.recipientName}</strong>
                    </>
                  ) : (
                    <strong>Open to any guild member</strong>
                  )}
                  <small>
                    Requested by {r.createdByName} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString()}
                    {r.dueAt
                      ? ` · Due ${new Date(r.dueAt).toLocaleDateString()}`
                      : ""}
                  </small>
                </p>
                {r.notes && <p className="request-notes">{r.notes}</p>}
                <div className="button-row">
                  {!r.cancelled &&
                    r.fulfilled < r.quantity &&
                    !r.recipientId && (
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() =>
                          void perform({
                            type: "material.claim",
                            requestId: r.id,
                          })
                        }
                      >
                        I’ll take this
                      </button>
                    )}
                  {!r.cancelled &&
                    r.recipientId &&
                    (access.admin || r.recipientId === actorId) && (
                      <button
                        className="btn secondary"
                        onClick={() => setEditing(r.id)}
                      >
                        Update delivery
                      </button>
                    )}
                  {!r.cancelled &&
                    r.openToGuild &&
                    r.recipientId === actorId &&
                    r.fulfilled === 0 && (
                      <button
                        className="btn text"
                        disabled={busy}
                        onClick={() =>
                          void perform({
                            type: "material.release",
                            requestId: r.id,
                          })
                        }
                      >
                        Release
                      </button>
                    )}
                  {lead && (
                    <>
                      <button
                        className="btn text"
                        disabled={!connected}
                        onClick={() => send(r.id, "channel")}
                      >
                        <Send size={14} />
                        Post to channel
                      </button>
                      {r.recipientId && (
                        <button
                          className="btn text"
                          disabled={
                            !connected ||
                            !links.some(
                              (l) => l.id === r.recipientId && l.dmOptIn,
                            )
                          }
                          title="Recipient must link Discord and allow request DMs"
                          onClick={() => send(r.id, "dm")}
                        >
                          Send DM
                        </button>
                      )}
                    </>
                  )}
                </div>
                <details className="request-history">
                  <summary>
                    Updates & discussion ·{" "}
                    {r.updates.length +
                      (state.community?.replies.filter(
                        (x) => x.recordId === r.id && x.kind === "request",
                      ).length || 0)}
                  </summary>
                  {r.updates.slice(0, 8).map((u, i) => (
                    <p key={i}>
                      <strong>{u.byName}</strong> · {u.quantity} delivered ·{" "}
                      {new Date(u.at).toLocaleString()}
                      {u.note && ` — ${u.note}`}
                    </p>
                  ))}
                  {state.community?.replies
                    .filter((x) => x.recordId === r.id && x.kind === "request")
                    .map((x) => (
                      <p key={x.id}>
                        <strong>{x.createdByName}</strong> · {x.body}
                      </p>
                    ))}
                  <Form
                    key={state.community?.replies.length}
                    onSubmit={(f) =>
                      void perform({
                        type: "community.reply",
                        kind: "request",
                        recordId: r.id,
                        id: makeId(),
                        body: String(f.get("reply") || ""),
                      })
                    }
                  >
                    <div className="reply-compose">
                      <input
                        name="reply"
                        aria-label={`Reply about ${r.item}`}
                        required
                        maxLength={500}
                        placeholder="Coordinate a delivery…"
                      />
                      <button className="btn secondary" disabled={busy}>
                        Reply
                      </button>
                    </div>
                  </Form>
                  {!r.cancelled &&
                    (access.admin || r.createdBy === actorId) && (
                      <button
                        className="btn text"
                        disabled={busy}
                        onClick={() =>
                          void perform({
                            type: "material.cancel",
                            requestId: r.id,
                          })
                        }
                      >
                        Cancel request
                      </button>
                    )}
                </details>
              </article>
            ))}
          </div>
        </section>
        <aside className="panel contribution-board">
          <div className="panel-title">
            <h3>
              <Trophy size={18} /> Guild contributors
            </h3>
          </div>
          <p className="muted">
            Completed requests, then requests helped. Based on the records you
            can see.
          </p>
          {ranks.length ? (
            ranks.map((p, i) => (
              <div className="contributor" key={p.id}>
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.helped} helped · {p.units} items delivered
                  </small>
                </span>
                <strong>
                  {p.completed}
                  <small>completed</small>
                </strong>
              </div>
            ))
          ) : (
            <p className="muted">The first delivery starts the board.</p>
          )}
        </aside>
      </div>
      {compose && (
        <Modal title="Request materials" onClose={() => setCompose(false)}>
          <Form
            onSubmit={(f) =>
              void perform({
                type: "material.create",
                request: {
                  id: makeId(),
                  recipientId: recipient || undefined,
                  item: selected?.name || String(f.get("item") || ""),
                  itemId: selected?.id,
                  quantity: Number(f.get("quantity")),
                  notes: String(f.get("notes") || ""),
                  dueAt: f.get("dueAt")
                    ? new Date(String(f.get("dueAt"))).toISOString()
                    : undefined,
                },
              })
            }
          >
            <ItemPicker value={selected} onChange={setSelected} />
            {!selected && (
              <Field label="Or enter an item name">
                <input
                  name="item"
                  required
                  maxLength={150}
                  placeholder="For an item you cannot find"
                />
              </Field>
            )}
            <div className="form-grid">
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
              <Field label="Needed by (optional)">
                <input name="dueAt" type="datetime-local" />
              </Field>
            </div>
            {lead && (
              <fieldset className="recipient-picker">
                <legend>Who can help?</legend>
                <button
                  type="button"
                  className={`recipient-option ${!recipient ? "selected" : ""}`}
                  onClick={() => setRecipient("")}
                >
                  <strong>Open to volunteers</strong>
                  <small>Any approved member can claim this request</small>
                </button>
                <input
                  aria-label="Find a request recipient"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a guild member…"
                />
                <div className="recipient-list">
                  {people
                    .filter((p) =>
                      p.label.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((p) => {
                      const link = links.find((l) => l.id === p.id);
                      return (
                        <button
                          type="button"
                          key={p.id}
                          aria-pressed={recipient === p.id}
                          className={`recipient-option ${recipient === p.id ? "selected" : ""}`}
                          onClick={() => setRecipient(p.id)}
                        >
                          <strong>{p.label}</strong>
                          <small>
                            {link
                              ? link.dmOptIn
                                ? "Discord linked · DMs enabled"
                                : "Discord linked · channel only"
                              : "Site request · Discord not linked"}
                          </small>
                        </button>
                      );
                    })}
                </div>
                <small>
                  Only approved guild members appear. Pending members need
                  approval in Members & access.
                </small>
              </fieldset>
            )}
            <Field label="Delivery instructions (optional)">
              <textarea
                name="notes"
                maxLength={1000}
                rows={2}
                placeholder="Where to send the items, or which raid needs them"
              />
            </Field>
            {error && (
              <p role="alert" className="notice danger">
                {error}
              </p>
            )}
            <div className="form-actions">
              <span className="muted">
                {recipient
                  ? "Shared with the recipient and members with supply access."
                  : "Visible in the guild’s volunteer lobby."}
              </span>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Create request"}
              </button>
            </div>
          </Form>
        </Modal>
      )}
      {current && (
        <Modal
          title={`Delivery · ${current.item}`}
          onClose={() => setEditing("")}
        >
          <Form
            onSubmit={(f) =>
              void perform({
                type: "material.progress",
                requestId: current.id,
                quantity: Number(f.get("quantity")),
                note: String(f.get("note") || ""),
              })
            }
          >
            <Field label={`Total delivered so far (of ${current.quantity})`}>
              <input
                name="quantity"
                type="number"
                required
                min={0}
                max={current.quantity}
                defaultValue={current.fulfilled}
              />
            </Field>
            <Field label="Delivery note">
              <input
                name="note"
                maxLength={500}
                placeholder="Sent to guild bank"
              />
            </Field>
            <p className="muted">
              Enter the running total. Matching the requested quantity completes
              this request.
            </p>
            {error && (
              <p className="notice danger" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button className="btn primary" disabled={busy}>
                Save delivery
              </button>
            </div>
          </Form>
        </Modal>
      )}
    </div>
  );
}
