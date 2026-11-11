import { writeFileSync } from "node:fs";
import { StateSchema } from "../src/lib/model";
const state = StateSchema.parse({
  schemaVersion: 1,
  revision: 0,
  guild: {
    name: "Ønslaught",
    realm: "WoW Forever guild",
    region: "US",
    timeZone: "America/Los_Angeles",
    adminsGithub: [],
    membersGithub: [],
  },
  characters: [],
  teams: [],
  events: [],
  loot: [],
  supplies: [],
  bosses: [],
  audit: [],
  processedRequests: [],
});
writeFileSync(
  "public/data/raid-state.json",
  JSON.stringify(state, null, 2) + "\n",
);
