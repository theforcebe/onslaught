import { readFileSync } from "node:fs";
import { StateSchema } from "../src/lib/model";
const s = StateSchema.parse(
  JSON.parse(readFileSync("public/data/raid-state.json", "utf8")),
);
for (const collection of [
  s.characters,
  s.teams,
  s.events,
  s.loot,
  s.supplies,
  s.bosses,
])
  if (new Set(collection.map((x) => x.id)).size !== collection.length)
    throw new Error("Duplicate entity IDs");
if (new Set(s.processedRequests).size !== s.processedRequests.length)
  throw new Error("Duplicate request IDs");
for (const c of s.characters) {
  if (c.teamId && !s.teams.some((t) => t.id === c.teamId))
    throw new Error("Unknown team");
}
console.log(
  `Validated guild revision ${s.revision}: ${s.characters.length} characters, ${s.teams.length} teams.`,
);
