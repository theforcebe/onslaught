import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Megaphone,
  Package,
  Trophy,
} from "lucide-react";
import type { Access } from "./lib/access";
import { hasSection, hasTeam } from "./lib/access";
import type { Identity, RaidAction, RaidState } from "./lib/model";
import { contributionBoard, emptyCommunity } from "./lib/community";
import { ItemTooltip } from "./ItemTooltip";
import { PollCard } from "./PollCard";

export function GuildBoard({
  state,
  access,
  identity,
  demo,
  go,
  change,
  setup,
}: {
  state: RaidState;
  access: Access;
  identity?: Identity;
  demo: boolean;
  go: (id: string) => void;
  change: (a: RaidAction) => Promise<void>;
  setup: () => void;
}) {
  const c = state.community || emptyCommunity(),
    announcement = c.announcements[0],
    open = c.requests.filter((r) => !r.cancelled && r.fulfilled < r.quantity),
    poll = c.polls[0],
    contributors = contributionBoard(c.requests),
    [error, setError] = useState("");
  const next = [...state.events]
    .filter((e) => Date.parse(e.end) > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const fullAttendance =
    next && hasSection(access, "attendance") && hasTeam(access, next.teamId);
  return (
    <div className="guild-board">
      <div className="war-room-banner">
        <img
          className="guild-hall-art"
          src={`${import.meta.env.BASE_URL}art/onslaught-warhost.jpg`}
          alt=""
          width={1774}
          height={887}
          fetchPriority="high"
        />
        <div>
          <span className="eyebrow">Ønslaught on WoW Forever</span>
          <h2>Welcome to the guild hall</h2>
          <p>Our raids. Our people. One home for the Horde.</p>
        </div>
        <button className="btn hero-secondary" onClick={() => go("community")}>
          <Megaphone size={16} />
          Guild coordination
          <ArrowUpRight size={16} />
        </button>
      </div>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      <div className="watchboard-grid">
        <section className="panel dispatch-card">
          <div className="panel-title">
            <span className="eyebrow">
              <Megaphone size={16} />
              LATEST DISPATCH
            </span>
            <button className="btn text" onClick={() => go("community")}>
              View board
              <ArrowUpRight size={14} />
            </button>
          </div>
          {announcement ? (
            <>
              <h2>{announcement.title}</h2>
              <p className="dispatch-body">{announcement.body}</p>
              <small className="muted">
                {announcement.createdByName} ·{" "}
                {new Date(announcement.createdAt).toLocaleString()}
              </small>
            </>
          ) : (
            <>
              <h3>
                {hasSection(access, "community")
                  ? "No announcements yet"
                  : "Guild announcements"}
              </h3>
              <p className="muted">
                {hasSection(access, "community")
                  ? "The latest message from your guild leadership will appear here."
                  : "Your admin can grant access to the guild board."}
              </p>
            </>
          )}
        </section>
        <section className="panel next-raid-card">
          <div className="panel-title">
            <span className="eyebrow">
              <CalendarDays size={16} />
              NEXT RAID
            </span>
            <button className="btn text" onClick={() => go("planner")}>
              Open planner
              <ArrowUpRight size={14} />
            </button>
          </div>
          {next ? (
            <>
              <h2>{next.title}</h2>
              <p>
                {next.instance} ·{" "}
                {new Date(next.start).toLocaleString(undefined, {
                  weekday: "long",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </p>
              {fullAttendance ? (
                <div className="attendance-totals">
                  {[
                    ["going", "Confirmed"],
                    ["tentative", "Maybe"],
                    ["absent", "Unavailable"],
                  ].map(([status, label]) => (
                    <div key={status}>
                      <strong>
                        {
                          Object.values(next.signups).filter(
                            (v) => v === status,
                          ).length
                        }
                      </strong>
                      <small>{label}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  Your response is shown below. Full attendance follows your
                  assigned access.
                </p>
              )}
            </>
          ) : (
            <p className="muted">Your next scheduled raid will appear here.</p>
          )}
        </section>
        {next && (
          <div className="board-availability">
            <div className="board-rsvp">
              <span>Your next raid</span>
              <strong>
                {(demo
                  ? state.characters.slice(0, 1)
                  : state.characters.filter(
                      (c) => c.ownerBattleNet === identity?.id && !!identity,
                    )
                )
                  .map(
                    (c) =>
                      c.name +
                      ": " +
                      ({
                        going: "Going",
                        tentative: "Maybe",
                        absent: "Unavailable",
                      }[next.signups[c.id]] || "No response"),
                  )
                  .join(" · ") || "Set up your character to respond"}
              </strong>
              <button className="btn secondary" onClick={() => go("planner")}>
                Set availability in Raid planner
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        )}
        <section className="panel live-requests">
          <div className="panel-title">
            <h3>
              <Package size={17} /> Open supply requests{" "}
              <span className="badge">{open.length}</span>
            </h3>
            <button className="btn text" onClick={() => go("materials")}>
              Browse & help
              <ArrowUpRight size={14} />
            </button>
          </div>
          {open.length ? (
            open.slice(0, 6).map((r) => (
              <div className="request-feed-row" key={r.id}>
                <div>
                  {r.itemId ? (
                    <ItemTooltip id={r.itemId} name={r.item} icon />
                  ) : (
                    <strong>{r.item}</strong>
                  )}
                  <small>
                    {r.recipientId ? r.recipientName : "Up for grabs"} ·{" "}
                    {r.quantity - r.fulfilled} still needed
                  </small>
                </div>
                {!r.recipientId ? (
                  <button
                    className="btn secondary"
                    onClick={() => go("materials")}
                  >
                    Take request
                  </button>
                ) : (
                  <span className="badge">
                    {r.fulfilled}/{r.quantity}
                  </span>
                )}
              </div>
            ))
          ) : (
            <p className="muted">No outstanding requests in your guild view.</p>
          )}
          <small className="muted">
            Updates refresh automatically while this page is open.
          </small>
        </section>
        <section className="poll-preview">
          <div className="panel-title">
            <h3>Latest scheduling poll</h3>
            <button className="btn text" onClick={() => go("polls")}>
              All polls
              <ArrowUpRight size={14} />
            </button>
          </div>
          {poll ? (
            <PollCard
              summary
              poll={poll}
              actorId={demo ? "demo-admin" : identity?.id || ""}
              lead={false}
              connected={true}
              demo={demo}
              change={change}
              send={() => go("polls")}
              onError={setError}
            />
          ) : (
            <div className="panel">
              <p className="muted">
                {hasSection(access, "attendance")
                  ? "Raid-night polls and their results will appear here."
                  : "Your admin can grant access to scheduling polls."}
              </p>
            </div>
          )}
        </section>
      </div>
      <section className="contributor-strip">
        <span>
          <Trophy size={18} />
          Guild contributors
        </span>
        {contributors.slice(0, 4).map((p, i) => (
          <div key={p.id}>
            <b>{i + 1}</b>
            <strong>{p.name}</strong>
            <small>
              {p.completed} completed · {p.helped} helped
            </small>
          </div>
        ))}
        {!contributors.length && (
          <p className="muted">
            Fulfilled material requests build the guild contribution board.
          </p>
        )}
        <button className="btn text" onClick={() => go("materials")}>
          View contributions
          <ArrowUpRight size={14} />
        </button>
      </section>
    </div>
  );
}
