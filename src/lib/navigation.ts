import { hasSection, type Access, type Section } from "./access";

const helpTopics = [
  "character",
  "raid",
  "materials",
  "discord",
  "chat",
  "membership",
] as const;
export type HelpTopic = (typeof helpTopics)[number];
export function guildRoute(hash: string): {
  page: string;
  hubTab: string;
  raidId: string;
  helpTopic?: HelpTopic | "";
} {
  const [name, query] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const page =
    name === "schedule"
      ? "planner"
      : name === "materials" || name === "discord"
        ? "community"
        : name === "help"
          ? "overview"
          : name || "overview";
  return {
    page,
    helpTopic:
      name === "help"
        ? helpTopics.find((t) => t === params.get("topic")) || ""
        : undefined,
    hubTab:
      name === "materials"
        ? "requests"
        : name === "discord"
          ? "connection"
          : "",
    raidId: page === "planner" ? params.get("raid") || "" : "",
  };
}
export const raidRoute = (id: string) =>
  "planner?raid=" + encodeURIComponent(id);

const privatePages: Record<string, Section> = {
  polls: "attendance",
  loot: "loot",
  consumables: "consumables",
  progress: "progress",
};

export function canOpenPage(access: Access, page: string) {
  if (page === "activity" || page === "settings")
    return access.status === "active" && access.admin;
  if (page === "community") return access.status === "active";
  if (privatePages[page]) return hasSection(access, privatePages[page]);
  // Roster and schedule are public; access is a personal membership screen for non-admins.
  return [
    "overview",
    "roster",
    "planner",
    "schedule",
    "access",
    "profession-trail",
  ].includes(page);
}
