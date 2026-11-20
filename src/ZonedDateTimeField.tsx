import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dropdown } from "./Dropdown";
import { instantsForMinute, zonedMinute } from "./lib/raid-time";

export function ZonedDateTimeField({
  label,
  name,
  timeZone,
  initial,
  required = true,
}: {
  label: string;
  name: string;
  timeZone: string;
  initial?: string;
  required?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [wall, setWall] = useState(() =>
    initial ? zonedMinute(initial, timeZone) : "",
  );
  const [chosen, setChosen] = useState(initial || "");
  const candidates = useMemo(
    () => instantsForMinute(wall, timeZone),
    [wall, timeZone],
  );
  // Preserve the original seconds on a title-only edit and the occurrence in a repeated hour.
  const match = candidates.find(
    (c) => Math.floor(Date.parse(chosen) / 60000) === Date.parse(c) / 60000,
  );
  const instant = match ? chosen : candidates[0] || "";
  const error =
    wall && !instant
      ? `That time does not exist in ${timeZone}. Choose a time after or before the clock change.`
      : "";
  useLayoutEffect(() => {
    input.current?.setCustomValidity(error);
  }, [error]);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        type="datetime-local"
        value={wall}
        required={required}
        onChange={(e) => setWall(e.target.value)}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? id + "-error" : undefined}
      />
      <input type="hidden" name={name} value={instant} />
      {error && (
        <small id={id + "-error"} role="alert">
          {error}
        </small>
      )}
      {candidates.length > 1 && (
        <Dropdown
          label={`${label} · repeated hour`}
          value={match || candidates[0]}
          onChange={setChosen}
          options={candidates.map((value, index) => ({
            value,
            label: `${index === 0 ? "First" : "Second"} occurrence · ${new Intl.DateTimeFormat(
              undefined,
              {
                timeZone,
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "shortOffset",
              },
            ).format(new Date(value))}`,
          }))}
        />
      )}
    </div>
  );
}
