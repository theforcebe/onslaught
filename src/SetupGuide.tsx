import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  CalendarCheck,
  Check,
  ChevronRight,
  Compass,
  ExternalLink,
  MessageSquare,
  Package,
  Shield,
  Swords,
  UserPlus,
} from "lucide-react";
import { Modal } from "./components";
import {
  canSeeCharacter,
  hasSection,
  RANK_NAMES,
  type Access,
} from "./lib/access";
import { discordCall } from "./lib/api";
import type { Character, Identity, RaidState } from "./lib/model";
import { guildRoute, raidRoute, type HelpTopic } from "./lib/navigation";
import { upcomingRaid } from "./lib/upcoming-raid";
import "./setup-guide.css";

const addonUrl = "https://www.curseforge.com/wow/addons/simulationcraft";
const titles = [
  "Battle.net",
  "Membership",
  "Character",
  "Discord",
  "Raid sign-up",
];
export function SetupGuide({
  state,
  access,
  identity,
  go,
  signIn,
  join,
  importCharacter,
  openChat,
  linkedTopic,
  demo,
}: {
  state: RaidState;
  access: Access;
  identity?: Identity;
  go: (id: string) => void;
  signIn: () => void;
  join: () => Promise<void>;
  importCharacter: (character?: Character) => void;
  openChat: () => void;
  linkedTopic?: HelpTopic | "";
  demo: boolean;
}) {
  const [mode, setMode] = useState<"setup" | "help" | null>(null);
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState<HelpTopic | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState("");
  const [discordStatus, setDiscordStatus] = useState<
    "unknown" | "linked" | "available"
  >("unknown");
  const active = access.status === "active";
  const signedIn = !!identity || demo;
  const owns = state.characters.filter(
    (c) => demo || (!!identity && c.ownerBattleNet === identity.id),
  );
  const editable = owns.filter(
    (c) => demo || canSeeCharacter(access, c, identity),
  );
  const gear = hasSection(access, "gear");
  const raid = upcomingRaid(state.events);
  const responded = !!raid && owns.some((c) => !!raid.signups[c.id]);
  const statuses = [
    signedIn,
    active,
    !!owns.length,
    discordStatus === "linked",
    responded,
  ];
  const recommended = !signedIn ? 0 : !active ? 1 : !owns.length ? 2 : 4;
  const accountKey = identity ? "onslaught:welcome:v2:" + identity.id : "";
  const welcomeKey =
    !accountKey ||
    demo ||
    access.status === "visitor" ||
    access.status === "suspended"
      ? ""
      : active
        ? accountKey
        : accountKey + ":membership";
  const prompted = useRef("");
  useEffect(() => {
    if (!welcomeKey || prompted.current === welcomeKey) return;
    const route = guildRoute(window.location.hash);
    if (route.helpTopic !== undefined || (active && route.raidId)) return;
    prompted.current = welcomeKey;
    try {
      if (localStorage.getItem(welcomeKey)) return;
      localStorage.setItem(welcomeKey, "seen");
    } catch {
      /* The guide still works for this visit. */
    }
    setStep(recommended);
    setMode("setup");
  }, [welcomeKey, recommended, active]);
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (linkedTopic !== undefined) {
      setTopic(linkedTopic || null);
      setMode("help");
      openedFromLink.current = true;
    } else if (openedFromLink.current) {
      setMode(null);
      openedFromLink.current = false;
    }
  }, [linkedTopic]);
  useEffect(() => {
    if (!mode || !active || demo) return;
    let current = true;
    void discordCall("status")
      .then((r) => {
        if (current) setDiscordStatus(r.ownLink ? "linked" : "available");
      })
      .catch(() => {
        if (current) setDiscordStatus("unknown");
      });
    return () => {
      current = false;
    };
  }, [mode, active, demo, identity?.id]);

  const leave = (action: () => void) => {
    setMode(null);
    action();
  };
  const button = (text: string, action: () => void) => (
    <button className="btn secondary" onClick={() => leave(action)}>
      {text}
      <ChevronRight size={15} />
    </button>
  );
  const membershipLink = () => go("access");
  const membership = (
    <>
      <p>
        {active
          ? `Your membership is approved${access.role ? " as " + RANK_NAMES[access.role] : ""}. Your membership page lists the sections and teams you can open.`
          : access.status === "pending"
            ? "Your request is with the guild admins. You can browse the roster and raid schedule while you wait. After approval, this guide picks up with your next step."
            : access.status === "suspended"
              ? "Your membership is suspended. Contact a guild admin to review your access."
              : signedIn
                ? "Send your BattleTag to the guild admins for approval. They assign your rank and the teams and sections you can access."
                : "Sign in with Battle.net first. Then request membership here so an admin can approve your account."}
      </p>
      {!signedIn ? (
        button("Sign in with Battle.net", signIn)
      ) : access.status === "unregistered" ? (
        <button
          className="btn primary"
          disabled={sending}
          onClick={async () => {
            setFailure("");
            setSending(true);
            try {
              await join();
            } catch (error) {
              setFailure((error as Error).message);
            } finally {
              setSending(false);
            }
          }}
        >
          <UserPlus size={16} />
          {sending ? "Sending request…" : "Request membership"}
        </button>
      ) : (
        button("View membership", membershipLink)
      )}
      {failure && (
        <p role="alert" className="notice danger">
          {failure}
        </p>
      )}
    </>
  );
  const membershipGate = (
    <>
      <p>
        {signedIn
          ? "Guild membership approval unlocks this feature."
          : "Sign in and request guild membership to get started."}
      </p>
      <button
        className="btn secondary"
        onClick={() => {
          setMode("setup");
          setStep(signedIn ? 1 : 0);
        }}
      >
        {signedIn ? "Check my membership" : "Get started"}
      </button>
    </>
  );
  const character = (
    <>
      <ol>
        <li>
          Install Simulationcraft for <strong>WoW Forever</strong> and enable
          the addon on the character selection screen.{" "}
          <a href={addonUrl} target="_blank" rel="noreferrer">
            Get Simulationcraft <ExternalLink size={12} />
          </a>
        </li>
        <li>
          Equip your raid gear, type <code>/simc</code> in game and copy the
          full export.
        </li>
        <li>
          Paste it into the importer or choose a saved export. Select your
          primary spec and role, add any alternate builds, check your learned
          buffs, then review and save.
        </li>
      </ol>
      {active && gear ? (
        <>
          {!!editable.length && (
            <div className="field-guide-characters">
              <strong>Update an existing character</strong>
              {editable.map((c) => (
                <button
                  key={c.id}
                  className="btn secondary"
                  onClick={() => leave(() => importCharacter(c))}
                >
                  Update {c.name}
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          )}
          {!owns.length && (
            <p>
              If an officer already added your character to the roster, ask an
              admin to link it to your Battle.net account.
            </p>
          )}
          {editable.length < owns.length && (
            <p>
              Ask an admin for access to the raid team of any character missing
              from this update list.
            </p>
          )}
          {button(
            owns.length ? "Import another character" : "Import my character",
            () => importCharacter(),
          )}
        </>
      ) : active ? (
        <>
          <p>
            Ask an admin for Gear &amp; character notes access to import an
            export. They can also link an existing roster character to you.
          </p>
          {button("View membership", membershipLink)}
        </>
      ) : (
        membershipGate
      )}
    </>
  );
  const discord = active ? (
    <>
      <p>
        {discordStatus === "linked"
          ? "Your Discord account is linked. You can manage material-request DMs in Discord connection."
          : "Open Discord connection, choose Link my Discord and authorize the same Discord account you use in the guild server. You can turn on material-request DMs there."}
      </p>
      <p>
        For copies of private site messages, enable Discord forwarding in Guild
        chat notification settings.
      </p>
      {button("Open Discord connection", () => go("discord"))}
    </>
  ) : (
    membershipGate
  );
  const signup = (
    <>
      {raid ? (
        <p>
          <strong>{raid.title}</strong> is the next raid on the board. Open it
          in Raid planner and find <strong>Your availability</strong>.
        </p>
      ) : (
        <p>
          There are no upcoming raids on the schedule. New raid nights appear in
          Raid planner and on the overview board.
        </p>
      )}
      <p>
        Pick your character and build for the night. Choose{" "}
        <strong>Going</strong>, <strong>Maybe</strong> or{" "}
        <strong>Can’t make it</strong>. Return to the same raid to change your
        answer. Going adds you to the confirmed pool for lineup placement.
      </p>
      {active && !owns.length && (
        <p>
          You need a character linked to your Battle.net account to respond.
          Import yours or ask an admin to link an existing roster entry.
        </p>
      )}
      {button(raid ? "Open " + raid.title : "Open raid planner", () =>
        go(raid ? raidRoute(raid.id) : "planner"),
      )}
    </>
  );
  const content = [
    <>
      <p>
        {signedIn
          ? `Signed in${identity ? " as " + identity.label : ""}. Your membership and raid characters are associated with this account.`
          : "Sign in with Battle.net. Blizzard will return you to the guild site, where you can request membership."}
      </p>
      {!signedIn && button("Sign in with Battle.net", signIn)}
    </>,
    membership,
    character,
    discord,
    signup,
  ];
  const materials = active ? (
    <>
      <p>
        Choose <strong>New request</strong>, search for the item and enter a
        quantity.{" "}
        {access.admin ||
        (access.role === "officer" && hasSection(access, "consumables"))
          ? "Choose a recipient or leave the request open to volunteers."
          : "Anyone in the guild can volunteer to fulfill it."}
      </p>
      <p>
        To help someone, open <strong>Up for grabs</strong> and choose{" "}
        <strong>I’ll take this</strong>. In <strong>My requests</strong>, choose{" "}
        <strong>Update delivery</strong> to record how much you delivered.
      </p>
      {button("Open material requests", () => go("materials"))}
    </>
  ) : (
    membershipGate
  );
  const chat =
    active && !demo ? (
      <>
        <p>
          Use General for the guild or select a member for a private
          conversation. Type <strong>@</strong> in General to mention someone.
          Use chat notification settings for sound and Discord forwarding.
        </p>
        {button("Open guild chat", openChat)}
      </>
    ) : demo ? (
      <p>Guild chat is available in the live guild.</p>
    ) : (
      membershipGate
    );
  const topics: [HelpTopic, string, ReactNode, ReactNode][] = [
    ["character", "Import or update my character", <Swords />, character],
    ["raid", "Sign up or change my availability", <CalendarCheck />, signup],
    [
      "materials",
      "Request, claim or deliver materials",
      <Package />,
      materials,
    ],
    ["discord", "Connect Discord and manage DMs", <MessageSquare />, discord],
    ["chat", "Chat with guild members", <MessageSquare />, chat],
    ["membership", "Request or check my membership", <Shield />, membership],
  ];
  return (
    <>
      <button
        className="guide-nav"
        onClick={() => {
          setStep(recommended);
          setMode(active ? "help" : "setup");
        }}
      >
        <Compass size={18} /> Getting started &amp; help
      </button>
      {mode &&
        createPortal(
          <Modal
            title="Guild field guide"
            className="field-guide"
            onClose={() => {
              setMode(null);
              if (linkedTopic !== undefined) go("overview");
            }}
          >
            <nav className="field-guide-tabs" aria-label="Guide sections">
              <button
                aria-pressed={mode === "setup"}
                onClick={() => setMode("setup")}
              >
                <Compass size={16} /> Getting started
              </button>
              <button
                aria-pressed={mode === "help"}
                onClick={() => setMode("help")}
              >
                <BookOpen size={16} /> Quick help
              </button>
            </nav>
            {mode === "setup" ? (
              <>
                <ol className="field-guide-steps" aria-label="Setup progress">
                  {titles.map((title, i) => (
                    <li key={title}>
                      <button
                        aria-label={title + (statuses[i] ? ", complete" : "")}
                        aria-current={step === i ? "step" : undefined}
                        onClick={() => setStep(i)}
                      >
                        <span>{statuses[i] ? <Check size={14} /> : i + 1}</span>
                        <span className="field-guide-step-name">{title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <article className="field-guide-content">
                  <small>
                    Step {step + 1} of {titles.length}
                    {step === 3 ? " · Optional" : ""}
                  </small>
                  <h3>
                    {
                      [
                        "Connect Battle.net",
                        access.status === "pending"
                          ? "Waiting for approval"
                          : "Join the guild",
                        "Set up your raid character",
                        "Link your Discord account",
                        "Choose your raid night",
                      ][step]
                    }
                  </h3>
                  {content[step]}
                </article>
                <div className="field-guide-controls">
                  {step > 0 && (
                    <button
                      className="btn text"
                      onClick={() => setStep(step - 1)}
                    >
                      Back
                    </button>
                  )}
                  {step === 4 ? (
                    <button
                      className="btn secondary"
                      onClick={() => setMode(null)}
                    >
                      Finish guide <Check size={15} />
                    </button>
                  ) : (
                    <button
                      className="btn secondary"
                      onClick={() => setStep(step + 1)}
                    >
                      Next step <ChevronRight size={15} />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="field-guide-topics">
                {topics.map(([id, title, icon, contents]) => (
                  <section key={id}>
                    <button
                      className="field-guide-topic"
                      aria-expanded={topic === id}
                      aria-controls={"guide-" + id}
                      onClick={() => setTopic(topic === id ? null : id)}
                    >
                      {icon}
                      {title}
                      <ChevronRight size={16} />
                    </button>
                    <div
                      id={"guide-" + id}
                      hidden={topic !== id}
                      className="field-guide-content"
                    >
                      {topic === id && (
                        <>
                          {contents}
                          <a
                            className="field-guide-permalink"
                            href={"#help?topic=" + id}
                          >
                            Link to this help topic
                          </a>
                        </>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </Modal>,
          document.body,
        )}
    </>
  );
}
