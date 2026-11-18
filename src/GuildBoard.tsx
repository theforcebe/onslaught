import { useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Megaphone,
  Package,
  Trophy,
} from "lucide-react";
import type { Access, GuildView } from "./lib/access";
import { hasSection } from "./lib/access";
import { countAttendance, upcomingRaid } from "./lib/upcoming-raid";
import { raidRoute } from "./lib/navigation";
import type { Identity, RaidAction, RaidState } from "./lib/model";
import { contributionBoard, emptyCommunity } from "./lib/community";
import { ItemTooltip } from "./ItemTooltip";
import { PollCard } from "./PollCard";

export function GuildBoard({
  state,
  access,
  attendance,
  identity,
  demo,
  go,
  change,
}: {
  state: RaidState;
  access: Access;
  attendance?: GuildView["upcomingAttendance"];
  identity?: Identity;
  demo: boolean;
  go: (id: string) => void;
  change: (a: RaidAction) => Promise<void>;
}) {
  const c = state.community || emptyCommunity(),
    announcement = c.announcements[0],
    open = c.requests.filter((r) => !r.cancelled && r.fulfilled < r.quantity),
    poll = c.polls[0],
    contributors = contributionBoard(c.requests),
    [error, setError] = useState("");
  const next = upcomingRaid(state.events);
  const counts =
    next &&
    (demo
      ? countAttendance(next)
      : attendance?.eventId === next.id
        ? attendance
        : undefined);
  const own = demo
    ? state.characters.slice(0, 1)
    : state.characters.filter(
        (c) => identity && c.ownerBattleNet === identity.id,
      );
  const response = {
    going: "Going",
    tentative: "Maybe",
    absent: "Can’t make it",
  };
  return (
    <div className="guild-board">
      <section
        className="war-room-banner board-next-raid"
        aria-label="Upcoming raid"
      >
        <img
          className="guild-hall-art"
          src={`${import.meta.env.BASE_URL}art/onslaught-warhost.jpg`}
          alt=""
          width={1774}
          height={887}
          fetchPriority="high"
        />
        <div>
          <span className="eyebrow">
            <CalendarDays size={15} />{" "}
            {next && Date.parse(next.start) <= Date.now()
              ? "Raid in progress"
              : "Upcoming raid"}
          </span>
          <h2>{next?.title || "No upcoming raid"}</h2>
          {next && (
            <>
              <p>
                {[
                  next.publicTeamName ||
                    state.teams.find((t) => t.id === next.teamId)?.name,
                  next.instance,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p>
                <time dateTime={next.start}>
                  {new Date(next.start).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })}
                </time>
              </p>
              {counts && (
                <dl className="board-raid-counts">
                  <div>
                    <dt>Confirmed</dt>
                    <dd>{counts.going}</dd>
                  </div>
                  <div>
                    <dt>Maybe</dt>
                    <dd>{counts.tentative}</dd>
                  </div>
                  <div>
                    <dt>Unavailable</dt>
                    <dd>{counts.absent}</dd>
                  </div>
                </dl>
              )}
              {own.length > 0 && (
                <p className="board-own-signup">
                  {own
                    .map(
                      (c) =>
                        c.name +
                        " · " +
                        (response[next.signups[c.id]] || "No response"),
                    )
                    .join(" / ")}
                </p>
              )}
            </>
          )}
        </div>
        <button
          className="btn hero-secondary"
          onClick={() => go(next ? raidRoute(next.id) : "planner")}
        >
          {next ? "View raid & sign up" : "Open raid planner"}
          <ArrowUpRight size={16} />
        </button>
      </section>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      <div className="watchboard-grid">
        {hasSection(access, "community") && (
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
        {hasSection(access, "attendance") && (
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
        )}
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
