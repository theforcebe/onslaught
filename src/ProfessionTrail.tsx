import { useState } from "react";
import type { Ref } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Select } from "./Dropdown";
import "./profession-trail.css";

const version = "0.3.0";
const archive = `ProfessionTrail-${version}.zip`;
const professions = [
  "Alchemy",
  "Blacksmithing",
  "Cooking",
  "Enchanting",
  "Engineering",
  "First Aid",
  "Fishing",
  "Herbalism",
  "Leatherworking",
  "Lockpicking",
  "Mining",
  "Skinning",
  "Tailoring",
];

export function ProfessionTrail({
  headingRef,
}: {
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const [profession, setProfession] = useState("Leatherworking");
  const [copied, setCopied] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const command = `/ptrail track ${profession.toLowerCase()}`;
  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <article className="profession-trail">
      <header className="trail-release">
        <img
          className="trail-map-icon"
          src={`${import.meta.env.BASE_URL}art/profession-trail-map.jpg`}
          width="56"
          height="56"
          alt=""
        />
        <div className="trail-release-title">
          <p>WoW Forever addon · v{version}</p>
          <h1 ref={headingRef} tabIndex={-1}>
            Profession Trail
          </h1>
          <p>
            Level professions from 1 to 300 with a Horde field guide that tracks
            your skill, materials, and next farming stop.
          </p>
        </div>
        <div className="trail-download">
          <a
            className="btn primary"
            href={`${import.meta.env.BASE_URL}downloads/${archive}`}
            download={archive}
          >
            <Download size={18} aria-hidden="true" /> Download Profession Trail
          </a>
          <small>ZIP · 56.4 KiB · Forever 1.60.1</small>
        </div>
      </header>

      <div className="trail-start">
        <section aria-labelledby="trail-install">
          <h2 id="trail-install">Install the addon</h2>
          <ol className="trail-steps">
            <li>
              On the computer where you play, extract the ZIP into{" "}
              <code className="trail-path">
                World of Warcraft/
                <wbr />
                _forever_/
                <wbr />
                Interface/
                <wbr />
                AddOns/
              </code>
              .
            </li>
            <li>
              Open the extracted <code>ProfessionTrail</code> folder. You should
              see <code>ProfessionTrail.toc</code> directly inside it.
            </li>
            <li>
              At character selection, open <strong>AddOns</strong>, enable{" "}
              <strong>Profession Trail</strong>, and enter the world. If it’s
              missing, check the folder and restart WoW.
            </li>
          </ol>
        </section>
        <section aria-labelledby="trail-play">
          <h2 id="trail-play">Follow your first step</h2>
          <p>
            Type <code>/ptrail</code> in game, choose a profession, and select{" "}
            <strong>Pin tracker</strong>. The tracker starts at your current
            skill and advances when you reach the next skill band.
          </p>
          <label className="trail-profession">
            <span>Shortcut for your profession</span>
            <Select
              value={profession}
              onChange={(e) => {
                setProfession(e.target.value);
                setCopied("");
                setCopyFailed(false);
              }}
            >
              {professions.map((name) => (
                <option key={name} value={name}>
                  {name === "Lockpicking" ? "Lockpicking (Rogue)" : name}
                </option>
              ))}
            </Select>
          </label>
          <div className="trail-command">
            <code>{command}</code>
            <button
              type="button"
              className="btn secondary"
              onClick={copyCommand}
              aria-label="Copy tracker command"
            >
              {copied === command ? <Check size={16} /> : <Copy size={16} />}
              {copied === command ? "Copied" : "Copy"}
            </button>
          </div>
          <span
            role="status"
            className={copyFailed ? "trail-copy-help" : "sr-only"}
          >
            {copyFailed
              ? "Select the command above and copy it manually."
              : copied === command
                ? "Tracker command copied."
                : ""}
          </span>
          <p className="trail-hint">
            Drag the tracker’s header to move it, click it to reopen the guide,
            or right-click to unpin. Use <code>/ptrail reset</code> to recenter
            both windows.
          </p>
        </section>
      </div>

      <section className="trail-reference" aria-labelledby="trail-field-guide">
        <h2 id="trail-field-guide">Using the field guide</h2>
        <details>
          <summary>Plan materials and check your alts</summary>
          <p>
            In <strong>Supplies</strong>, enter a start and target skill and
            click <strong>Plan range</strong>. Choose{" "}
            <strong>Live to target</strong> to recalculate as you level.
            Quantities are estimates because individual crafts can give
            different skill gains.
          </p>
          <p>
            <strong>Character</strong> counts what you carry.{" "}
            <strong>Account</strong> also includes transferable materials from
            eligible alts. Log in on each alt with the addon enabled to refresh
            its snapshot, then check <strong>Bags</strong> for its contents and
            last update. Bank, mail, and auction stock are excluded.
          </p>
        </details>
        <details>
          <summary>Find a farm, vendor, or trainer</summary>
          <p>
            Click a material in the tracker to expand its sources, then choose a
            destination. With <strong>TomTom</strong> enabled, you get an arrow
            and minimap pin. The guide can also use Blizzard waypoints or the
            world map. Type <code>/ptrail clear</code> to remove the guide’s
            destination.
          </p>
          <p>
            Open <strong>Route</strong> to preview later recipes, trainers, and
            farm locations. Choose <strong>Return to live step</strong> to
            resume. Directions favor Horde characters on PvE realms.
          </p>
        </details>
        <details>
          <summary>Choose a recipe and craft a batch</summary>
          <p>
            Open your profession book to refresh learned recipes. In{" "}
            <strong>Step</strong>, use <strong>Change recipe</strong> when a
            skill band offers alternatives. Bring the ingredients to the
            character doing the crafting.
          </p>
          <p>
            On the tracker, use <strong>+</strong> or <strong>−</strong> to
            choose a quantity, then click the recipe or <strong>Craft</strong>.
            Shift-click <strong>+</strong> for the current maximum.{" "}
            <strong>Stop queue</strong> cancels pending repeats. Check your
            skill afterward and start another batch if needed.
          </p>
        </details>
      </section>
    </article>
  );
}
