import { ShieldCheck, LockKeyhole, Users } from "lucide-react";
import { Form, Field, Empty } from "./components";
import { SECTIONS, SECTION_NAMES } from "./lib/access";
import type { Access, Member } from "./lib/access";
import type { Identity, RaidState } from "./lib/model";

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
  return (
    <div className="access-page">
      <section className="panel access-intro">
        <ShieldCheck size={26} />
        <div>
          <h3>{access.admin ? "Members & access" : "Your guild access"}</h3>
          <p className="muted">
            The roster and raid calendar are public. Gear, raid planning, loot,
            supplies, attendance, progress, and history require section access
            and the right raid team.
          </p>
          <p className="muted">
            Guild-wide records are shared with members who can view that
            section. Team records are limited to the teams you select. Admins
            can see and manage everything.
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
                  ? "Your permissions"
                  : "Join the guild workspace"}
          </h3>
          <p className="muted">
            {access.status === "active"
              ? `Sections: ${access.sections.map((s) => SECTION_NAMES[s]).join(", ") || "No private sections yet"}. Team access: ${access.allTeams ? "All teams" : access.teamIds.map((id) => state.teams.find((t) => t.id === id)?.name || state.characters.find((c) => c.teamId === id)?.publicTeamName || state.events.find((e) => e.teamId === id)?.publicTeamName || "Assigned team").join(", ") || "No teams yet"}.`
              : "Sign in with Battle.net, then request membership. An admin approves your account and chooses what you can see."}
          </p>
          {identity && access.status === "unregistered" && (
            <button className="btn primary" onClick={() => void join()}>
              Request membership
            </button>
          )}
        </section>
      )}
      {identity?.accountId && (
        <details className="panel">
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
                : "Changes apply on the next server request"}
            </span>
          </div>
          {!members.length && (
            <section className="panel">
              <Empty
                icon={<Users size={32} />}
                title="Ready for your first members"
              >
                Raiders appear here after signing in and requesting membership.
              </Empty>
            </section>
          )}
          <div className="member-grid">
            {members.map((member) => (
              <section className="panel member-card" key={member.id}>
                <div className="panel-title">
                  <h3>{member.label}</h3>
                  <span
                    className={`badge ${member.status === "active" ? "green" : "amber"}`}
                  >
                    {member.status}
                  </span>
                </div>
                <Form
                  key={`${member.id}-${state.revision}`}
                  onSubmit={(f) =>
                    save({
                      ...member,
                      status: String(f.get("status")) as Member["status"],
                      role: String(f.get("role")) as Member["role"],
                      sections: SECTIONS.filter((s) => f.has(`section-${s}`)),
                      allTeams: f.get("teamScope") === "all",
                      teamIds: state.teams
                        .filter((t) => f.has(`team-${t.id}`))
                        .map((t) => t.id),
                    })
                  }
                >
                  <div className="form-row">
                    <Field label="Membership">
                      <select name="status" defaultValue={member.status}>
                        <option value="pending">Pending approval</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </Field>
                    <Field label="Role">
                      <select name="role" defaultValue={member.role}>
                        <option value="member">Raider</option>
                        <option value="admin">Admin · full access</option>
                      </select>
                    </Field>
                  </div>
                  <fieldset className="permission-list">
                    <legend>
                      <LockKeyhole size={14} /> Private sections
                    </legend>
                    {SECTIONS.map((s) => (
                      <label key={s}>
                        <input
                          type="checkbox"
                          name={`section-${s}`}
                          defaultChecked={member.sections.includes(s)}
                        />
                        <span>{SECTION_NAMES[s]}</span>
                      </label>
                    ))}
                  </fieldset>
                  <Field label="Raid team access">
                    <select
                      name="teamScope"
                      defaultValue={member.allTeams ? "all" : "selected"}
                    >
                      <option value="selected">Selected teams only</option>
                      <option value="all">
                        All teams, including future teams
                      </option>
                    </select>
                  </Field>
                  <fieldset className="permission-list">
                    <legend>Selected teams</legend>
                    {state.teams.map((t) => (
                      <label key={t.id}>
                        <input
                          type="checkbox"
                          name={`team-${t.id}`}
                          defaultChecked={member.teamIds.includes(t.id)}
                        />
                        <span>{t.name}</span>
                      </label>
                    ))}
                    {!state.teams.length && (
                      <p className="muted">
                        Create a team in Raid planner first.
                      </p>
                    )}
                  </fieldset>
                  <p className="muted">
                    Section access lets raiders view records and update their
                    own character, RSVP, request loot, and pledge supplies.
                    Layout, awards, targets, and membership stay admin-only.
                  </p>
                  <button className="btn primary" type="submit">
                    Save member access
                  </button>
                </Form>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
