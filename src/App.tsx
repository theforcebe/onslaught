import { GuildBoard } from "./GuildBoard";
import { SetupGuide } from "./SetupGuide";
import { ItemTooltip } from "./ItemTooltip";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Swords,
  Gem,
  FlaskConical,
  CalendarDays,
  Flag,
  History,
  Settings,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Bell,
  ShieldCheck,
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  Circle,
  Menu,
  X,
  RefreshCw,
  Download,
  ExternalLink,
  Upload,
  Github,
  Flame,
  Target,
  Check,
  LogOut,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
} from "lucide-react";
import {
  ClassIcon,
  RoleIcon,
  Player,
  Empty,
  Meter,
  Field,
  Form,
} from "./components";
import Dialogs from "./dialogs";
import { AccessPanel } from "./AccessPanel";
import { Dropdown } from "./Dropdown";
import { RaidPlanner } from "./RaidPlanner";
const GuildHub = lazy(() =>
  import("./GuildHub").then((module) => ({ default: module.GuildHub })),
);
const GuildChat = lazy(() =>
  import("./GuildChat").then((m) => ({ default: m.GuildChat })),
);
import {
  PUBLIC_ACCESS,
  ADMIN_ACCESS,
  hasSection,
  hasTeam,
  canSeeCharacter,
  project,
} from "./lib/access";
import type { Access, GuildView, Member, Section } from "./lib/access";
import type { DialogState } from "./dialogs";
import {
  CLASS_COLORS,
  CLASSES,
  ROLES,
  StateSchema,
  label,
  makeId,
} from "./lib/model";
import type { RaidState, RaidAction, Identity, Character } from "./lib/model";
import { applyChange } from "./lib/reducer";
import { rejectCredentials } from "./lib/parser";
import { demoState } from "./lib/demo";
import {
  loadGuild,
  loginBattleNet,
  logout,
  saveShared,
  REPO_URL,
  API_URL,
  saveMember,
  requestMembership,
  sessionActive,
} from "./lib/api";
import { calendarFile, download } from "./lib/calendar";
const nav = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "planner", name: "Raid planner", icon: Swords },
  { id: "roster", name: "Roster & gear", icon: Users },
  { id: "community", name: "Guild coordination", icon: MessageSquare },
  { id: "activity", name: "Activity", icon: History },
  { id: "access", name: "Members & access", icon: ShieldCheck },
];
const titles: Record<string, [string, string]> = {
  community: [
    "Guild coordination",
    "Guild dispatches, material requests, and your Discord connection.",
  ],
  overview: ["War room", "The latest from the guild, all in one place."],
  planner: [
    "Raid planner",
    "Your raid nights, availability, groups, and preparation.",
  ],
  roster: [
    "Roster & gear",
    "Character snapshots, roles, professions, and the details that make a team.",
  ],
  loot: [
    "Every drop has a plan.",
    "Transparent priorities. Current equipment. Decisions the whole guild can follow.",
  ],
  consumables: [
    "Preparation is a team sport.",
    "Set the targets, share the load, and arrive ready to pull.",
  ],
  schedule: [
    "Make the next pull count.",
    "One schedule, clear availability, and raid times that travel with you.",
  ],
  progress: [
    "The story of your progression.",
    "Keep the attempts, breakthroughs, and lessons from every encounter.",
  ],
  activity: [
    "A history you can trust.",
    "Shared changes are attributed, validated, and versioned in the repository.",
  ],
  settings: [
    "Make this your war room.",
    "Guild identity, permissions, data, and connections.",
  ],
  access: [
    "The right access. For every member.",
    "Public roster and schedule. Private coordination, controlled by you.",
  ],
};
const safeURL = (url: string) => (/^https:\/\//i.test(url) ? url : undefined);
const demoPeople = [
  { id: "demo-admin", label: "Demo admin", allTeams: true, teamIds: [] },
  { id: "demo-ember", label: "Ember", allTeams: true, teamIds: [] },
  { id: "demo-nyx", label: "Nyx", allTeams: true, teamIds: [] },
];
export default function App() {
  const [access, setAccess] = useState<Access>(PUBLIC_ACCESS);
  const [members, setMembers] = useState<Member[]>([]);
  const [people, setPeople] = useState<NonNullable<GuildView["people"]>>([]);
  const [demoMembers, setDemoMembers] = useState<Member[]>([
    {
      id: "demo-member",
      label: "Example raider",
      role: "guild_member",
      status: "pending",
      sections: [],
      allTeams: false,
      teamIds: [],
    },
  ]);
  const accessSignature = useRef("");
  const [live, setLive] = useState<RaidState>(),
    [practice, setPractice] = useState<RaidState>(),
    [demo, setDemo] = useState(false),
    [page, setPage] = useState(
      ["schedule", "materials", "discord"].includes(location.hash.slice(1))
        ? location.hash === "#schedule"
          ? "planner"
          : "community"
        : location.hash.slice(1) || "overview",
    ),
    [hubTab, setHubTab] = useState(
      location.hash === "#discord"
        ? "connection"
        : location.hash === "#materials"
          ? "requests"
          : "",
    ),
    [dialog, setDialog] = useState<DialogState>(),
    [notification, setNotification] = useState(""),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false),
    [menu, setMenu] = useState(false),
    [identity, setIdentity] = useState<Identity>(),
    [filter, setFilter] = useState(""),
    [classFilter, setClassFilter] = useState("all"),
    [roleFilter, setRoleFilter] = useState("all"),
    [selectedTeam, setSelectedTeam] = useState("vanguard"),
    [timeZone, setTimeZone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [lootTab, setLootTab] = useState("active");
  const state = demo ? practice : live;
  const effectiveAccess = demo ? ADMIN_ACCESS : access;
  function acceptView(next: GuildView) {
    if (!sessionActive()) setIdentity(undefined);
    else if (next.identity) setIdentity(next.identity);
    const signature = JSON.stringify(next.access);
    if (accessSignature.current !== signature) setDialog(undefined);
    accessSignature.current = signature;
    setLive(next.state);
    setAccess(next.access);
    setMembers(next.members || []);
    setPeople(next.people || []);
  }
  function toast(s: string) {
    setNotification(s);
  }
  async function refresh() {
    setRefreshing(true);
    try {
      const next = await loadGuild();
      acceptView(next);
      setError(
        next.isCurrent
          ? ""
          : "Showing the saved public roster. Connect to the guild gateway for current member information.",
      );
    } catch (e) {
      if (!sessionActive()) setIdentity(undefined);
      setLive((prev) =>
        prev ? project({ version: 1, state: prev, members: [] }).state : prev,
      );
      setAccess(PUBLIC_ACCESS);
      setMembers([]);
      setPeople([]);
      setDialog(undefined);
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(""), 6000);
    return () => clearTimeout(t);
  }, [notification]);
  useEffect(() => {
    const handle = () => {
      const id = location.hash.slice(1) || "overview";
      setPage(
        id === "schedule"
          ? "planner"
          : ["materials", "discord"].includes(id)
            ? "community"
            : id,
      );
      setHubTab(
        id === "materials" ? "requests" : id === "discord" ? "connection" : "",
      );
      setFilter("");
    };
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  function go(id: string) {
    location.hash = id;
    setPage(
      id === "schedule"
        ? "planner"
        : ["materials", "discord"].includes(id)
          ? "community"
          : id,
    );
    setHubTab(
      id === "materials" ? "requests" : id === "discord" ? "connection" : "",
    );
    setMenu(false);
    setFilter("");
  }
  function toggleDemo() {
    if (!live) return;
    if (!demo && !practice) {
      let saved: RaidState | undefined;
      try {
        const raw = localStorage.getItem("onslaught:demo:v1");
        if (raw) saved = StateSchema.parse(JSON.parse(raw));
      } catch {
        /* Start clean if old local demo is incompatible. */
      }
      setPractice(saved || demoState(live));
    }
    setDemo(!demo);
    setDialog(undefined);
    toast(
      demo
        ? "Showing the shared guild repository."
        : "Demo enabled. All edits stay in this browser.",
    );
  }
  async function change(action: RaidAction, rethrow = false) {
    if (!state) return;
    try {
      rejectCredentials(action);
    } catch (e) {
      toast((e as Error).message);
      if (rethrow) throw e;
      return;
    }
    const request = {
      version: 1 as const,
      id: makeId(),
      expectedRevision: state.revision,
      action,
    };
    if (demo) {
      try {
        const next = applyChange(
          state,
          request,
          {
            provider: "battlenet",
            admin: true,
            id: "demo-admin",
            label: "Demo admin",
          },
          undefined,
          {
            recipientName:
              action.type === "material.create"
                ? demoPeople.find((p) => p.id === action.request.recipientId)
                    ?.label
                : undefined,
          },
        );
        localStorage.setItem("onslaught:demo:v1", JSON.stringify(next));
        setPractice(next);
        setDialog(undefined);
        toast("Saved in your demo workspace.");
      } catch (e) {
        toast((e as Error).message);
        if (rethrow) throw e;
      }
      return;
    }
    if (identity && API_URL) {
      try {
        const next = await saveShared(request);
        acceptView(next);
        setDialog(undefined);
        toast("Saved to the guild repository.");
      } catch (e) {
        toast((e as Error).message);
        if (rethrow) throw e;
      }
      return;
    }
    setDialog({ type: "auth" });
  }
  async function signIn() {
    if (!API_URL) {
      setDialog({ type: "auth" });
      return;
    }
    try {
      setIdentity(await loginBattleNet());
      await refresh();
      toast("Signed in with Battle.net.");
    } catch (e) {
      toast((e as Error).message);
    }
  }
  if (!state)
    return (
      <div className="loading-screen">
        <img src={`${import.meta.env.BASE_URL}crest.svg`} alt="" />
        <h1>Ønslaught</h1>
        <p>{error || "Opening the war room…"}</p>
        {error ? (
          <button className="btn primary" onClick={refresh}>
            Try again
          </button>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </div>
    );
  const team = state.teams.find((t) => t.id === selectedTeam) || state.teams[0];
  const teamMembers = state.characters.filter((c) => c.teamId === team?.id);
  const nextRaid = [...state.events]
    .filter((e) => Date.parse(e.end) > Date.now())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  const unassigned = state.characters.filter((c) => c.role === "unassigned");
  const imports = state.characters.filter((c) => c.snapshot);
  const pendingLoot = state.loot.filter((l) => !l.awardedTo);
  const pledged = state.supplies.reduce(
    (sum, s) =>
      sum +
      Math.min(
        s.needed,
        Object.values(s.pledges).reduce((a, b) => a + b, 0),
      ),
    0,
  );
  const needed = state.supplies.reduce((sum, s) => sum + s.needed, 0);
  const defeated = state.bosses.filter((b) => b.status === "defeated").length;
  const formatDate = (
    date: string,
    options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      weekday: "short",
    },
  ) =>
    new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(
      new Date(date),
    );
  const open = (d: DialogState) => {
    if (!demo) {
      const adminTypes = [
        "team",
        "assign",
        "event",
        "supply",
        "loot",
        "award",
        "boss",
      ];
      if (adminTypes.includes(d.type) && !access.admin) {
        toast("Only guild admins can change structure, targets, and awards.");
        return;
      }
      const privateTypes: Record<string, Section> = {
        import: "gear",
        character: "gear",
        "loot-detail": "loot",
        request: "loot",
        pledge: "consumables",
      };
      const section = privateTypes[d.type];
      if (
        section &&
        (!hasSection(access, section) ||
          (d.character && !canSeeCharacter(access, d.character, identity)) ||
          (d.event && !hasTeam(access, d.event.teamId)))
      ) {
        toast("This information requires member access. See Members & access.");
        return;
      }
    }
    setNotification("");
    setDialog(d);
  };
  const addButton = (type: string, text: string) =>
    (effectiveAccess.admin ||
      (type === "import" && hasSection(effectiveAccess, "gear"))) && (
      <button className="btn primary" onClick={() => open({ type })}>
        <Plus size={16} />
        {text}
      </button>
    );
  const planner = (
    <RaidPlanner
      state={state}
      team={team}
      selectTeam={setSelectedTeam}
      access={effectiveAccess}
      change={(a) => change(a, true)}
      open={open}
      identity={identity}
      demo={demo}
    />
  );
  const filtered = state.characters.filter(
    (c) =>
      `${c.name} ${c.spec} ${c.class}`
        .toLowerCase()
        .includes(filter.toLowerCase()) &&
      (classFilter === "all" || c.class === classFilter) &&
      (roleFilter === "all" || c.role === roleFilter),
  );
  const roster = (
    <>
      <div className="toolbar">
        <div className="filters">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search roster"
              placeholder="Find a raider…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <Dropdown
            label="Filter by class"
            value={classFilter}
            onChange={setClassFilter}
            icon={<Users size={16} />}
            options={[
              { value: "all", label: "All classes" },
              ...CLASSES.map((c) => ({
                value: c,
                label: label(c),
                icon: <ClassIcon cls={c} size={21} />,
              })),
            ]}
          />
          <Dropdown
            label="Filter by role"
            value={roleFilter}
            onChange={setRoleFilter}
            icon={<Swords size={16} />}
            options={[
              { value: "all", label: "All roles" },
              ...ROLES.map((r) => ({
                value: r,
                label: label(r),
                icon: <RoleIcon role={r} />,
              })),
            ]}
          />
        </div>
        {addButton("import", "Import character")}
      </div>
      <div className="roster-list">
        <div className="roster-head">
          <span>Character</span>
          <span>Raid role</span>
          <span>Team</span>
          <span>Gear snapshot</span>
          <span />
        </div>
        {filtered.map((c) => (
          <button
            className="roster-row"
            key={c.id}
            onClick={() => open({ type: "character", character: c })}
          >
            <span className="roster-player">
              <ClassIcon cls={c.class} size={42} />
              <span>
                <strong style={{ color: CLASS_COLORS[c.class] }}>
                  {c.name}
                </strong>
                <small>
                  Level {c.level} · {c.spec || label(c.class)}
                </small>
              </span>
            </span>
            <span className={`role-badge ${c.role}`}>
              <RoleIcon role={c.role} />
              {label(c.role)}
            </span>
            <span className="roster-team">
              {state.teams.find((t) => t.id === c.teamId)?.name ||
                c.publicTeamName ||
                "Not assigned"}
              <small>
                {c.group ? `Group ${c.group}` : c.teamId ? "Assigned" : "Bench"}
              </small>
            </span>
            <span className="snapshot-status">
              {!demo && !canSeeCharacter(access, c, identity) ? (
                <span className="muted">
                  <LockKeyhole size={13} /> Private gear
                </span>
              ) : c.snapshot ? (
                <>
                  <span className="dot green" />
                  {c.snapshot.gear.length} equipped
                  <small>
                    {c.snapshot.metadata.exportedAt || "Imported snapshot"}
                  </small>
                </>
              ) : (
                <>
                  <span className="dot amber" />
                  Awaiting import<small>Ask this raider for an export</small>
                </>
              )}
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
      {!filtered.length && (
        <Empty icon={<Search />} title="No matching raiders">
          Try another name or clear the class and role filters.
        </Empty>
      )}
      <p className="page-note">
        {filtered.length} of {state.characters.length} raiders · Open a
        character to inspect items, bag alternatives, professions and pet
        details.
      </p>
    </>
  );
  const loot = (
    <>
      <div className="toolbar">
        <div className="segmented">
          <button
            className={lootTab === "active" ? "active" : ""}
            onClick={() => setLootTab("active")}
          >
            Council plan <span>{pendingLoot.length}</span>
          </button>
          <button
            className={lootTab === "awarded" ? "active" : ""}
            onClick={() => setLootTab("awarded")}
          >
            Award history <span>{state.loot.length - pendingLoot.length}</span>
          </button>
        </div>
        {addButton("loot", "Plan an item")}
      </div>
      <div className="info-banner">
        <Gem size={21} />
        <div>
          <strong>Good loot decisions need context.</strong>
          <p>
            Compare requests with equipped gear. Council order is explicit;
            import data alone is not a simulation.
          </p>
        </div>
      </div>
      <div className="loot-list">
        {state.loot
          .filter((l) => (lootTab === "awarded" ? l.awardedTo : !l.awardedTo))
          .map((l) => (
            <article className="loot-card" key={l.id}>
              <div className="loot-card-top">
                <span className="loot-icon">
                  <Gem size={27} />
                </span>
                <div>
                  <h3>
                    <ItemTooltip
                      id={l.itemId}
                      name={l.name}
                      className="item-name"
                    />
                  </h3>
                  <p>{l.boss}</p>
                </div>
                <span className="badge">{label(l.slot)}</span>
              </div>
              <div className="loot-card-meta">
                <span>Item #{l.itemId}</span>
                <span>{Object.keys(l.requests).length} requests</span>
              </div>
              <div className="loot-priorities">
                {l.awardedTo ? (
                  <p className="success-text">
                    <CheckCircle2 size={15} />
                    Awarded to{" "}
                    {state.characters.find((c) => c.id === l.awardedTo)?.name}
                  </p>
                ) : l.priority.length ? (
                  l.priority.slice(0, 3).map((id, i) => {
                    const c = state.characters.find((c) => c.id === id);
                    return (
                      c && (
                        <div key={id}>
                          <span className="rank">{i + 1}</span>
                          <ClassIcon cls={c.class} size={24} />
                          <strong style={{ color: CLASS_COLORS[c.class] }}>
                            {c.name}
                          </strong>
                        </div>
                      )
                    );
                  })
                ) : (
                  <p className="muted">Council order not set</p>
                )}
              </div>
              <div className="loot-card-actions">
                <button
                  className="btn secondary"
                  onClick={() => open({ type: "loot-detail", loot: l })}
                >
                  View priority
                  <ChevronRight size={14} />
                </button>
                {!l.awardedTo && (
                  <button
                    className="btn text"
                    onClick={() => open({ type: "loot", loot: l })}
                  >
                    Edit item
                  </button>
                )}
                {safeURL(l.source) && (
                  <a
                    href={safeURL(l.source)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View source for ${l.name}`}
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </article>
          ))}
      </div>
      {!state.loot.filter((l) =>
        lootTab === "awarded" ? l.awardedTo : !l.awardedTo,
      ).length && (
        <Empty
          icon={<Gem size={36} />}
          title={
            lootTab === "awarded"
              ? "The first award is still ahead."
              : "Give every drop a destination."
          }
          action={
            lootTab === "active"
              ? addButton("loot", "Plan your first item")
              : undefined
          }
        >
          {lootTab === "awarded"
            ? "Council awards and their reasons will appear here."
            : "Add a verified Forever item and its source, collect requests, and set the council order."}
        </Empty>
      )}
    </>
  );
  const consumables = (
    <>
      <div className="toolbar">
        <p className="muted">{state.supplies.length} preparation targets</p>
        {addButton("supply", "Add a target")}
      </div>
      {needed > 0 && (
        <section className="supply-summary">
          <FlaskConical size={32} />
          <div>
            <h2>{Math.round((pledged / needed) * 100)}% committed</h2>
            <p>
              {pledged} of {needed} requested supplies have a volunteer.
            </p>
          </div>
          <Meter value={pledged} max={needed} />
        </section>
      )}
      <div className="supply-grid">
        {state.supplies.map((s) => {
          const count = Object.values(s.pledges).reduce((a, b) => a + b, 0);
          return (
            <article className="panel supply-card" key={s.id}>
              <div className="panel-title">
                <span className="supply-icon">
                  <FlaskConical />
                </span>
                <span
                  className={`badge ${count >= s.needed ? "green" : "amber"}`}
                >
                  {count >= s.needed
                    ? "Target covered"
                    : `${s.needed - count} needed`}
                </span>
              </div>
              <h3>
                {s.itemId ? (
                  <ItemTooltip
                    id={s.itemId}
                    name={s.name}
                    className="item-name"
                    icon
                  />
                ) : (
                  s.name
                )}
              </h3>
              <p>
                {state.events.find((e) => e.id === s.eventId)?.title ||
                  "Guild stock"}
              </p>
              <div className="supply-count">
                <strong>
                  {count}
                  <span> / {s.needed}</span>
                </strong>
                <small>Committed</small>
              </div>
              <Meter value={count} max={s.needed} />
              <p className="muted supply-note">
                {s.notes || "Coordinate with the guild before the raid."}
              </p>
              <div className="contributors">
                {Object.entries(s.pledges)
                  .filter(([, q]) => q > 0)
                  .map(([id, q]) => (
                    <span key={id}>
                      {state.characters.find((c) => c.id === id)?.name ||
                        "Raider"}{" "}
                      <b>{q}</b>
                    </span>
                  ))}
                {!count && (
                  <small>No commitments yet. Be the first to help.</small>
                )}
              </div>
              <div className="form-actions">
                <button
                  className="btn secondary"
                  onClick={() => open({ type: "pledge", supply: s })}
                >
                  Commit supplies
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Edit ${s.name} target`}
                  onClick={() => open({ type: "supply", supply: s })}
                >
                  <Settings size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!state.supplies.length && (
        <Empty
          icon={<FlaskConical size={36} />}
          title="Bring more than your best damage."
          action={addButton("supply", "Set a preparation target")}
        >
          Track potions, food, reagents, crafted gear, or any material the raid
          needs. Members can commit their share.
        </Empty>
      )}
    </>
  );
  const progress = (
    <>
      <div className="toolbar">
        <span className="muted">
          {defeated} defeated ·{" "}
          {state.bosses.filter((b) => b.status === "progressing").length} in
          progress
        </span>
        {addButton("boss", "Track an encounter")}
      </div>
      <div className="boss-grid">
        {state.bosses.map((b, i) => (
          <article className={`boss-card ${b.status}`} key={b.id}>
            <div className="boss-art">
              <Flame size={80} strokeWidth={0.7} />
              <span className="boss-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={`badge ${b.status === "defeated" ? "green" : b.status === "progressing" ? "amber" : ""}`}
              >
                {label(b.status.replaceAll("-", " "))}
              </span>
            </div>
            <div className="boss-body">
              <p className="muted">{b.instance}</p>
              <h2>{b.name}</h2>
              <div className="boss-stats">
                <div>
                  <strong>{b.pulls}</strong>
                  <small>Total pulls</small>
                </div>
                <div>
                  <strong>
                    {b.status === "defeated" ? 0 : b.bestPercent}%
                  </strong>
                  <small>Best remaining HP</small>
                </div>
              </div>
              <p>
                {b.notes ||
                  "Add encounter notes and assignments as you learn the fight."}
              </p>
              <button
                className="btn secondary"
                onClick={() => open({ type: "boss", boss: b })}
              >
                Update progress
                <ChevronRight size={15} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!state.bosses.length && (
        <Empty
          icon={<Flag size={36} />}
          title="Every first kill starts with a first pull."
          action={addButton("boss", "Track your first encounter")}
        >
          Add the encounters your guild is actually tackling. Record attempts,
          best remaining health, and strategy notes.
        </Empty>
      )}
    </>
  );
  const activity = (
    <>
      <div className="toolbar">
        <p className="muted">
          Revision {state.revision} · {state.audit.length} recorded changes
        </p>
        <a
          className="btn secondary"
          href={`${REPO_URL}/commits/main/public/data/raid-state.json`}
          target="_blank"
          rel="noreferrer"
        >
          <Github size={16} />
          Repository history
          <ExternalLink size={14} />
        </a>
      </div>
      <section className="panel audit-panel">
        {state.audit.map((a) => (
          <div className="audit-row" key={a.id}>
            <span className="audit-icon">
              <CheckCircle2 size={18} />
            </span>
            <div>
              <h4>{a.summary}</h4>
              <p>
                {a.actor} <span>·</span> {label(a.action.replaceAll(".", " "))}
              </p>
            </div>
            <time>
              {formatDate(a.at, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </div>
        ))}
        {!state.audit.length && (
          <Empty
            icon={<History size={36} />}
            title="A fresh page in the guild’s history."
          >
            Imports, RSVPs, commitments, roster changes, and loot awards will
            appear here after they are saved.
          </Empty>
        )}
      </section>
    </>
  );
  const settings = (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-title">
          <h3>Guild identity</h3>
          <span className="badge">
            <ShieldCheck size={13} />
            Admin
          </span>
        </div>
        <Form
          onSubmit={(f) =>
            void change({
              type: "guild.update",
              name: String(f.get("name")),
              timeZone: String(f.get("timeZone")),
              adminsGithub: [],
              membersGithub: [],
            })
          }
        >
          <Field label="Guild name">
            <input
              name="name"
              defaultValue={state.guild.name}
              required
              maxLength={100}
            />
          </Field>
          <Field label="Guild time zone">
            <input
              name="timeZone"
              defaultValue={state.guild.timeZone}
              required
            />
          </Field>
          <p className="muted">
            Approve members and choose private sections and teams in{" "}
            <a href="#access">Members &amp; access</a>.
          </p>
          <div className="form-actions">
            <button className="btn primary" type="submit">
              Save settings
            </button>
          </div>
        </Form>
      </section>
      <section className="panel">
        <div className="panel-title">
          <h3>Connections & security</h3>
          <ShieldCheck size={20} />
        </div>
        <div className="connection">
          <Github size={23} />
          <div>
            <strong>GitHub repository</strong>
            <small>theforcebe/onslaught</small>
          </div>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="badge green"
          >
            Connected
            <ExternalLink size={12} />
          </a>
        </div>
        <div className="connection">
          <span className="bnet-mark">✧</span>
          <div>
            <strong>Battle.net</strong>
            <small>
              {API_URL ? "Secure gateway configured" : "Server setup required"}
            </small>
          </div>
          <span className={`badge ${API_URL ? "green" : "amber"}`}>
            {API_URL ? "Ready" : "Pending"}
          </span>
        </div>
        <p className="muted">
          Passwords are handled by Battle.net. OAuth secrets stay on the server.
          Your app session survives refreshes in this tab and expires after an
          hour.
        </p>
        <a
          className="btn secondary"
          href={`${REPO_URL}/blob/main/docs/DEPLOYMENT.md`}
          target="_blank"
          rel="noreferrer"
        >
          Admin setup guide
          <ExternalLink size={14} />
        </a>
        <a
          className="text-link"
          href={`${REPO_URL}/blob/main/SECURITY.md`}
          target="_blank"
          rel="noreferrer"
        >
          Read the security model
          <ExternalLink size={12} />
        </a>
      </section>
      <section className="panel">
        <h3>Your data, with history.</h3>
        <p className="muted">
          Guild records are versioned in a private data repository. Downloads
          include only the information your account can view. Accepted changes
          include an audit entry and a revision number.
        </p>
        <div className="button-row">
          <button
            className="btn secondary"
            onClick={() =>
              download(
                `onslaught-${demo ? "demo" : "guild"}-revision-${state.revision}.json`,
                JSON.stringify(state, null, 2),
              )
            }
          >
            <Download size={15} />
            Download snapshot
          </button>
          <a
            href="https://github.com/theforcebe/onslaught-data"
            target="_blank"
            rel="noreferrer"
            className="btn secondary"
          >
            Private data history
            <ExternalLink size={14} />
          </a>
        </div>
        <p className="privacy-note">
          The website code, roster, and schedule are public. Gear, attendance,
          plans, and member permissions stay in the private data repository.
          Never enter passwords or account tokens into raid records.
        </p>
      </section>
      <section className="panel">
        <h3>A safe place to experiment.</h3>
        <p className="muted">
          The demo has a sample roster and example raid plans. Changes stay in
          this browser and never reach the live guild.
        </p>
        <button className="btn secondary" onClick={toggleDemo}>
          {demo ? "Return to live guild" : "Explore the demo"}
        </button>
        {demo && (
          <button
            className="btn text danger-text"
            onClick={() => {
              const next = demoState(live!);
              setPractice(next);
              localStorage.removeItem("onslaught:demo:v1");
              toast("Demo reset. The live guild was not changed.");
            }}
          >
            Reset demo
          </button>
        )}
      </section>
    </div>
  );
  const content: Record<string, ReactNode> = {
    community: (
      <Suspense fallback={<p className="muted">Opening guild coordination…</p>}>
        <GuildHub
          key={demo ? "demo-hub" : `guild-hub-${identity?.id || "visitor"}`}
          initialTab={hubTab}
          state={state}
          access={effectiveAccess}
          identity={identity}
          people={demo ? demoPeople : people}
          demo={demo}
          change={(a) => change(a, true)}
          refresh={refresh}
        />
      </Suspense>
    ),
    overview: (
      <GuildBoard
        state={state}
        access={effectiveAccess}
        identity={identity}
        demo={demo}
        go={go}
        change={(a) => change(a, true)}
        setup={() => open({ type: "import" })}
      />
    ),
    polls: (
      <Suspense fallback={<p>Opening scheduling polls…</p>}>
        <GuildHub
          mode="polls"
          state={state}
          access={effectiveAccess}
          identity={identity}
          people={demo ? demoPeople : people}
          demo={demo}
          change={(a) => change(a, true)}
          refresh={refresh}
        />
      </Suspense>
    ),
    planner,
    roster,
    loot,
    consumables,
    progress,
    activity,
    settings,
    access: (
      <AccessPanel
        access={effectiveAccess}
        members={demo ? demoMembers : members}
        state={state}
        identity={demo ? undefined : identity}
        demo={demo}
        save={async (member) => {
          try {
            if (demo) {
              setDemoMembers((old) =>
                old.map((m) => (m.id === member.id ? member : m)),
              );
              toast("Demo member permissions saved locally.");
            } else {
              acceptView(await saveMember(member, state.revision));
              toast("Member access updated.");
            }
          } catch (e) {
            toast((e as Error).message);
          }
        }}
        join={async () => {
          try {
            acceptView(await requestMembership());
            toast("Membership request sent to guild admins.");
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      />
    ),
  };
  const publicOverview = (
    <>
      <section className="raid-hero public-hero">
        <div className="hero-contours" aria-hidden="true">
          <div className="rune">
            <img src={`${import.meta.env.BASE_URL}crest.svg`} alt="" />
          </div>
        </div>
        <div className="hero-content">
          <span className="hero-kicker">
            <span className="pulse-dot" />
            Ønslaught · WoW Forever
          </span>
          <h2>{nextRaid?.title || "Stronger, together."}</h2>
          <p>
            {nextRaid
              ? `${nextRaid.instance} · ${formatDate(nextRaid.start, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`
              : "One guild. Every class. A place for every raider."}
          </p>
          <div className="hero-actions">
            <button className="btn gold" onClick={() => go("roster")}>
              Meet the roster <Users size={16} />
            </button>
            <button
              className="btn hero-secondary"
              onClick={() => go("schedule")}
            >
              Raid schedule <CalendarDays size={16} />
            </button>
          </div>
        </div>
        <div className="hero-footer">
          <span>{state.characters.length} raiders on the public roster</span>
          <span className="hero-footnote">Public roster & schedule</span>
        </div>
      </section>
      <div className="overview-bottom spaced">
        <section className="panel">
          <div className="panel-title">
            <h3>Every class brings something.</h3>
            <span className="badge">Public</span>
          </div>
          <div className="class-distribution">
            {CLASSES.map((cls) => (
              <div key={cls}>
                <ClassIcon cls={cls} size={29} />
                <span>{label(cls)}</span>
                <div className="class-track">
                  <span
                    style={{
                      width: `${(state.characters.filter((c) => c.class === cls).length / (state.characters.length || 1)) * 100}%`,
                      background: CLASS_COLORS[cls],
                    }}
                  />
                </div>
                <strong>
                  {state.characters.filter((c) => c.class === cls).length}
                </strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h3>Your raid workspace</h3>
            <ShieldCheck size={20} />
          </div>
          <p className="muted">
            Gear, loot priorities, consumables, attendance, and encounter notes
            are available to approved members for their assigned sections and
            teams.
          </p>
          <button
            className="btn primary"
            onClick={() => (identity ? go("access") : void signIn())}
          >
            {identity ? "View your access" : "Sign in with Battle.net"}
          </button>
        </section>
      </div>
    </>
  );
  const pageSection: Record<string, Section> = {
    polls: "attendance",
    loot: "loot",
    consumables: "consumables",
    progress: "progress",
    activity: "activity",
  };
  const pageAllowed = (id: string) =>
    id === "community"
      ? effectiveAccess.status === "active"
      : id === "settings"
        ? effectiveAccess.admin
        : !pageSection[id] || hasSection(effectiveAccess, pageSection[id]);
  const locked = (
    <section className="panel">
      <Empty icon={<LockKeyhole size={36} />} title="This section is private.">
        Your guild admin controls section and team access.
      </Empty>
      <div className="button-row">
        <button
          className="btn primary"
          onClick={() => (identity ? go("access") : void signIn())}
        >
          {identity ? "View your access" : "Sign in with Battle.net"}
        </button>
      </div>
    </section>
  );
  const raidPage = [
    "planner",
    "polls",
    "loot",
    "consumables",
    "progress",
    "schedule",
  ].includes(page);
  const [title, subtitle] =
    titles[raidPage ? "planner" : page] || titles.overview;
  return (
    <div
      className="app"
      style={
        Object.fromEntries(
          Object.entries(CLASS_COLORS).map(([k, v]) => [`--${k}`, v]),
        ) as CSSProperties
      }
    >
      {menu && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a className="brand" href="#overview" onClick={() => setMenu(false)}>
          <img
            src={`${import.meta.env.BASE_URL}crest.svg`}
            alt="Ønslaught crest"
          />
          <div>
            <strong>Ønslaught</strong>
            <span>Raid headquarters</span>
          </div>
        </a>
        <div className="guild-switch">
          <span className="guild-emblem">Ø</span>
          <div>
            <strong>{state.guild.name}</strong>
            <small>
              <span className="dot green" />
              WoW Forever · {state.guild.region}
            </small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`${page === n.id || (n.id === "planner" && raidPage) ? "active" : ""} ${n.id === "community" ? "guild-nav" : ""}`}
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              <span>{n.name}</span>
              {!pageAllowed(n.id) && <LockKeyhole size={13} />}
              {n.id === "roster" && <small>{state.characters.length}</small>}
              {n.id === "loot" && pendingLoot.length > 0 && (
                <span className="nav-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <SetupGuide
            state={state}
            access={effectiveAccess}
            identity={identity}
            demo={demo}
            go={go}
            signIn={() => void signIn()}
            importCharacter={() => open({ type: "import" })}
          />
          <div className="guild-note">
            <span className="small-crest">⚔</span>
            <p>
              One guild.
              <br />
              <strong>Every victory, together.</strong>
            </p>
          </div>
          {effectiveAccess.admin && (
            <button
              className={`settings-nav ${page === "settings" ? "active" : ""}`}
              onClick={() => go("settings")}
            >
              <Settings size={18} />
              Guild settings
            </button>
          )}
          <a
            className="github-link"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            <Github size={16} />
            Built with the guild
            <ExternalLink size={12} />
          </a>
          <div className="sidebar-user">
            <ClassIcon cls="hunter" size={32} />
            <div>
              <strong>
                {identity
                  ? identity.label
                  : demo
                    ? "Demo workspace"
                    : "Guild visitor"}
              </strong>
              <small>
                {demo
                  ? "Local changes only"
                  : identity
                    ? "Battle.net verified"
                    : "Viewing shared roster"}
              </small>
            </div>
            {identity ? (
              <button
                className="icon-btn"
                aria-label="Sign out"
                onClick={async () => {
                  setIdentity(undefined);
                  setAccess(PUBLIC_ACCESS);
                  setMembers([]);
                  setPeople([]);
                  setDialog(undefined);
                  setLive((prev) =>
                    prev
                      ? project({ version: 1, state: prev, members: [] }).state
                      : prev,
                  );
                  try {
                    await logout();
                  } catch {
                    /* Local sign-out already cleared the session. */
                  }
                  await refresh();
                  toast("Signed out.");
                }}
              >
                <LogOut size={15} />
              </button>
            ) : (
              <ShieldCheck size={16} />
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-only"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span>Guild headquarters</span>
            <ChevronRight size={13} />
            <strong>
              {raidPage
                ? "Raid planner"
                : nav.find((n) => n.id === page)?.name || "Guild settings"}
            </strong>
          </div>
          <div className="top-actions">
            {effectiveAccess.admin || import.meta.env.DEV ? (
              <button
                className={`mode-button ${demo ? "demo" : ""}`}
                onClick={toggleDemo}
              >
                <span className={`dot ${demo ? "amber" : "green"}`} />
                {demo ? "Demo workspace" : "Live guild"}
                <ChevronDown size={12} />
              </button>
            ) : (
              <span className="live-status">
                <span className="dot green" />
                Live guild
              </span>
            )}
            <button
              className={`icon-btn ${refreshing ? "spin" : ""}`}
              aria-label="Refresh shared guild data"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw size={16} />
            </button>
            {!identity && (
              <button className="btn bnet" onClick={() => void signIn()}>
                <span>✧</span>Battle.net sign in
              </button>
            )}
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <FlaskConical size={15} />
              Demo workspace · Example raiders and encounters. Edits stay in
              this browser.
            </span>
            <button onClick={toggleDemo}>
              Return to live guild
              <X size={14} />
            </button>
          </div>
        )}
        <main>
          <div className="page-heading">
            <div>
              <div className="page-context">
                <span className="realm-dot" />
                {state.guild.realm}
              </div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            {page === "overview" && hasSection(effectiveAccess, "gear") && (
              <button
                className="btn secondary"
                onClick={() => open({ type: "import" })}
              >
                <Upload size={16} />
                Import character
              </button>
            )}
          </div>
          {error && !demo && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          {raidPage && (
            <div className="raid-workspace-tabs" aria-label="Raid workspace">
              {[
                ["planner", "Lineup & availability"],
                ["polls", "Night polls"],
                ["loot", "Loot council"],
                ["consumables", "Raid supplies"],
                ["progress", "Progress"],
              ]
                .filter(([id]) => id === "planner" || pageAllowed(id))
                .map(([id, name]) => (
                  <button
                    key={id}
                    className={page === id ? "active" : ""}
                    onClick={() => go(id)}
                  >
                    {name}
                  </button>
                ))}
            </div>
          )}
          {pageAllowed(page)
            ? page === "overview" && effectiveAccess.status !== "active"
              ? publicOverview
              : content[page] || publicOverview
            : locked}
          <footer className="page-footer">
            <span>
              Ønslaught <span className="footer-divider">/</span> Made for the
              long game.
            </span>
            <span>
              Item tooltips by{" "}
              <a
                href="https://www.wowhead.com/forever"
                target="_blank"
                rel="noreferrer"
              >
                Wowhead Forever
              </a>{" "}
              · Item search:{" "}
              <a href="https://thewowdb.com/" target="_blank" rel="noreferrer">
                TheWoWDB
              </a>{" "}
              · Game art © Blizzard
            </span>
          </footer>
        </main>
      </div>
      {notification && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{notification}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setNotification("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {!demo && identity && effectiveAccess.status === "active" && (
        <Suspense fallback={null}>
          <GuildChat
            key={identity.id}
            identity={identity}
            refresh={() => void refresh()}
          />
        </Suspense>
      )}
      {dialog && (
        <Dialogs
          key={`${dialog.type}-${dialog.character?.id || dialog.loot?.id || dialog.request?.id || ""}`}
          dialog={dialog}
          state={state}
          close={() => setDialog(undefined)}
          change={change}
          open={open}
          toast={toast}
          demo={demo}
          admin={effectiveAccess.admin}
          members={demo ? demoMembers : members}
          message={notification}
        />
      )}
    </div>
  );
}
function Stat({
  icon,
  title,
  value,
  suffix,
  note,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  suffix?: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button className="stat" onClick={onClick}>
      <div className="stat-top">
        <span>{title}</span>
        {icon}
      </div>
      <strong>
        {value}
        <span>{suffix}</span>
      </strong>
      <small>{note}</small>
    </button>
  );
}
