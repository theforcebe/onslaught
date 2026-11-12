import { hasSection, type Access, type Section } from "./access";

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
  return ["overview", "roster", "planner", "schedule", "access"].includes(page);
}
