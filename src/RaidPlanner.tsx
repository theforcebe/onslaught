import { calendarFile, download } from "./lib/calendar";
import { Availability } from "./Availability";
import type { Identity } from "./lib/model";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  Check,
  CircleDashed,
  GripVertical,
  LockKeyhole,
  Network,
  Plus,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { ClassIcon, Player, RoleIcon, Modal } from "./components";
import { Dropdown } from "./Dropdown";
import type { DialogState } from "./dialogs";
import type { Access } from "./lib/access";
import { hasSection, hasTeam } from "./lib/access";
import { CLASS_COLORS, label } from "./lib/model";
import type {
  Character,
  RaidAction,
  RaidEvent,
  RaidState,
  Team,
} from "./lib/model";
import {
  activeLineup,
  confirmedRaiders,
  providersFor,
  RAID_BUFFS,
} from "./lib/raid";

function BuffMap({
  confirmed,
  size,
  event,
  selected,
  onSelect,
  onReveal,
}: {
  confirmed: Character[];
  size: number;
  event: RaidEvent;
  selected: string;
  onSelect: (id: string) => void;
  onReveal: (id: string) => void;
}) {
  const [utility, setUtility] = useState(false);
  const slotted = activeLineup(confirmed, event, size);
  const buffs = RAID_BUFFS.filter((b) => utility || b.kind === "buff");
  const available = buffs.filter(
    (b) => providersFor(b.id, slotted).length,
  ).length;
  const buff = RAID_BUFFS.find((b) => b.id === selected);
  const providers = buff ? providersFor(buff.id, confirmed) : [];
  return (
    <section className="buff-map panel" aria-label="Raid buff coverage">
      <div className="buff-map-heading">
        <div>
          <span className="eyebrow">
            <Network size={15} /> RAID SYNERGY
          </span>
          <h3>Buff coverage</h3>
          <p>Declared abilities from raiders placed in this lineup.</p>
        </div>
        <div className="coverage-total">
          <strong>
            {available}
            <span>/{buffs.length}</span>
          </strong>
          <small>covered in active groups</small>
        </div>
      </div>
      <div className="buff-map-toolbar">
        <span>
          <i className="coverage-dot available" /> In lineup{" "}
          <i className="coverage-dot bench" /> Not covered · bench{" "}
          <i className="coverage-dot" /> Missing
        </span>
        <label>
          <input
            type="checkbox"
            checked={utility}
            onChange={(e) => setUtility(e.target.checked)}
          />{" "}
          Include utility & debuffs
        </label>
      </div>
      <div className="buff-matrix">
        {buffs.map((b) => {
          const present = providersFor(b.id, slotted),
            waiting = providersFor(b.id, confirmed).filter(
              (c) => !slotted.some((p) => p.id === c.id),
            );
          const status = present.length
            ? "available"
            : waiting.length
              ? "bench"
              : "missing";
          return (
            <button
              type="button"
              key={b.id}
              aria-pressed={selected === b.id}
              className={`buff-cell ${status} ${selected === b.id ? "selected" : ""}`}
              onClick={() => onSelect(selected === b.id ? "" : b.id)}
            >
              <ClassIcon cls={b.cls} size={27} />
              <span>
                <strong>{b.benefit}</strong>
                <small>{b.name}</small>
              </span>
              <span
                className="buff-count"
                aria-label={
                  present.length
                    ? `${present.length} providers in lineup`
                    : waiting.length
                      ? `${waiting.length} providers on bench`
                      : "No declared provider"
                }
              >
                {present.length ? (
                  <>
                    <Check size={13} />
                    {present.length}
                  </>
                ) : waiting.length ? (
                  <>
                    <Users size={13} />
                    {waiting.length}
                  </>
                ) : (
                  <CircleDashed size={17} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      {buff ? (
        <div
          className="buff-detail"
          role="region"
          aria-label={`${buff.name} providers`}
        >
          <div>
            <h4>{buff.name}</h4>
            <p>{buff.note}</p>
          </div>
          <div className="provider-paths">
            {providers.length ? (
              providers.map((c) => (
                <div key={c.id} className="provider-path">
                  <button
                    className="provider-name"
                    style={{ color: CLASS_COLORS[c.class] }}
                    onClick={() => onReveal(c.id)}
                    aria-label={`Find ${c.name} in the lineup`}
                  >
                    {c.name}
                  </button>
                  <span className="path-line" />
                  <strong>
                    {slotted.some((p) => p.id === c.id)
                      ? `Group ${event.lineup?.[c.id]}`
                      : "Not covered · on bench"}
                  </strong>
                </div>
              ))
            ) : (
              <p>
                No confirmed raider has declared this ability. Update their raid
                profile if they can provide it.
              </p>
            )}
          </div>
          <button
            className="icon-btn"
            aria-label="Clear buff highlight"
            onClick={() => onSelect("")}
          >
            <X size={17} />
          </button>
        </div>
      ) : (
        <p className="buff-map-hint">
          Select an ability to trace its providers into the groups below.
        </p>
      )}
      <details className="coverage-notes">
        <summary>How coverage is counted</summary>
        <p>
          This is planned availability, not live aura uptime or a stacking
          score. A class or specialization alone never marks a buff available.
          Talents, learned spells, forms, totem range and recipient assignments
          still matter. Windfury and Flametongue Totem benefits are
          alternatives; Paladin blessings need recipient coordination. The
          catalog tracks core buffs and selected utility, not every situational
          ability.
        </p>
        <a
          href="https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696"
          target="_blank"
          rel="noreferrer"
        >
          Forever class rules · reviewed November 11, 2026
        </a>
      </details>
    </section>
  );
}

function EventBoard({
  state,
  team,
  event,
  admin,
  change,
  open,
}: {
  state: RaidState;
  team: Team;
  event: RaidEvent;
  admin: boolean;
  change: (a: RaidAction) => Promise<void>;
  open: (d: DialogState) => void;
}) {
  const [selected, setSelected] = useState("");
  const [dragging, setDragging] = useState("");
  const [over, setOver] = useState<number | null | undefined>();
  const [buff, setBuff] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const pointer = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<{ x: number; y: number }>();
  const [message, setMessage] = useState("");
  const confirmed = confirmedRaiders(state.characters, event);
  const lineup = event.lineup || {};
  const placed = activeLineup(state.characters, event, team.size);
  const bench = confirmed.filter((c) => !placed.some((p) => p.id === c.id));
  const selectedCharacter = confirmed.find((c) => c.id === selected);
  const highlighted = new Set(providersFor(buff, confirmed).map((c) => c.id));
  const active = selectedCharacter?.id || dragging;
  const run = async (action: RaidAction) => {
    if (!admin || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("Saving raid lineup…");
    try {
      await change(action);
      setSelected("");
      setMessage(
        "Lineup request finished. Check the save notification for the result.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
      setDragging("");
      setOver(undefined);
    }
  };
  const move = (id: string, group: number | null, swapWith?: string) => {
    if (!id || id === swapWith) return;
    void run({
      type: "event.assign",
      eventId: event.id,
      characterId: id,
      group,
      ...(swapWith ? { swapWith } : {}),
    });
  };
  const destination = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-raid-drop]");
  useEffect(() => {
    if (!ghost || !dragging) return;
    let frame = 0;
    const scroll = () => {
      const edge = 85;
      const distance =
        ghost.y < edge
          ? -Math.ceil((edge - ghost.y) / 5)
          : ghost.y > window.innerHeight - edge
            ? Math.ceil((ghost.y - window.innerHeight + edge) / 5)
            : 0;
      if (distance) {
        window.scrollBy(0, Math.max(-18, Math.min(18, distance)));
        const target = destination(ghost.x, ghost.y);
        setOver(target ? Number(target.dataset.raidDrop) || null : undefined);
      }
      frame = requestAnimationFrame(scroll);
    };
    const cancel = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      pointer.current = null;
      suppressClick.current = true;
      setDragging("");
      setGhost(undefined);
      setOver(undefined);
    };
    frame = requestAnimationFrame(scroll);
    window.addEventListener("keydown", cancel);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", cancel);
    };
  }, [ghost, dragging]);
  const pointerMove = (e: PointerEvent) => {
    const p = pointer.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 7) return;
    p.moved = true;
    e.preventDefault();
    setDragging(p.id);
    setSelected("");
    setGhost({ x: e.clientX, y: e.clientY });
    const target = destination(e.clientX, e.clientY);
    setOver(target ? Number(target.dataset.raidDrop) || null : undefined);
  };
  const pointerUp = (e: PointerEvent) => {
    const p = pointer.current;
    pointer.current = null;
    if (p?.moved) {
      suppressClick.current = true;
      e.preventDefault();
      const target = destination(e.clientX, e.clientY);
      if (target)
        move(
          p.id,
          Number(target.dataset.raidDrop) || null,
          target.dataset.swapId,
        );
    }
    setDragging("");
    setGhost(undefined);
    setOver(undefined);
  };
  const card = (c: Character) => (
    <div
      key={c.id}
      id={`raid-person-${c.id}`}
      className={`raid-person ${selected === c.id ? "picked" : ""} ${highlighted.has(c.id) ? "provider-highlight" : ""} ${dragging === c.id ? "dragging" : ""}`}
      data-raid-drop={lineup[c.id] || 0}
      data-swap-id={lineup[c.id] ? c.id : undefined}
      onDragStart={(e) => e.preventDefault()}
    >
      {admin && (
        <button
          type="button"
          className="drag-grip"
          disabled={busy}
          aria-label={`Drag ${c.name}`}
          onPointerDown={(e) => {
            if (e.button !== 0 || busy) return;
            suppressClick.current = false;
            pointer.current = {
              id: c.id,
              x: e.clientX,
              y: e.clientY,
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={() => {
            pointer.current = null;
            setDragging("");
            setGhost(undefined);
            setOver(undefined);
          }}
          onClick={(e) => {
            if (suppressClick.current) {
              e.preventDefault();
              suppressClick.current = false;
            } else setSelected(selected === c.id ? "" : c.id);
          }}
        >
          <GripVertical size={15} />
        </button>
      )}
      <button
        type="button"
        className="raid-person-main"
        disabled={busy}
        aria-pressed={selected === c.id}
        aria-label={
          selected && selected !== c.id && lineup[c.id]
            ? `Swap ${selectedCharacter?.name} with ${c.name}`
            : `Select ${c.name}`
        }
        onClick={() => {
          if (!admin) {
            open({ type: "character", character: c });
            return;
          }
          if (selected && selected !== c.id && lineup[c.id])
            move(selected, lineup[c.id], c.id);
          else setSelected(selected === c.id ? "" : c.id);
        }}
      >
        <ClassIcon cls={c.class} size={33} />
        <span>
          <strong style={{ color: CLASS_COLORS[c.class] }}>{c.name}</strong>
          <small>
            {c.spec || "Choose spec"} · {label(c.role)}
          </small>
        </span>
        <RoleIcon role={c.role} />
      </button>
    </div>
  );
  const zones = (group: number | null) => ({ "data-raid-drop": group || 0 });
  const outside = state.characters.filter(
    (c) => event.signups[c.id] === "going" && c.teamId !== team.id,
  ).length;
  return (
    <>
      {ghost && (
        <div
          className="raid-drag-ghost"
          style={{ left: ghost.x + 14, top: ghost.y + 14 }}
          aria-hidden="true"
        >
          {confirmed.find((c) => c.id === dragging)?.name}
        </div>
      )}
      <BuffMap
        confirmed={confirmed}
        size={team.size}
        event={event}
        selected={buff}
        onSelect={setBuff}
        onReveal={(id) => {
          const el = document.getElementById(`raid-person-${id}`);
          el?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
            block: "center",
          });
          el?.querySelector<HTMLButtonElement>(".raid-person-main")?.focus({
            preventScroll: true,
          });
        }}
      />
      <div className="lineup-heading">
        <div>
          <span className="eyebrow">CONFIRMED LINEUP</span>
          <h2>{event.title}</h2>
          <p>
            {confirmed.length} going · {placed.length} placed · {bench.length}{" "}
            on bench
          </p>
        </div>
        <div className="button-row">
          {admin && (
            <button
              className="btn secondary"
              disabled={busy || !bench.length}
              onClick={() =>
                void run({ type: "event.fill", eventId: event.id })
              }
            >
              <Sparkles size={16} /> Fill open positions
            </button>
          )}
          <span className="lineup-capacity">
            {placed.length}
            <small>/{team.size}</small>
          </span>
        </div>
      </div>
      <div className="role-targets">
        {(["tank", "healer", "melee", "ranged"] as const).map((role) => {
          const n = placed.filter((c) => c.role === role).length,
            target =
              role === "tank"
                ? team.tanks
                : role === "healer"
                  ? team.healers
                  : undefined;
          return (
            <div className={role} key={role}>
              <RoleIcon role={role} size={19} />
              <span>{label(role)}</span>
              <strong>
                {n}
                {target !== undefined && <small>/{target}</small>}
              </strong>
              {target !== undefined && (
                <span className="muted">
                  {n < target ? `${target - n} needed` : "Target met"}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {admin ? (
        <div
          className={`move-instructions ${selectedCharacter ? "active" : ""}`}
        >
          <span>
            {selectedCharacter ? (
              <>
                <strong>{selectedCharacter.name}</strong> selected. Choose a
                group, or select a raider to swap.
              </>
            ) : (
              "Drag the grip beside a raider into a group. Drop onto a raider to swap. You can also click a raider, then choose a destination."
            )}
          </span>
          {selectedCharacter && (
            <div className="button-row">
              <button
                className="btn text"
                onClick={() =>
                  open({ type: "character", character: selectedCharacter })
                }
              >
                Edit profile
              </button>
              <button
                className="icon-btn"
                aria-label="Cancel move"
                onClick={() => setSelected("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="page-note">
          Your admin manages group positions. Select a buff above to inspect
          coverage.
        </p>
      )}
      <div className="raid-group-grid" aria-busy={busy}>
        {Array.from({ length: Math.ceil(team.size / 5) }, (_, i) => i + 1).map(
          (group) => {
            const people = placed.filter((c) => lineup[c.id] === group),
              cap = Math.min(5, team.size - (group - 1) * 5);
            return (
              <section
                className={`raid-group ${over === group && dragging ? "drop-target" : ""}`}
                key={group}
                aria-label={`Group ${group}`}
                {...zones(group)}
              >
                <header>
                  <h3>
                    <span>{String(group).padStart(2, "0")}</span> Group {group}
                  </h3>
                  <small>
                    {people.length}/{cap}
                  </small>
                </header>
                {people.map(card)}
                {people.length < cap && (
                  <div className="raid-empty-slot">
                    <Plus size={13} />
                    <span>{cap - people.length} open positions</span>
                  </div>
                )}
                {admin && (
                  <button
                    className="group-destination"
                    disabled={
                      !active ||
                      busy ||
                      people.length >= cap ||
                      lineup[active] === group
                    }
                    onClick={() => move(active, group)}
                  >
                    {active
                      ? `Move here · Group ${group}`
                      : `Select a raider to place`}
                  </button>
                )}
              </section>
            );
          },
        )}
      </div>
      <section
        className={`confirmed-bench panel ${over === null && dragging ? "drop-target" : ""}`}
        {...zones(null)}
      >
        <div className="panel-title">
          <h3>
            Confirmed bench <span className="badge">{bench.length}</span>
          </h3>
          {admin && (
            <button
              className="btn secondary"
              disabled={!active || busy || !lineup[active]}
              onClick={() => move(active, null)}
            >
              Move to bench
            </button>
          )}
        </div>
        <p className="muted">
          Going to this raid, waiting for a group. Tentative and absent members
          are excluded.
        </p>
        <div className="bench-grid">{bench.map(card)}</div>
        {!bench.length && (
          <p className="bench-empty">
            {confirmed.length
              ? "Every confirmed raider has a position."
              : "No confirmed team members yet. Set your availability above."}
          </p>
        )}
      </section>
      {!!outside && (
        <p className="notice">
          {outside} confirmed{" "}
          {outside === 1 ? "character belongs" : "characters belong"} outside
          this team. Add them to {team.name} using “Manage raiders” before
          placing them in its lineup.
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </>
  );
}

export function RaidPlanner({
  state,
  team: selectedTeam,
  selectTeam,
  access,
  change,
  open,
  identity,
  demo,
}: {
  state: RaidState;
  team?: Team;
  selectTeam: (id: string) => void;
  access: Access;
  change: (a: RaidAction) => Promise<void>;
  open: (d: DialogState) => void;
  identity?: Identity;
  demo?: boolean;
}) {
  const [selectedEvent, setSelectedEvent] = useState(""),
    [rosterOpen, setRosterOpen] = useState(false),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const publicTeams = [
    ...new Map(
      state.events.map((e) => [
        e.teamId,
        { id: e.teamId, name: e.publicTeamName || "Raid team" },
      ]),
    ).values(),
  ];
  const teams = state.teams.length ? state.teams : publicTeams;
  const [publicTeamId, setPublicTeamId] = useState("");
  const team =
    selectedTeam || teams.find((t) => t.id === publicTeamId) || teams[0];
  const events = state.events
    .filter((e) => e.teamId === team?.id)
    .sort((a, b) => a.start.localeCompare(b.start));
  const event =
    events.find((e) => e.id === selectedEvent) ||
    events.find((e) => Date.parse(e.end) > Date.now()) ||
    events.at(-1);
  const fullTeam = state.teams.find((t) => t.id === team?.id);
  const canPlan =
    hasSection(access, "planner") &&
    hasSection(access, "attendance") &&
    hasTeam(access, team?.id);
  const roster = state.characters.filter((c) => c.teamId === team?.id);
  return (
    <div className="raid-planner">
      <div className="toolbar">
        <div className="segmented">
          {teams.map((t) => (
            <button
              key={t.id}
              className={team?.id === t.id ? "active" : ""}
              onClick={() => {
                selectTeam(t.id);
                setPublicTeamId(t.id);
                setSelectedEvent("");
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
        {access.admin && (
          <div className="button-row">
            {fullTeam && (
              <>
                <button
                  className="btn primary"
                  onClick={() => {
                    setRosterOpen(true);
                    setError("");
                  }}
                >
                  <Users size={16} />
                  Manage raiders <span className="badge">{roster.length}</span>
                </button>
                <button
                  className="icon-btn"
                  aria-label="Configure raid team"
                  onClick={() => open({ type: "team", team: fullTeam })}
                >
                  <Settings size={17} />
                </button>
              </>
            )}
            <button className="btn text" onClick={() => open({ type: "team" })}>
              <Plus size={15} />
              New team
            </button>
          </div>
        )}
      </div>
      <div className="planner-event-picker">
        <div>
          {event ? (
            <Dropdown
              label="Raid night"
              value={event.id}
              onChange={setSelectedEvent}
              options={events.map((e) => ({
                value: e.id,
                label: e.title,
                detail: new Date(e.start).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              }))}
            />
          ) : (
            <p className="muted">No raids scheduled yet.</p>
          )}
        </div>
        {access.admin && fullTeam && (
          <div className="button-row">
            {event && (
              <>
                <button
                  className="btn text"
                  onClick={() => open({ type: "signup", event })}
                >
                  Record RSVP
                </button>
                <button
                  className="btn text"
                  onClick={() => open({ type: "event", event, team: fullTeam })}
                >
                  Edit raid
                </button>
              </>
            )}
            <button
              className="btn secondary"
              onClick={() => open({ type: "event", team: fullTeam })}
            >
              <Plus size={15} />
              Schedule raid
            </button>
          </div>
        )}
      </div>
      {event && (
        <div className="raid-time-summary">
          <span>
            {event.instance} ·{" "}
            {new Date(event.start).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}{" "}
            ·{" "}
            {new Date(event.start).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
            –
            {new Date(event.end).toLocaleString(undefined, {
              ...(new Date(event.end).toDateString() !==
              new Date(event.start).toDateString()
                ? { month: "short" as const, day: "numeric" as const }
                : {}),
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </span>
          <button
            className="btn text"
            onClick={() =>
              download(
                event.title + ".ics",
                calendarFile(event),
                "text/calendar",
              )
            }
          >
            Add to calendar
          </button>
        </div>
      )}
      {event && (
        <Availability
          state={state}
          event={event}
          identity={identity}
          access={access}
          demo={demo}
          change={change}
          setup={() => open({ type: "import" })}
        />
      )}
      {event && fullTeam && canPlan ? (
        <EventBoard
          key={event.id}
          state={state}
          team={fullTeam}
          event={event}
          admin={access.admin}
          change={change}
          open={open}
        />
      ) : (
        <div className="panel planner-private">
          <SwordsIcon />
          <div>
            <h3>
              {event
                ? "Your response helps the raid take shape"
                : "The next raid starts here"}
            </h3>
            <p className="muted">
              {event
                ? "Group lineups and private attendance are shown when your admin grants access. Your personal availability can be updated above."
                : access.admin
                  ? "Create a team and schedule a raid. Members can then respond and join the lineup."
                  : "Scheduled raids will appear here. Check back for the next guild raid."}
            </p>
          </div>
        </div>
      )}
      {rosterOpen && fullTeam && (
        <Modal
          title={"Raiders · " + fullTeam.name}
          onClose={() => setRosterOpen(false)}
        >
          <p className="muted">
            Add characters to the team, then confirm attendance to place them in
            a raid lineup.
          </p>
          <input
            aria-label="Find a raider"
            placeholder="Search name, class or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {error && (
            <p role="alert" className="notice danger">
              {error}
            </p>
          )}
          <div className="roster-picker">
            {state.characters
              .filter((c) =>
                (c.name + " " + c.class + " " + c.role)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <div key={c.id}>
                  <Player character={c} />
                  {c.teamId === fullTeam.id ? (
                    <button
                      className="btn text"
                      onClick={() => {
                        setRosterOpen(false);
                        open({ type: "assign", character: c, team: fullTeam });
                      }}
                    >
                      On team · adjust
                    </button>
                  ) : (
                    <button
                      className="btn secondary"
                      disabled={busy || roster.length >= fullTeam.size}
                      onClick={async () => {
                        const group = Array.from(
                          { length: Math.ceil(fullTeam.size / 5) },
                          (_, i) => i + 1,
                        ).find(
                          (g) =>
                            roster.filter((c) => c.group === g).length <
                            Math.min(5, fullTeam.size - (g - 1) * 5),
                        );
                        if (!group) return;
                        setBusy(true);
                        try {
                          await change({
                            type: "team.assign",
                            characterId: c.id,
                            teamId: fullTeam.id,
                            group,
                          });
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Plus size={14} />
                      Add to team
                    </button>
                  )}
                </div>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
function SwordsIcon() {
  return <Users size={30} />;
}
