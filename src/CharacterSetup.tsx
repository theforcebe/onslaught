import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Upload } from "lucide-react";
import { ClassIcon, Field, RoleIcon } from "./components";
import {
  CLASS_SPECS,
  RAID_BUFFS,
  profileFor,
  validateProfile,
} from "./lib/raid";
import type { RaidProfile } from "./lib/raid";
import { label, makeId } from "./lib/model";
import type {
  Character,
  RaidAction,
  RaidState,
  Snapshot,
  WowClass,
} from "./lib/model";
import { parseSimc } from "./lib/parser";
import { EXAMPLE_EXPORT } from "./lib/example";

export function ProfileChoices({
  cls,
  profile,
  onChange,
  abilities = false,
  level,
}: {
  cls: WowClass;
  profile: RaidProfile;
  onChange: (p: RaidProfile) => void;
  abilities?: boolean;
  level: number;
}) {
  if (abilities)
    return (
      <div className="profile-abilities">
        <p className="muted">
          Select the abilities you have learned and can bring with this build.
          Leave unavailable talents unchecked. Your export does not prove these
          choices.
        </p>
        {RAID_BUFFS.filter((b) => b.cls === cls).map((b) => (
          <label
            className={`ability-choice ${profile.buffs.includes(b.id) ? "chosen" : ""}`}
            key={b.id}
          >
            <input
              type="checkbox"
              checked={profile.buffs.includes(b.id)}
              disabled={b.id === "spirit" && level < 30}
              onChange={(e) =>
                onChange({
                  ...profile,
                  buffs: e.target.checked
                    ? [...profile.buffs, b.id]
                    : profile.buffs.filter((id) => id !== b.id),
                })
              }
            />
            <span>
              <strong>{b.name}</strong>
              <small>{b.note}</small>
            </span>
            <span className="ability-benefit">{b.benefit}</span>
          </label>
        ))}
        <p className="muted">
          No selections is valid. The planner will show your coverage as
          unconfirmed until you update it.
        </p>
      </div>
    );
  return (
    <>
      <fieldset className="choice-field">
        <legend>What is your role in this raid?</legend>
        <div className="role-choices">
          {(["tank", "healer", "melee", "ranged"] as const).map((role) => (
            <button
              type="button"
              key={role}
              aria-pressed={profile.role === role}
              className={`role-choice ${role} ${profile.role === role ? "selected" : ""}`}
              onClick={() => onChange({ ...profile, role })}
            >
              <RoleIcon role={role} size={25} />
              <strong>{label(role)}</strong>
              <small>
                {
                  {
                    tank: "Hold the frontline",
                    healer: "Keep the raid alive",
                    melee: "Fight up close",
                    ranged: "Strike from a distance",
                  }[role]
                }
              </small>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="choice-field">
        <legend>{label(cls)} specialization</legend>
        <div className="spec-choices">
          {CLASS_SPECS[cls].map((spec) => (
            <button
              type="button"
              className={profile.spec === spec ? "selected" : ""}
              aria-pressed={profile.spec === spec}
              key={spec}
              onClick={() => onChange({ ...profile, spec })}
            >
              {spec}
              {profile.spec === spec && <Check size={16} />}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="muted">
        Choose your main talent tree and the role you intend to play.
        {cls === "druid" && " Feral covers both tanking and melee."}
      </p>
    </>
  );
}

export function CharacterProfileEditor({
  character: c,
  change,
}: {
  character: Character;
  change: (a: RaidAction) => void | Promise<void>;
}) {
  const [profile, setProfile] = useState(() => profileFor(c));
  const [notes, setNotes] = useState(c.notes);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const problem = validateProfile(c.class, profile, c.level);
        setError(problem);
        if (problem) return;
        setBusy(true);
        try {
          await change({
            type: "character.update",
            characterId: c.id,
            ...profile,
            notes,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <ProfileChoices
        cls={c.class}
        profile={profile}
        onChange={setProfile}
        level={c.level}
      />
      <h3>Buffs & utility you bring</h3>
      <ProfileChoices
        cls={c.class}
        profile={profile}
        onChange={setProfile}
        level={c.level}
        abilities
      />
      <Field label="Raid notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
        />
      </Field>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Save raid profile"}
        </button>
      </div>
    </form>
  );
}

export function CharacterImport({
  state,
  character,
  change,
  demo,
}: {
  state: RaidState;
  character?: Character;
  change: (a: RaidAction) => void | Promise<void>;
  demo: boolean;
}) {
  const [raw, setRaw] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [characterId, setCharacterId] = useState("");
  const [profile, setProfile] = useState<RaidProfile>({
    role: "unassigned",
    spec: "",
    buffs: [],
  });
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const proceed = () => {
    try {
      if (step === 0) {
        const parsed = parseSimc(raw);
        const existing =
          character ||
          state.characters.find(
            (c) =>
              c.name.toLowerCase() === parsed.name.toLowerCase() &&
              c.snapshot?.server === parsed.server &&
              c.snapshot?.region === parsed.region,
          );
        setSnapshot(parsed);
        setCharacterId(existing?.id || makeId());
        setProfile(
          existing
            ? profileFor(existing)
            : profileFor({
                class: parsed.class,
                role: "unassigned",
                spec: parsed.spec,
                buffs: [],
              }),
        );
      } else if (snapshot) {
        const problem = validateProfile(
          snapshot.class,
          profile,
          snapshot.level,
        );
        if (problem) throw new Error(problem);
      }
      setError("");
      setStep(step + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your export.");
    }
  };
  return (
    <div className="character-setup">
      <ol className="setup-steps" aria-label="Import progress">
        {["Export", "Role & spec", "Buffs", "Review"].map((name, i) => (
          <li
            key={name}
            aria-current={step === i ? "step" : undefined}
            className={step === i ? "current" : step > i ? "complete" : ""}
          >
            <span>{step > i ? <Check size={14} /> : i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      {snapshot && step > 0 && (
        <div className="setup-identity">
          <ClassIcon cls={snapshot.class} size={48} />
          <div>
            <h3>{snapshot.name}</h3>
            <p>
              Level {snapshot.level} {label(snapshot.class)} · {snapshot.server}
            </p>
          </div>
        </div>
      )}
      {step === 0 && (
        <>
          <h3>Start with your character export</h3>
          <p className="muted">
            Paste your SimC export. We’ll guide you through your role,
            specialization and raid abilities before saving anything.
          </p>
          <div className="import-tools">
            <label className="btn secondary file-button">
              <Upload size={16} /> Choose export
              <input
                type="file"
                accept=".simc,.txt,text/plain"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 100000) {
                    setError("Choose an export smaller than 100 KB.");
                    return;
                  }
                  setRaw(await file.text());
                  setError("");
                }}
              />
            </label>
            <button
              className="btn text"
              onClick={() => {
                setRaw(EXAMPLE_EXPORT);
                setError("");
              }}
            >
              Load fictional example
            </button>
          </div>
          <Field label="Character export">
            <textarea
              className="code-input"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={'hunter="Your character"\nlevel=25\n…'}
            />
          </Field>
        </>
      )}
      {snapshot && step === 1 && (
        <ProfileChoices
          cls={snapshot.class}
          profile={profile}
          onChange={setProfile}
          level={snapshot.level}
        />
      )}
      {snapshot && step === 2 && (
        <>
          <h3>What can you bring?</h3>
          <ProfileChoices
            cls={snapshot.class}
            profile={profile}
            onChange={setProfile}
            level={snapshot.level}
            abilities
          />
        </>
      )}
      {snapshot && step === 3 && (
        <>
          <div className="setup-review">
            <div>
              <small>Raid role</small>
              <strong>
                <RoleIcon role={profile.role} /> {label(profile.role)}
              </strong>
            </div>
            <div>
              <small>Specialization</small>
              <strong>{profile.spec}</strong>
            </div>
            <div>
              <small>Equipped items</small>
              <strong>{snapshot.gear.length}</strong>
            </div>
            <div>
              <small>Declared abilities</small>
              <strong>{profile.buffs.length}</strong>
            </div>
          </div>
          <p>
            {profile.buffs.length
              ? RAID_BUFFS.filter((b) => profile.buffs.includes(b.id))
                  .map((b) => b.name)
                  .join(" · ")
              : "No buffs declared yet. You can add them from your raid profile later."}
          </p>
          {snapshot.warnings
            .filter((w) => !w.includes("Choose a raid role"))
            .map((w) => (
              <p className="notice" key={w}>
                {w}
              </p>
            ))}
          <details className="details">
            <summary>
              Review equipment ({snapshot.gear.length}) & bag alternatives (
              {snapshot.bagGear.length})
            </summary>
            <div className="import-gear">
              {[...snapshot.gear, ...snapshot.bagGear].map((g, i) => (
                <div key={i}>
                  <span>
                    {i >= snapshot.gear.length ? "Bag · " : ""}
                    {label(g.slot)}
                  </span>
                  <strong>{g.name}</strong>
                  <small>#{g.id}</small>
                </div>
              ))}
            </div>
          </details>
          <p className="privacy-note">
            Your name, class, level, role, specialization and team appear on the
            public roster. Gear, original export and declared abilities are
            shared only with authorized members. Never include credentials or
            personal information.
          </p>
        </>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <span>
          {step > 0 ? (
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => {
                setStep(step - 1);
                setError("");
              }}
            >
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <small>Nothing is uploaded until you save.</small>
          )}
        </span>
        {step < 3 ? (
          <button className="btn primary" onClick={proceed}>
            Continue <ArrowRight size={16} />
          </button>
        ) : (
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await change({
                  type: "character.import",
                  characterId,
                  raw,
                  profile,
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : demo ? "Import into demo" : "Save character"}
          </button>
        )}
      </div>
    </div>
  );
}
