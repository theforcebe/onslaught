import type { RaidEvent } from "./model";

export function upcomingRaid(events: RaidEvent[], now = Date.now()) {
  return events
    .filter((event) => Date.parse(event.end) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
}

export function countAttendance(event: RaidEvent) {
  const counts = { going: 0, tentative: 0, absent: 0 };
  for (const status of Object.values(event.signups)) counts[status]++;
  return { eventId: event.id, ...counts };
}
