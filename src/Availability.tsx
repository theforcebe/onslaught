import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import type { Identity, RaidAction, RaidEvent, RaidState } from "./lib/model";
import type { Access } from "./lib/access";
import { ClassIcon } from "./components";
import { Dropdown } from "./Dropdown";
export function Availability({
  state,
  event,
  identity,
  access,
  demo,
  change,
  setup,
}: {
  state: RaidState;
  event: RaidEvent;
  identity?: Identity;
  access: Access;
  demo?: boolean;
  change: (a: RaidAction) => Promise<void>;
  setup: () => void;
}) {
  const own = state.characters.filter(
      (c) => demo || (c.ownerBattleNet === identity?.id && !!identity),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("");
  const character =
    own.find((c) => c.id === selected) ||
    own.find((c) => c.teamId === event.teamId) ||
    own[0];
  return (
    <section className="availability-strip" aria-label="Your raid availability">
      <div>
        <CalendarCheck size={21} />
        <span>
          <strong>Your availability</strong>
          <small>
            {new Date(event.start).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </small>
        </span>
      </div>
      {access.status !== "active" ? (
        <p className="muted">
          Sign in and get your guild membership approved to respond.
        </p>
      ) : character ? (
        <>
          {own.length > 1 ? (
            <Dropdown
              label="Your character for availability"
              value={character.id}
              onChange={setSelected}
              options={own.map((c) => ({
                value: c.id,
                label: c.name,
                icon: <ClassIcon cls={c.class} size={23} />,
              }))}
            />
          ) : (
            <span className="availability-character">
              <ClassIcon cls={character.class} size={24} />
              {character.name}
            </span>
          )}
          <div
            className="segmented rsvp-actions"
            aria-label={`Availability for ${character.name}`}
          >
            {(
              [
                ["going", "Going"],
                ["tentative", "Maybe"],
                ["absent", "Can’t make it"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={event.signups[character.id] === id}
                className={
                  event.signups[character.id] === id ? `active ${id}` : ""
                }
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await change({
                      type: "event.signup",
                      eventId: event.id,
                      characterId: character.id,
                      status: id,
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <span className="muted">
            Import your character or ask an admin to link your roster entry.
          </span>
          <button className="btn secondary" onClick={setup}>
            Set up character
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="notice danger">
          {error}
        </p>
      )}
    </section>
  );
}
