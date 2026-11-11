import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Compass } from "lucide-react";
import type { Access } from "./lib/access";
import type { Identity, RaidState } from "./lib/model";
import { Modal } from "./components";
import { discordCall } from "./lib/api";
export function SetupGuide({
  state,
  access,
  identity,
  go,
  signIn,
  importCharacter,
  demo,
}: {
  state: RaidState;
  access: Access;
  identity?: Identity;
  go: (id: string) => void;
  signIn: () => void;
  importCharacter: () => void;
  demo: boolean;
}) {
  const key = `onslaught:welcome:v2:${identity?.id || "visitor"}`,
    [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [linked, setLinked] = useState(false);
  useEffect(() => {
    if (!demo && identity && access.status === "active") {
      try {
        if (!localStorage.getItem(key)) setOpen(true);
      } catch {}
    }
  }, [key, access.status, demo, identity?.id]);
  useEffect(() => {
    if (open && !demo && access.status === "active")
      void discordCall("status")
        .then((r) => setLinked(!!r.ownLink))
        .catch(() => {});
  }, [open, access.status, demo]);
  const own = state.characters.filter(
    (c) => !!identity && c.ownerBattleNet === identity.id,
  );
  const responded = state.events.some((e) =>
    own.some((c) => !!e.signups[c.id]),
  );
  const steps = [
    {
      title: "Connect Battle.net",
      body: "Use Battle.net sign in to connect your account. Sign-in happens on Blizzard’s page. Your password never enters Ønslaught, and refreshing the page keeps your active session.",
      done: !!identity,
      action: "Sign in with Battle.net",
      run: signIn,
    },
    {
      title: "Join the guild",
      body: "Open Members & access and request membership. An admin approves your rank and the private sections and raid teams you can see. Approved members can always set their own availability and help with volunteer requests.",
      done: access.status === "active",
      action: "View my membership",
      run: () => go("access"),
    },
    {
      title: "Set up your character",
      body: "Import your SimC export from the game. The guided import asks for your specialization, raid role, and learned buffs. Already on the roster? Ask an admin to link that character to your account. Your own character is needed to respond to raids. If importing is locked, ask an admin for Gear & character notes access.",
      done: !!own.length,
      action: "Import my character",
      run: importCharacter,
    },
    {
      title: "Link Discord",
      body: "Open Discord connection in Guild coordination and choose Link my Discord. Use the account in the guild server. You can optionally enable direct messages for requests assigned to you; channel notifications work without DM opt-in.",
      done: linked,
      action: "Open Discord connection",
      run: () => go("discord"),
    },
    {
      title: "Choose your raid nights",
      body: "In Raid planner, select the team and raid night. Set Going, Maybe, or Can’t make it beside your character. Going puts you in the confirmed pool; your admin places raiders into groups. Use Night polls in the same planner to vote on future raid times.",
      done: responded,
      action: "Set my availability",
      run: () => go("planner"),
    },
  ];
  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(key, "seen");
    } catch {}
  };
  return (
    <>
      <button
        className="guide-nav"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
      >
        <Compass size={18} />
        Getting started<span>{steps.filter((s) => s.done).length}/5</span>
      </button>
      {open && (
        <Modal title="Welcome to the war room" onClose={dismiss}>
          <p className="muted">
            Five steps to get raid-ready. Reopen this guide any time from the
            sidebar.
          </p>
          <div className="guide-steps">
            {steps.map((s, i) => (
              <button
                key={s.title}
                className={step === i ? "active" : ""}
                aria-current={step === i ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                <span>{s.done ? <CheckCircle2 size={17} /> : i + 1}</span>
                {s.title}
              </button>
            ))}
          </div>
          <article className="guide-detail">
            <span className="eyebrow">
              STEP {step + 1} OF 5 {steps[step].done ? "· COMPLETE" : ""}
            </span>
            <h2>{steps[step].title}</h2>
            <p>{steps[step].body}</p>
            <button
              className="btn primary"
              onClick={() => {
                dismiss();
                steps[step].run();
              }}
            >
              {steps[step].action}
              <ChevronRight size={16} />
            </button>
          </article>
          <div className="form-actions">
            <button className="btn text" onClick={dismiss}>
              Continue later
            </button>
            {step < 4 ? (
              <button
                className="btn secondary"
                onClick={() => setStep(step + 1)}
              >
                Next step
                <ChevronRight size={15} />
              </button>
            ) : (
              <button className="btn secondary" onClick={dismiss}>
                Finish guide
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
