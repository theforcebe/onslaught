import type { Character, RaidEvent } from "../src/lib/model";
import { discordLine, raidSignupEmbed } from "./raid-chart";

export const raidUrl = (eventId: string) =>
  "https://theforcebe.github.io/onslaught/#planner?raid=" +
  encodeURIComponent(eventId);
export const calendarUrl = (guild: string, event: string) =>
  "https://discord.com/events/" + guild + "/" + event;
export const attendanceLabels = {
  going: "Going",
  tentative: "Maybe",
  absent: "Can't make it",
} as const;

export function raidMessageBody(
  event: RaidEvent,
  characters: readonly Character[],
  visibleIds: ReadonlySet<string>,
  interactive: boolean,
  scheduledId: string | null,
  guildId: string,
) {
  const buttons: Array<Record<string, unknown>> = interactive
    ? Object.entries(attendanceLabels).map(([status, label]) => ({
        type: 2,
        style: status === "going" ? 3 : status === "absent" ? 4 : 2,
        label,
        custom_id: "raid:chart:" + status,
      }))
    : [];
  buttons.push({
    type: 2,
    style: 5,
    label: interactive ? "Open raid planner" : "Sign up in Ønslaught",
    url: raidUrl(event.id),
  });
  if (scheduledId)
    buttons.push({
      type: 2,
      style: 5,
      label: "Discord event",
      url: calendarUrl(guildId, scheduledId),
    });
  const stamp = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  return {
    content: [
      "**" + discordLine(event.title, 240) + "**",
      discordLine(event.instance, 240),
      `<t:${stamp(event.start)}:F> – <t:${stamp(event.end)}:t>`,
      interactive
        ? "Choose your availability below. Click again to change your role. Website and Discord signups list your character and class in this channel unless you hide your name in the planner."
        : "Open the raid planner to set your availability for this night.",
      scheduledId ? "Discord’s Interested button sets a reminder." : "",
    ]
      .filter(Boolean)
      .join("\n"),
    embeds: [raidSignupEmbed(event, characters, visibleIds)],
    allowed_mentions: { parse: [] },
    components: [{ type: 1, components: buttons }],
  };
}
