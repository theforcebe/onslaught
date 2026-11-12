import { useState } from "react";
import {
  ShieldCheck,
  Crown,
  Swords,
  Users,
  Check,
  LockKeyhole,
  Search,
} from "lucide-react";
import { Empty } from "./components";
import {
  ASSIGNABLE_SECTIONS,
  SECTION_NAMES,
  RANKS,
  RANK_NAMES,
} from "./lib/access";
import type { Access, Member, Rank, Section } from "./lib/access";
import type { Identity, RaidState } from "./lib/model";

const rankIcons = {
  admin: Crown,
  officer: ShieldCheck,
  raider: Swords,
  guild_member: Users,
};
const rankDescriptions: Record<Rank, string> = {
  admin: "Full guild control",
  officer: "Access you assign",
  raider: "Access you assign",
  guild_member: "Access you assign",
};
const sectionDetails: Record<Section, string> = {
  planner: "Groups and team plans",
  gear: "Equipment, imports and notes",
  loot: "Priorities and personal requests",
  consumables: "Supplies and personal pledges",
  attendance: "Raid notes and personal RSVPs",
  progress: "Encounters and strategy",
  activity: "Admin-only guild history",
  community: "Announcements and focused conversations",
};

function MemberCard({
  member,
  teams,
  save,
}: {
  member: Member;
  teams: RaidState["teams"];
  save: (member: Member) => Promise<void>;
}) {
  const [draft, setDraft] = useState(member);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(member);
  const assignedCount = draft.sections.filter(
    (section) => section !== "activity",
  ).length;
  const RankIcon = rankIcons[member.role];
  const toggleSection = (section: Section) =>
    setDraft((m) => ({
      ...m,
      sections: m.sections.includes(section)
        ? m.sections.filter((s) => s !== section)
        : [...m.sections, section],
    }));
  const toggleTeam = (teamId: string) =>
    setDraft((m) => ({
      ...m,
      teamIds: m.teamIds.includes(teamId)
        ? m.teamIds.filter((t) => t !== teamId)
        : [...m.teamIds, teamId],
    }));
  return (
    <article className="panel member-card">
      <header className="member-heading">
        <span className={`member-emblem rank-${member.role}`}>
          <RankIcon size={22} />
        </span>
        <div>
          <h3>{member.label}</h3>
          <span className="muted">{RANK_NAMES[member.role]}</span>
        </div>
        <span
          className={`badge ${member.status === "active" ? "green" : "amber"}`}
        >
          {member.status === "pending" ? "Awaiting approval" : member.status}
        </span>
      </header>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving) return;
          setSaving(true);
          try {
            await save(draft);
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset className="access-fieldset" disabled={saving}>
          <legend>Membership</legend>
          <div className="segmented-control status-control">
            {(
              [
                ["pending", "Pending"],
                ["active", "Active"],
                ["suspended", "Suspended"],
              ] as const
            ).map(([value, name]) => (
              <label key={value} className={`segment status-${value}`}>
                <input
                  type="radio"
                  name={`status-${member.id}`}
                  checked={draft.status === value}
                  onChange={() => setDraft({ ...draft, status: value })}
                />
                <span>
                  <i aria-hidden="true" />
                  {name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="access-fieldset" disabled={saving}>
          <legend>Guild rank</legend>
          <div className="rank-options">
            {RANKS.map((rank) => {
              const Icon = rankIcons[rank];
              return (
                <label key={rank} className={`rank-option rank-${rank}`}>
                  <input
                    type="radio"
                    name={`rank-${member.id}`}
                    checked={draft.role === rank}
                    onChange={() => setDraft({ ...draft, role: rank })}
                  />
                  <span className="rank-option-content">
                    <Icon size={21} />
                    <strong>{RANK_NAMES[rank]}</strong>
                    <small>{rankDescriptions[rank]}</small>
                    <Check className="rank-check" size={14} />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {draft.role === "admin" ? (
          <div className="admin-access-note">
            <Crown size={21} />
            <div>
              <strong>Full administrative access</strong>
              <p>
                Can view every section and team, manage members, change raid
                structure, and award loot.
              </p>
            </div>
          </div>
        ) : (
          <>
            <fieldset className="access-fieldset" disabled={saving}>
              <legend>
                Private sections{" "}
                <span>
                  {assignedCount} of {ASSIGNABLE_SECTIONS.length}
                </span>
              </legend>
              <div className="permission-options">
                {ASSIGNABLE_SECTIONS.map((section) => (
                  <label key={section} className="permission-option">
                    <input
                      type="checkbox"
                      checked={draft.sections.includes(section)}
                      onChange={() => toggleSection(section)}
                    />
                    <span className="permission-check" aria-hidden="true">
                      <Check size={13} />
                    </span>
                    <span>
                      <strong>{SECTION_NAMES[section]}</strong>
                      <small>{sectionDetails[section]}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="access-fieldset" disabled={saving}>
              <legend>Raid team access</legend>
              <div className="segmented-control team-scope-control">
                <label className="segment">
                  <input
                    type="radio"
                    name={`teams-${member.id}`}
                    checked={!draft.allTeams}
                    onChange={() => setDraft({ ...draft, allTeams: false })}
                  />
                  <span>Specific teams</span>
                </label>
                <label className="segment">
                  <input
                    type="radio"
                    name={`teams-${member.id}`}
                    checked={draft.allTeams}
                    onChange={() => setDraft({ ...draft, allTeams: true })}
                  />
                  <span>All teams</span>
                </label>
              </div>
              {draft.allTeams ? (
                <p className="access-help">
                  Includes teams created in the future.
                </p>
              ) : (
                <div className="team-permissions">
                  {teams.map((team) => (
                    <label className="team-permission" key={team.id}>
                      <input
                        type="checkbox"
                        checked={draft.teamIds.includes(team.id)}
                        onChange={() => toggleTeam(team.id)}
                      />
                      <span>
                        <Check size={13} />
                        {team.name}
                      </span>
                    </label>
                  ))}
                  {!teams.length && (
                    <p className="access-help">
                      Create a team in Raid planner first.
                    </p>
                  )}
                  {!!teams.length && !draft.teamIds.length && (
                    <p className="access-help">
                      Choose teams to unlock their private records.
                    </p>
                  )}
                </div>
              )}
            </fieldset>
            <p className="access-help">
              <LockKeyhole size={14} />
              These choices apply to this person. Section access allows viewing
              and personal contributions. Structure, awards, membership, and
              Activity history remain admin-only.
            </p>
          </>
        )}
        <footer className="member-save-row">
          <p>
            {draft.status !== "active" ? (
              <>
                <LockKeyhole size={14} />
                {draft.status === "pending"
                  ? "Pending approval: public view only"
                  : "Suspended: public view only"}
              </>
            ) : draft.role === "admin" ? (
              "All sections · All teams"
            ) : (
              `${assignedCount} private section${assignedCount === 1 ? "" : "s"} · ${draft.allTeams ? "All teams" : `${draft.teamIds.length} selected team${draft.teamIds.length === 1 ? "" : "s"}`}`
            )}
          </p>
          {dirty && <span className="unsaved-label">Unsaved changes</span>}
          <button
            className="btn primary"
            type="submit"
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save member access"}
          </button>
        </footer>
      </form>
    </article>
  );
}

export function AccessPanel({
  access,
  members,
  state,
  identity,
  save,
  join,
  demo,
}: {
  access: Access;
  members: Member[];
  state: RaidState;
  identity?: Identity;
  save: (member: Member) => Promise<void>;
  join: () => Promise<void>;
  demo: boolean;
}) {
  const [search, setSearch] = useState("");
  const visibleMembers = members.filter((m) =>
    `${m.label} ${RANK_NAMES[m.role]}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="access-page">
      <section className="panel access-intro">
        <ShieldCheck size={26} />
        <div>
          <h3>
            {access.admin ? "You decide who sees what." : "Your guild access"}
          </h3>
          <p className="muted">
            Roster and schedule are public. Private sections and raid teams are
            assigned to each person by an admin.
          </p>
          <p className="muted">
            Admins have full control. Officers, Raiders, and Guild Members get
            only their assigned access. Guild-wide records need section access;
            team records also need the matching team.
          </p>
        </div>
      </section>
      {!access.admin && (
        <section className="panel">
          <h3>
            {access.status === "pending"
              ? "Your request is with the admins."
              : access.status === "suspended"
                ? "Your membership is suspended."
                : access.status === "active"
                  ? `Your rank: ${access.role ? RANK_NAMES[access.role] : "Guild Member"}`
                  : "Join the guild workspace"}
          </h3>
          <p className="muted">
            {access.status === "active"
              ? `Sections: ${access.sections.map((s) => SECTION_NAMES[s]).join(", ") || "No private sections yet"}. Team access: ${access.allTeams ? "All teams" : access.teamIds.map((id) => state.teams.find((t) => t.id === id)?.name || state.characters.find((c) => c.teamId === id)?.publicTeamName || state.events.find((e) => e.teamId === id)?.publicTeamName || "Assigned team").join(", ") || "No teams yet"}.`
              : "Sign in with Battle.net, then request membership. An admin assigns your rank and access."}
          </p>
          {identity && access.status === "unregistered" && (
            <button className="btn primary" onClick={() => void join()}>
              Request membership
            </button>
          )}
        </section>
      )}
      {access.admin && identity?.accountId && (
        <details className="panel owner-reference">
          <summary>Owner setup reference</summary>
          <p className="muted">
            Your verified Battle.net account ID is{" "}
            <code>{identity.accountId}</code>. The guild owner can use their own
            ID to configure the first admin. This reference is shown only to
            your signed-in account.
          </p>
        </details>
      )}
      {access.admin && (
        <>
          <div className="section-heading">
            <h2>
              Guild members <span className="badge">{members.length}</span>
            </h2>
            <span className="muted">
              {demo
                ? "Fictional members · local demo"
                : "Access changes apply on the next server request"}
            </span>
          </div>
          {members.length > 1 && (
            <label className="search-field member-search">
              <Search size={16} />
              <input
                aria-label="Find a guild member"
                placeholder="Find by BattleTag or rank…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
          {!members.length && (
            <section className="panel">
              <Empty
                icon={<Users size={32} />}
                title="Ready for your first members"
              >
                Members appear here after signing in and requesting membership.
              </Empty>
            </section>
          )}
          {!!members.length && !visibleMembers.length && (
            <Empty icon={<Search size={28} />} title="No matching members">
              Try another BattleTag or rank.
            </Empty>
          )}
          <div className="member-grid">
            {visibleMembers.map((member) => (
              <MemberCard
                key={`${member.id}-${JSON.stringify(member)}`}
                member={member}
                teams={state.teams}
                save={save}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
