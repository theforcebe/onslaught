import { useEffect, useRef, useState } from "react";
import "./raid-mobile.css";
import { ArrowLeft, ArrowRight, Check, Upload } from "lucide-react";
import { ClassIcon, Field, RoleIcon } from "./components";
import { Dropdown } from "./Dropdown";
import {
  CLASS_SPECS,
  buildKey,
  RAID_BUFFS,
  profileFor,
  validateProfile,
} from "./lib/raid";
import type { RaidProfile } from "./lib/raid";
import { label, makeId } from "./lib/model";
import type {
  Character,
  RaidBuild,
  RaidAction,
  Snapshot,
  WowClass,
} from "./lib/model";
import { importMismatch, parseSimc, sameImportedCharacter } from "./lib/parser";
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
  const [newSpec, setNewSpec] = useState("");
  const [newRole, setNewRole] = useState<RaidBuild["role"]>("melee");
  const [buffBuild, setBuffBuild] = useState("");
  const alternates = profile.alternateBuilds || [];
  const selectedAlt = alternates.find((b) => buildKey(b) === buffBuild);
  const buffs = selectedAlt ? selectedAlt.buffs || [] : profile.buffs;
  const roles = ["tank", "healer", "melee", "ranged"] as const;
  const added = { spec: newSpec || CLASS_SPECS[cls][0], role: newRole };
  const duplicate = [profile, ...alternates].some(
    (b) => buildKey(b) === buildKey(added),
  );
  const selectPrimary = (next: RaidProfile) => {
    const promoted = alternates.find((b) => buildKey(b) === buildKey(next));
    if (promoted && profile.spec && profile.role !== "unassigned") {
      onChange({
        ...next,
        buffs: promoted.buffs || [],
        alternateBuilds: [
          ...alternates.filter((b) => b !== promoted),
          { spec: profile.spec, role: profile.role, buffs: profile.buffs },
        ],
      });
    } else onChange(next);
  };
  if (abilities)
    return (
      <div className="profile-abilities">
        {!!alternates.length && (
          <Field label="Abilities for this build">
            <Dropdown
              label="Build for buff declarations"
              value={buildKey(selectedAlt || profile)}
              options={[profile, ...alternates].map((b) => ({
                value: buildKey(b),
                label: `${b.spec} · ${label(b.role)}`,
              }))}
              onChange={setBuffBuild}
            />
          </Field>
        )}
        <p className="muted">
          Select the abilities you have learned and can bring with this build.
          Leave unavailable talents unchecked. Your export does not prove these
          choices.
        </p>
        {RAID_BUFFS.filter((b) => b.cls === cls).map((b) => (
          <label
            className={`ability-choice ${buffs.includes(b.id) ? "chosen" : ""}`}
            key={b.id}
          >
            <input
              type="checkbox"
              checked={buffs.includes(b.id)}
              disabled={b.id === "spirit" && level < 30}
              onChange={(e) => {
                const updated = e.target.checked
                  ? [...buffs, b.id]
                  : buffs.filter((id) => id !== b.id);
                onChange(
                  selectedAlt
                    ? {
                        ...profile,
                        alternateBuilds: alternates.map((a) =>
                          a === selectedAlt ? { ...a, buffs: updated } : a,
                        ),
                      }
                    : { ...profile, buffs: updated },
                );
              }}
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
        <legend>Primary raid role</legend>
        <div className="role-choices">
          {roles.map((role) => (
            <button
              type="button"
              key={role}
              aria-pressed={profile.role === role}
              className={`role-choice ${role} ${profile.role === role ? "selected" : ""}`}
              onClick={() => selectPrimary({ ...profile, role })}
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
        <legend>Primary {label(cls)} specialization</legend>
        <div className="spec-choices">
          {CLASS_SPECS[cls].map((spec) => (
            <button
              type="button"
              className={profile.spec === spec ? "selected" : ""}
              aria-pressed={profile.spec === spec}
              key={spec}
              onClick={() => selectPrimary({ ...profile, spec })}
            >
              {spec}
              {profile.spec === spec && <Check size={16} />}
            </button>
          ))}
        </div>
      </fieldset>
      <details className="details" open={alternates.length > 0 || undefined}>
        <summary>
          Alternate specs &amp; roles
          {alternates.length ? ` (${alternates.length})` : ""}
        </summary>
        <p className="muted">
          Add the other builds you can bring. Pick one when you sign up for a
          raid.
        </p>
        <div className="spec-choices">
          {alternates.map((b) => (
            <button
              type="button"
              key={buildKey(b)}
              aria-label={`Remove ${b.spec} ${label(b.role)}`}
              onClick={() =>
                onChange({
                  ...profile,
                  alternateBuilds: alternates.filter((a) => a !== b),
                })
              }
            >
              {b.spec} · {label(b.role)} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Alternate specialization">
            <Dropdown
              label="Alternate specialization"
              value={added.spec}
              options={CLASS_SPECS[cls].map((spec) => ({
                value: spec,
                label: spec,
              }))}
              onChange={setNewSpec}
            />
          </Field>
          <Field label="Alternate role">
            <Dropdown
              label="Alternate raid role"
              value={newRole}
              options={roles.map((role) => ({
                value: role,
                label: label(role),
              }))}
              onChange={(v) => setNewRole(v as RaidBuild["role"])}
            />
          </Field>
        </div>
        <button
          type="button"
          className="btn secondary"
          disabled={duplicate || !profile.spec || profile.role === "unassigned"}
          onClick={() =>
            onChange({ ...profile, alternateBuilds: [...alternates, added] })
          }
        >
          {duplicate ? "Build already selected" : "Add alternate build"}
        </button>
      </details>
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
  candidates,
  character,
  change,
  demo,
  switchCharacter,
}: {
  candidates: Character[];
  character?: Character;
  change: (a: RaidAction) => void | Promise<void>;
  demo: boolean;
  switchCharacter?: () => void;
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
  const setup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setup.current?.closest(".modal-body")?.scrollTo({ top: 0 });
    setup.current?.closest("dialog")?.scrollTo({ top: 0 });
  }, [step]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const proceed = () => {
    try {
      if (step === 0) {
        const parsed = parseSimc(raw);
        const existing =
          character || candidates.find((c) => sameImportedCharacter(c, parsed));
        const mismatch = existing && importMismatch(existing, parsed);
        if (mismatch) throw new Error(mismatch);
        setSnapshot(parsed);
        setCharacterId(existing?.id || makeId());
        const initialProfile = existing
          ? profileFor(existing)
          : profileFor({
              class: parsed.class,
              role: "unassigned",
              spec: parsed.spec,
              buffs: [],
            });
        setProfile(initialProfile);
        if (
          existing &&
          !validateProfile(parsed.class, initialProfile, parsed.level)
        ) {
          setStep(3);
          setError("");
          return;
        }
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
    <div className="character-setup" ref={setup}>
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
            Equip your gear in WoW Forever, type <code>/simc</code>, then paste
            the export or choose its file.
            {character &&
              " You’ll review the update with your saved raid build."}
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
                  try {
                    setRaw(await file.text());
                    setError("");
                  } catch {
                    setError(
                      "This file could not be read. Choose it again or paste your export.",
                    );
                  }
                }}
              />
            </label>
            {demo && (
              <button
                className="btn text"
                onClick={() => {
                  setRaw(EXAMPLE_EXPORT);
                  setError("");
                }}
              >
                Load fictional example
              </button>
            )}
            {switchCharacter && (
              <button className="btn text" onClick={switchCharacter}>
                Choose another character
              </button>
            )}
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
          <button
            className="btn text"
            onClick={() => {
              setError("");
              setStep(1);
            }}
          >
            Edit role, spec &amp; buffs
          </button>
          {!!profile.alternateBuilds?.length && (
            <p>
              <strong>Alternate builds</strong> ·{" "}
              {profile.alternateBuilds
                .map((b) => `${b.spec} (${label(b.role)})`)
                .join(", ")}
            </p>
          )}
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
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not save your character. Try again.",
                );
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
