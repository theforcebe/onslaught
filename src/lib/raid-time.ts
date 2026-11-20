/** Wall-clock minutes for a named IANA zone, independent of the viewer's device. */
export function zonedMinute(instant: number | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** A spring-forward minute has no instant; a fall-back minute has two. */
export function instantsForMinute(wall: string, timeZone: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(wall)) return [];
  const nominal = Date.parse(wall + ":00Z");
  if (!Number.isFinite(nominal)) return [];
  const day = 86400000;
  const candidates = new Set<number>();
  for (const sample of [nominal - day, nominal, nominal + day]) {
    const offset = Date.parse(zonedMinute(sample, timeZone) + ":00Z") - sample;
    const instant = nominal - offset;
    if (zonedMinute(instant, timeZone) === wall) candidates.add(instant);
  }
  return [...candidates]
    .sort((a, b) => a - b)
    .map((ms) => new Date(ms).toISOString());
}
