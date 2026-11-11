import { useState } from "react";
import {
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Trash2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Modal, Field, Form, ClassIcon, Player, GearItem } from "./components";
import { CLASSES, SLOTS, label, makeId } from "./lib/model";
import type {
  Character,
  Team,
  Loot,
  RaidEvent,
  Supply,
  Boss,
  ChangeRequest,
  RaidState,
  RaidAction,
} from "./lib/model";
import { numericStats } from "./lib/parser";
import { CharacterImport, CharacterProfileEditor } from "./CharacterSetup";
import { getItem, itemLink } from "./lib/items";
import { REPO_URL } from "./lib/api";
import type { Member } from "./lib/access";
import { download } from "./lib/calendar";
export type DialogState = {
  type: string;
  character?: Character;
  team?: Team;
  loot?: Loot;
  event?: RaidEvent;
  supply?: Supply;
  boss?: Boss;
  request?: ChangeRequest;
};
type Props = {
  dialog: DialogState;
  state: RaidState;
  close: () => void;
  change: (action: RaidAction) => void | Promise<void>;
  open: (d: DialogState) => void;
  toast: (s: string) => void;
  demo: boolean;
  admin: boolean;
  members: Member[];
  message?: string;
};
const val = (d: FormData, k: string) => String(d.get(k) || "");
const num = (d: FormData, k: string) => Number(d.get(k));
function Actions({
  label: caption = "Save change",
  admin = false,
}: {
  label?: string;
  admin?: boolean;
}) {
  return (
    <div className="form-actions">
      {admin && (
        <span className="muted">
          <ShieldCheck size={14} /> Admin permission required
        </span>
      )}
      <button className="btn primary" type="submit">
        {caption}
      </button>
    </div>
  );
}
function CharacterChoice({
  state,
  value,
}: {
  state: RaidState;
  value?: string;
}) {
  return (
    <Field label="Character">
      <select
        name="characterId"
        defaultValue={value || state.characters[0]?.id}
        required
      >
        {state.characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {label(c.class)}
          </option>
        ))}
      </select>
    </Field>
  );
}
export default function Dialogs(p: Props) {
  const { dialog: d, state, close, change, open, toast, demo } = p;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [lookedUp, setLookedUp] = useState<{ id: number; name: string }>(
      undefined!,
    );
  const fail = (e: unknown) =>
    setError(e instanceof Error ? e.message : "Something went wrong.");
  const submit = (action: RaidAction) => {
    try {
      change(action);
    } catch (e) {
      fail(e);
    }
  };
  let title = "",
    content;
  if (d.type === "import") {
    title = "Set up your raid character";
    content = (
      <CharacterImport
        state={state}
        character={d.character}
        change={change}
        demo={demo}
      />
    );
  }
  if (d.type === "character" && d.character) {
    const c =
      state.characters.find((x) => x.id === d.character!.id) || d.character;
    title = c.name;
    const stats = numericStats(c.snapshot?.stats.character_stats);
    content = (
      <>
        <div className="character-banner">
          <ClassIcon cls={c.class} size={64} />
          <div>
            <h3 style={{ color: `var(--${c.class})` }}>
              Level {c.level} {label(c.class)}
            </h3>
            <p>
              {c.spec || "Specialization not selected"} · {label(c.role)}
            </p>
            <small>{c.snapshot?.server || "No import yet"}</small>
          </div>
          <button
            className="btn secondary"
            onClick={() => open({ type: "import", character: c })}
          >
            Update gear
          </button>
        </div>
        {c.snapshot ? (
          <>
            <div className="mini-stats">
              {["health", "agility", "stamina", "intellect"]
                .filter((k) => stats[k] != null)
                .map((k) => (
                  <div key={k}>
                    <strong>{stats[k]}</strong>
                    <span>{label(k)}</span>
                  </div>
                ))}
            </div>
            <div className="section-heading">
              <h3>Equipped gear</h3>
              <span className="muted">
                Exported {c.snapshot.metadata.exportedAt || "date unknown"}
              </span>
            </div>
            <div className="gear-grid">
              {c.snapshot.gear.map((g) => (
                <GearItem key={g.slot} gear={g} />
              ))}
            </div>
            <details className="details">
              <summary>Bag alternatives ({c.snapshot.bagGear.length})</summary>
              <div className="gear-grid">
                {c.snapshot.bagGear.map((g, i) => (
                  <GearItem key={i} gear={g} />
                ))}
              </div>
            </details>
            {c.snapshot.pet.pet_family && (
              <div className="pet-panel">
                <span>Companion</span>
                <strong>
                  {label(c.snapshot.pet.pet_family)} · Level{" "}
                  {c.snapshot.pet.pet_level}
                </strong>
                <small>
                  Abilities:{" "}
                  {c.snapshot.pet.pet_abilities?.split("/").join(", ")}
                </small>
              </div>
            )}
            <details className="details">
              <summary>Talents, professions & original export</summary>
              <p>{c.snapshot.professions.replaceAll("/", " · ")}</p>
              <p className="break">
                Talents: {c.snapshot.talents || "Not supplied"}
              </p>
              <button
                className="btn secondary"
                onClick={() =>
                  download(`${c.name}.simc`, c.snapshot!.raw, "text/plain")
                }
              >
                Download original export
              </button>
            </details>
          </>
        ) : (
          <p className="notice">
            No character snapshot yet. Import a SimC export to see equipment.
          </p>
        )}
        <details className="details">
          <summary>Edit raid profile</summary>
          <CharacterProfileEditor key={c.id} character={c} change={change} />
        </details>
        {p.admin && (
          <details className="details">
            <summary>Admin: assign Battle.net ownership</summary>
            <Form
              onSubmit={(f) =>
                submit({
                  type: "character.member",
                  characterId: c.id,
                  memberId: val(f, "memberId"),
                })
              }
            >
              <Field label="Approved member">
                <select
                  name="memberId"
                  defaultValue={c.ownerBattleNet || ""}
                  required
                >
                  <option value="" disabled>
                    Choose a member
                  </option>
                  {p.members
                    .filter((m) => m.status === "active")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </Field>
              <Actions admin />
            </Form>
          </details>
        )}
      </>
    );
  }
  if (d.type === "team") {
    title = d.team ? "Configure raid team" : "Create a raid team";
    content = (
      <Form
        onSubmit={(f) =>
          submit({
            type: "team.save",
            team: {
              id: d.team?.id || makeId(),
              name: val(f, "name"),
              size: num(f, "size"),
              tanks: num(f, "tanks"),
              healers: num(f, "healers"),
              description: val(f, "description"),
            },
          })
        }
      >
        <Field label="Team name">
          <input
            name="name"
            defaultValue={d.team?.name}
            required
            maxLength={80}
          />
        </Field>
        <div className="form-grid three">
          <Field label="Raid size">
            <input
              name="size"
              type="number"
              min={5}
              max={40}
              defaultValue={d.team?.size || 20}
              required
            />
          </Field>
          <Field label="Tank target">
            <input
              name="tanks"
              type="number"
              min={0}
              max={10}
              defaultValue={d.team?.tanks ?? 2}
              required
            />
          </Field>
          <Field label="Healer target">
            <input
              name="healers"
              type="number"
              min={0}
              max={20}
              defaultValue={d.team?.healers ?? 4}
              required
            />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            name="description"
            defaultValue={d.team?.description}
            maxLength={300}
          />
        </Field>
        <Actions admin />
      </Form>
    );
  }
  if (d.type === "assign") {
    title = "Assign a raid position";
    content = (
      <Form
        onSubmit={(f) =>
          submit(
            val(f, "teamId")
              ? {
                  type: "team.assign",
                  characterId: val(f, "characterId"),
                  teamId: val(f, "teamId"),
                  group: num(f, "group"),
                }
              : { type: "team.unassign", characterId: val(f, "characterId") },
          )
        }
      >
        <CharacterChoice state={state} value={d.character?.id} />
        <Field label="Team">
          <select name="teamId" defaultValue={d.team?.id || state.teams[0]?.id}>
            <option value="">Bench / no team</option>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Group">
          <input
            name="group"
            type="number"
            min={1}
            max={8}
            defaultValue={d.character?.group || 1}
            required
          />
        </Field>
        <p className="muted">
          Each group has five slots. Team capacity is checked when saving.
        </p>
        <Actions admin />
      </Form>
    );
  }
  if (d.type === "event") {
    title = d.event ? "Edit raid" : "Schedule a raid";
    const local = (s?: string) => {
      if (!s) return "";
      const t = new Date(s);
      return new Date(t.getTime() - t.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    };
    content = (
      <Form
        onSubmit={(f) => {
          try {
            submit({
              type: "event.save",
              event: {
                id: d.event?.id || makeId(),
                title: val(f, "title"),
                instance: val(f, "instance"),
                teamId: val(f, "teamId"),
                start: new Date(val(f, "start")).toISOString(),
                end: new Date(val(f, "end")).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                notes: val(f, "notes"),
                signups: d.event?.signups || {},
              },
            });
          } catch (e) {
            fail(e);
          }
        }}
      >
        <Field label="Raid title">
          <input
            name="title"
            defaultValue={d.event?.title}
            placeholder="Friday guild raid"
            required
            maxLength={100}
          />
        </Field>
        <div className="form-grid">
          <Field label="Instance / destination">
            <input
              name="instance"
              defaultValue={d.event?.instance}
              required
              maxLength={100}
            />
          </Field>
          <Field label="Team">
            <select
              name="teamId"
              defaultValue={d.event?.teamId || d.team?.id || state.teams[0]?.id}
            >
              {state.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Starts">
            <input
              name="start"
              type="datetime-local"
              defaultValue={local(d.event?.start)}
              required
            />
          </Field>
          <Field label="Ends">
            <input
              name="end"
              type="datetime-local"
              defaultValue={local(d.event?.end)}
              required
            />
          </Field>
        </div>
        <p className="muted">
          Enter times in your device’s time zone:{" "}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}. Everyone will see
          the same instant in their chosen time zone.
        </p>
        <Field label="Raid notes">
          <textarea
            name="notes"
            defaultValue={d.event?.notes}
            placeholder="Meeting point, preparation, assignments…"
            maxLength={2000}
          />
        </Field>
        <Actions admin />
      </Form>
    );
  }
  if (d.type === "signup" && d.event) {
    title = `RSVP · ${d.event.title}`;
    content = (
      <Form
        onSubmit={(f) =>
          submit({
            type: "event.signup",
            eventId: d.event!.id,
            characterId: val(f, "characterId"),
            status: val(f, "status") as "going",
          })
        }
      >
        <CharacterChoice state={state} />
        <Field label="Your availability">
          <select name="status">
            <option value="going">Going</option>
            <option value="tentative">Tentative</option>
            <option value="absent">Absent</option>
          </select>
        </Field>
        <p className="muted">
          You can RSVP for characters you own. Admins can correct attendance.
        </p>
        <Actions />
      </Form>
    );
  }
  if (d.type === "supply") {
    title = d.supply ? "Edit consumable target" : "Add a preparation target";
    content = (
      <Form
        onSubmit={(f) =>
          submit({
            type: "supply.save",
            supply: {
              id: d.supply?.id || makeId(),
              name: val(f, "name"),
              needed: num(f, "needed"),
              ...(num(f, "itemId") ? { itemId: num(f, "itemId") } : {}),
              ...(val(f, "eventId") ? { eventId: val(f, "eventId") } : {}),
              notes: val(f, "notes"),
              pledges: d.supply?.pledges || {},
            },
          })
        }
      >
        <Field label="Consumable / material">
          <input
            name="name"
            defaultValue={d.supply?.name}
            required
            maxLength={100}
          />
        </Field>
        <div className="form-grid">
          <Field label="Quantity needed">
            <input
              name="needed"
              type="number"
              min={1}
              max={100000}
              defaultValue={d.supply?.needed || 40}
              required
            />
          </Field>
          <Field label="Item ID (optional)">
            <input
              name="itemId"
              type="number"
              min={1}
              defaultValue={d.supply?.itemId}
            />
          </Field>
        </div>
        <Field label="For which raid?">
          <select name="eventId" defaultValue={d.supply?.eventId || ""}>
            <option value="">Guild stock</option>
            {state.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <textarea
            name="notes"
            defaultValue={d.supply?.notes}
            maxLength={300}
          />
        </Field>
        <Actions admin />
      </Form>
    );
  }
  if (d.type === "pledge" && d.supply) {
    title = `Contribute · ${d.supply.name}`;
    content = (
      <Form
        onSubmit={(f) =>
          submit({
            type: "supply.pledge",
            supplyId: d.supply!.id,
            characterId: val(f, "characterId"),
            quantity: num(f, "quantity"),
          })
        }
      >
        <CharacterChoice state={state} />
        <Field
          label="Your total committed quantity"
          hint="This replaces your previous commitment. Enter 0 to withdraw."
        >
          <input
            name="quantity"
            type="number"
            min={0}
            max={100000}
            defaultValue={d.supply.pledges[state.characters[0]?.id] || 0}
            required
          />
        </Field>
        <Actions />
      </Form>
    );
  }
  if (d.type === "loot") {
    title = d.loot ? "Edit loot plan" : "Add an item to the loot plan";
    content = (
      <Form
        onSubmit={(f) =>
          submit({
            type: "loot.save",
            loot: {
              id: d.loot?.id || makeId(),
              teamId: val(f, "teamId") || undefined,
              itemId: num(f, "itemId"),
              name: val(f, "name"),
              slot: val(f, "slot") as Loot["slot"],
              boss: val(f, "boss"),
              source: val(f, "source"),
              eligible: f.getAll("eligible") as Loot["eligible"],
              priority: d.loot?.priority || [],
              requests: d.loot?.requests || {},
            },
          })
        }
      >
        <Field
          label="Visibility scope"
          hint="Guild-wide records are visible to everyone with this section. Team records require that team too."
        >
          <select name="teamId" defaultValue={d.loot?.teamId || ""}>
            <option value="">Guild-wide</option>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Forever item ID">
            <input
              name="itemId"
              type="number"
              min={1}
              required
              defaultValue={d.loot?.itemId}
              onBlur={async (e) => {
                const id = Number(e.target.value);
                if (id > 0) {
                  setBusy(true);
                  const r = await getItem(id);
                  setBusy(false);
                  if (r.item) setLookedUp({ id, name: r.item.name });
                  else
                    setError(
                      "Item data is unavailable. Enter the verified name and source manually.",
                    );
                }
              }}
            />
          </Field>
          <Field label="Equipment slot">
            <select name="slot" defaultValue={d.loot?.slot || "head"}>
              {SLOTS.filter(
                (s) => !["ammo", "shirt", "tabard"].includes(s),
              ).map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {busy && <p className="muted">Looking up the Forever item…</p>}
        <Field label="Item name">
          <input
            key={lookedUp?.id}
            name="name"
            defaultValue={d.loot?.name || lookedUp?.name}
            required
            maxLength={200}
          />
        </Field>
        <Field label="Boss / source">
          <input
            name="boss"
            defaultValue={d.loot?.boss}
            placeholder="Verified boss or acquisition source"
            required
            maxLength={200}
          />
        </Field>
        <Field
          label="Evidence link"
          hint="Use a Forever-specific source. Classic loot tables may differ."
        >
          <input
            name="source"
            type="url"
            defaultValue={d.loot?.source || ""}
            maxLength={1000}
            placeholder="https://…"
          />
        </Field>
        <fieldset>
          <legend>
            Eligible classes <small>(none selected = any class)</small>
          </legend>
          <div className="class-checks">
            {CLASSES.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  name="eligible"
                  value={c}
                  defaultChecked={d.loot?.eligible.includes(c)}
                />
                <ClassIcon cls={c} size={24} />
                {label(c)}
              </label>
            ))}
          </div>
        </fieldset>
        <Actions admin />
      </Form>
    );
  }
  if (d.type === "loot-detail" && d.loot) {
    const l = state.loot.find((x) => x.id === d.loot!.id) || d.loot;
    title = l.name;
    content = (
      <>
        <div className="loot-detail-heading">
          <span className="badge">{label(l.slot)}</span>
          <span>#{l.itemId}</span>
          <a href={itemLink(l.itemId)} target="_blank" rel="noreferrer">
            TheWoWDB <ExternalLink size={13} />
          </a>
        </div>
        <p className="muted">{l.boss}</p>
        <p className="notice">
          Council order is deliberate. The export shows current gear; it does
          not contain simulated damage or verified upgrade percentages.
        </p>
        <h3>Council priority</h3>
        {l.priority.length ? (
          l.priority.map((id, i) => {
            const c = state.characters.find((c) => c.id === id);
            return (
              c && (
                <div className="priority-row" key={id}>
                  <span className="rank">{i + 1}</span>
                  <Player character={c} />
                  {!l.awardedTo && (
                    <>
                      <button
                        className="icon-btn"
                        disabled={!i}
                        aria-label={`Move ${c.name} up`}
                        onClick={() => {
                          const order = [...l.priority];
                          [order[i - 1], order[i]] = [order[i], order[i - 1]];
                          submit({
                            type: "loot.save",
                            loot: { ...l, priority: order },
                          });
                        }}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        disabled={i === l.priority.length - 1}
                        aria-label={`Move ${c.name} down`}
                        onClick={() => {
                          const order = [...l.priority];
                          [order[i + 1], order[i]] = [order[i], order[i + 1]];
                          submit({
                            type: "loot.save",
                            loot: { ...l, priority: order },
                          });
                        }}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Remove ${c.name} from priority`}
                        onClick={() =>
                          submit({
                            type: "loot.save",
                            loot: {
                              ...l,
                              priority: l.priority.filter((x) => x !== id),
                            },
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              )
            );
          })
        ) : (
          <p className="muted">The council has not set an order.</p>
        )}
        {!l.awardedTo && (
          <Form
            onSubmit={(f) =>
              submit({
                type: "loot.save",
                loot: {
                  ...l,
                  priority: [...l.priority, val(f, "characterId")],
                },
              })
            }
          >
            <div className="inline-form">
              <select name="characterId" required defaultValue="">
                <option value="" disabled>
                  Add eligible raider to priority…
                </option>
                {state.characters
                  .filter(
                    (c) =>
                      !l.priority.includes(c.id) &&
                      (!l.eligible.length || l.eligible.includes(c.class)),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <button className="btn secondary" type="submit">
                Add
              </button>
            </div>
          </Form>
        )}
        <h3 className="spaced">Requests & current equipment</h3>
        {Object.entries(l.requests).map(([id, request]) => {
          const c = state.characters.find((c) => c.id === id);
          const equipped = c?.snapshot?.gear.filter(
            (g) =>
              g.slot === l.slot ||
              (l.slot.startsWith("finger") && g.slot.startsWith("finger")) ||
              (l.slot.startsWith("trinket") && g.slot.startsWith("trinket")),
          );
          return (
            <div className="request-row" key={id}>
              <strong>{c?.name || "Unknown character"}</strong>
              <span
                className={`badge ${request.tier === "bis" ? "purple" : ""}`}
              >
                {label(request.tier)}
              </span>
              <p>{request.note || "No explanation provided."}</p>
              <small>
                Currently:{" "}
                {equipped?.length
                  ? equipped.map((g) => g.name).join(" / ")
                  : "No equipped item in the export"}
                {equipped?.some((g) => g.id === l.itemId) &&
                  " · Already owns this item"}
              </small>
            </div>
          );
        })}
        {!Object.keys(l.requests).length && (
          <p className="muted">No requests yet.</p>
        )}
        {l.awardedTo ? (
          <p className="notice success">
            Awarded to{" "}
            {state.characters.find((c) => c.id === l.awardedTo)?.name}:{" "}
            {l.awardReason}
          </p>
        ) : (
          <div className="form-actions">
            <button
              className="btn secondary"
              onClick={() => open({ type: "request", loot: l })}
            >
              Request this item
            </button>
            <button
              className="btn primary"
              onClick={() => open({ type: "award", loot: l })}
            >
              Record award
            </button>
          </div>
        )}
      </>
    );
  }
  if (d.type === "request" && d.loot) {
    title = `Request · ${d.loot.name}`;
    content = (
      <Form
        onSubmit={(f) =>
          submit({
            type: "loot.request",
            lootId: d.loot!.id,
            characterId: val(f, "characterId"),
            tier: val(f, "tier") as "bis",
            note: val(f, "note"),
          })
        }
      >
        <CharacterChoice state={state} />
        <Field label="Your priority">
          <select name="tier">
            <option value="bis">Best in slot (member assessment)</option>
            <option value="major">Major upgrade</option>
            <option value="minor">Minor upgrade</option>
            <option value="offspec">Off-spec</option>
          </select>
        </Field>
        <Field
          label="Why this item?"
          hint="Share the source or comparison behind your request."
        >
          <textarea name="note" maxLength={300} />
        </Field>
        <Actions />
      </Form>
    );
  }
  if (d.type === "award" && d.loot) {
    title = `Award · ${d.loot.name}`;
    content = (
      <Form
        onSubmit={(f) =>
          submit({
            type: "loot.award",
            lootId: d.loot!.id,
            characterId: val(f, "characterId"),
            reason: val(f, "reason"),
          })
        }
      >
        <CharacterChoice state={state} value={d.loot.priority[0]} />
        <Field label="Council rationale">
          <textarea
            name="reason"
            required
            minLength={3}
            maxLength={300}
            placeholder="Explain the decision for the guild’s history."
          />
        </Field>
        <p className="notice">
          Awards are recorded permanently. Add a new drop when this item drops
          again.
        </p>
        <Actions label="Review award" admin />
      </Form>
    );
  }
  if (d.type === "boss") {
    title = d.boss ? "Update encounter progress" : "Track an encounter";
    content = (
      <Form
        onSubmit={(f) =>
          submit({
            type: "boss.save",
            boss: {
              id: d.boss?.id || makeId(),
              teamId: val(f, "teamId") || undefined,
              name: val(f, "name"),
              instance: val(f, "instance"),
              status: val(f, "status") as Boss["status"],
              pulls: num(f, "pulls"),
              bestPercent: num(f, "bestPercent"),
              notes: val(f, "notes"),
            },
          })
        }
      >
        <Field
          label="Visibility scope"
          hint="Guild-wide records are visible to everyone with this section. Team records require that team too."
        >
          <select name="teamId" defaultValue={d.boss?.teamId || ""}>
            <option value="">Guild-wide</option>
            {state.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Boss">
            <input name="name" defaultValue={d.boss?.name} required />
          </Field>
          <Field label="Instance">
            <input name="instance" defaultValue={d.boss?.instance} required />
          </Field>
        </div>
        <div className="form-grid three">
          <Field label="Status">
            <select
              name="status"
              defaultValue={d.boss?.status || "not-started"}
            >
              <option value="not-started">Not started</option>
              <option value="progressing">Progressing</option>
              <option value="defeated">Defeated</option>
            </select>
          </Field>
          <Field label="Total pulls">
            <input
              type="number"
              name="pulls"
              min={0}
              max={100000}
              defaultValue={d.boss?.pulls || 0}
              required
            />
          </Field>
          <Field label="Best remaining HP %">
            <input
              type="number"
              name="bestPercent"
              min={0}
              max={100}
              step="0.1"
              defaultValue={d.boss?.bestPercent ?? 100}
              required
            />
          </Field>
        </div>
        <Field label="Strategy & assignments">
          <textarea
            name="notes"
            defaultValue={d.boss?.notes}
            rows={4}
            maxLength={2000}
          />
        </Field>
        <Actions admin />
      </Form>
    );
  }
  if (d.type === "auth") {
    title = "Battle.net connection";
    content = (
      <>
        <div className="auth-emblem">
          <ShieldCheck size={44} />
        </div>
        <h3>Account security comes first.</h3>
        <p>
          Battle.net sign-in runs through a separate, secure gateway. Its client
          secret never belongs in this site or its repository.
        </p>
        <p className="notice">
          The gateway has not been configured yet. Shared editing will activate
          after the guild owner completes setup. The public roster and calendar
          stay available, and the fictional demo works locally.
        </p>
        <a
          className="btn primary"
          href={`${REPO_URL}/blob/main/docs/DEPLOYMENT.md`}
          target="_blank"
          rel="noreferrer"
        >
          Open admin setup guide
          <ExternalLink size={15} />
        </a>
        <p className="muted spaced">
          No password or API token is requested by this interface. Do not paste
          credentials into chat, the roster, or an issue.
        </p>
      </>
    );
  }
  return (
    <Modal
      title={title}
      onClose={close}
      wide={["character", "import", "loot-detail"].includes(d.type)}
    >
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {p.message && (
        <p className="notice" role="status">
          {p.message}
        </p>
      )}
      {content}
    </Modal>
  );
}
