import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { label } from "./lib/model";
import { buildKey, characterBuilds } from "./lib/raid";
import type { Character, RaidBuild } from "./lib/model";
import type { Identity, RaidAction, RaidEvent, RaidState } from "./lib/model";
import { hasSection, type Access } from "./lib/access";
import { ClassIcon } from "./components";
import { Dropdown } from "./Dropdown";
export function SignupChoices({
  character,
  event,
  change,
}: {
  character: Character;
  event: RaidEvent;
  change: (a: RaidAction) => void | Promise<void>;
}) {
  const [pendingBuild, setPendingBuild] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choices = characterBuilds(character);
  const recorded = event.signupBuilds?.[character.id];
  const selected =
    choices.find((b) => buildKey(b) === pendingBuild) ?? recorded ?? choices[0];
  const status = event.signups[character.id];
  if (Date.parse(event.end) <= Date.now()) {
    const response =
      status === "going"
        ? "Going"
        : status === "tentative"
          ? "Maybe"
          : status === "absent"
            ? "Can’t make it"
            : "No response";
    return (
      <span className="availability-build">
        Signups closed · {response}
        {status && selected
          ? ` · ${selected.spec} · ${label(selected.role)}`
          : ""}
      </span>
    );
  }
  const options =
    recorded && !choices.some((b) => buildKey(b) === buildKey(recorded))
      ? [...choices, recorded]
      : choices;
  const save = async (nextStatus: typeof status, build?: RaidBuild) => {
    setBusy(true);
    setError("");
    try {
      const validBuild = choices.find(
        (b) => build && buildKey(build) === buildKey(b),
      );
      await change({
        type: "event.signup",
        eventId: event.id,
        characterId: character.id,
        status: nextStatus,
        ...(validBuild ? { build: validBuild } : {}),
      });
      setPendingBuild("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {selected &&
        (options.length > 1 ? (
          <fieldset className="signup-build" disabled={busy}>
            <legend>Build for this raid</legend>
            <Dropdown
              label={`Build for ${character.name} this raid`}
              value={buildKey(selected)}
              options={options.map((b) => ({
                value: buildKey(b),
                label: `${b.spec} · ${label(b.role)}`,
              }))}
              onChange={(key) => {
                const picked = choices.find((b) => buildKey(b) === key);
                if (!picked) return;
                if (status) void save(status, picked);
                else setPendingBuild(key);
              }}
            />
          </fieldset>
        ) : (
          <span className="availability-build">
            {selected.spec} · {label(selected.role)}
          </span>
        ))}
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
        ).map(([id, name]) => (
          <button
            type="button"
            key={id}
            aria-pressed={status === id}
            className={status === id ? `active ${id}` : ""}
            disabled={busy}
            onClick={() => void save(id, selected)}
          >
            {name}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="notice danger">
          {error}
        </p>
      )}
    </>
  );
}
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
      {Date.parse(event.end) <= Date.now() && !character ? (
        <p className="muted">Signups closed when this raid ended.</p>
      ) : access.status !== "active" ? (
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
          <SignupChoices
            key={`${event.id}/${character.id}`}
            character={character}
            event={event}
            change={change}
          />
        </>
      ) : (
        <>
          <span className="muted">
            {hasSection(access, "gear")
              ? "Import your character or ask an admin to link your roster entry."
              : "Ask an admin to link your roster character or give you access to import one."}
          </span>
          {hasSection(access, "gear") && (
            <button className="btn secondary" onClick={setup}>
              Set up character
            </button>
          )}
        </>
      )}
    </section>
  );
}
