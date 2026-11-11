# Ønslaught

The raid headquarters for Ønslaught on WoW Forever. A responsive React application hosted on GitHub Pages, with shared guild data committed to this repository.

**[Open the war room](https://theforcebe.github.io/onslaught/)**

## What works

- **Roster and equipment:** paste or upload SimC exports, review before publication, inspect equipment, bags, modifiers, talents, professions, pet data, and original exports. The live roster starts empty; the demo uses fictional characters.
- **Raid planner:** multiple teams, configurable sizes and role targets, five-player groups, capacity validation, class colors and official class portraits.
- **Loot council:** verified item IDs and sources, class eligibility, member requests, ordered council priorities, current equipment comparison, immutable awards and written rationale.
- **Preparation:** per-raid or guild-stock consumable targets, attributed member commitments, progress and shortages.
- **Schedule:** raid events, going/tentative/absent responses, attendance lists, time-zone display, and UTC iCalendar downloads.
- **Progress:** configurable encounters, attempts, best remaining health, strategy notes and kill status.
- **History:** a revisioned data file, attributed audit entries, Git commits, conflict detection and idempotent requests.
- **Practice workspace:** an explicitly labeled sample guild with local, persisted edits. Demo data never enters the real roster.

## Shared editing today

The site reads `public/data/raid-state.json` from the main branch. Without the optional Battle.net gateway, a change opens a review screen and a prefilled GitHub submission. GitHub authenticates the submitting user. The `Validate guild submissions` workflow checks their permission against trusted repository data and commits accepted changes. It closes rejected submissions with an explanation. Refresh the site after acceptance.

The initial admin is **theforcebe**. In Guild settings, admins can invite GitHub usernames. Invited raiders can import their own characters, update their own profiles, RSVP, request loot and commit supplies. Admins configure teams, schedule events, assign ownership, set loot order, record awards and edit progression. Raiders do **not** need repository write access.

An import is a public character snapshot. It is not proof of in-game character ownership or simulated DPS. Guild admins handle ownership disputes. Equipment comparisons retain unknown data instead of inventing an upgrade score.

## Battle.net sign-in

A secure Cloudflare Worker gateway is implemented in `server/worker.ts`. It is **not active until configured** with Blizzard OAuth credentials, a repository-scoped GitHub credential, an identity pseudonymization key, and a private guild membership allowlist. See [deployment instructions](docs/DEPLOYMENT.md). The app never asks visitors for passwords or personal access tokens.

The gateway uses Battle.net for identity only. Automatic Battle.net armory synchronization and a Forever simulation engine are not implemented. No stable official Forever item API was verified during this build; the app uses a separate Forever-specific public database and preserves unknown variants.

## Run locally

Use Node 22.12 or later.

```sh
npm ci
npm run dev
```

Checks:

```sh
npm test
npm run check:data
npx tsc -p tsconfig.server.json
npm run build
node scripts/scan-secrets.mjs
npm audit
```

`npm run dev` starts at http://127.0.0.1:5173. Use **Live guild → Demo workspace** to exercise editing safely. Production uses the relative Vite base path, so project GitHub Pages URLs work without routing rewrites.

## Repository layout

- `src/`: interface, data schema, parser, shared permission rules and client integration.
- `public/data/raid-state.json`: canonical public guild records.
- `public/data/items.json`: cached public Forever metadata for illustrative item IDs, with provider status and timestamps.
- `src/lib/example.ts`: fictional parser fixture. No real player's export is bundled.
- `server/`: optional Battle.net gateway and private D1 auth schema.
- `scripts/process-issues.ts`: GitHub-authenticated shared changes.
- `.github/workflows/`: verified Pages publishing and guild submissions.
- `tests/`: import, permission, conflict, calendar and OAuth boundary tests.

## Data sources and limits

Item data is provided by **[TheWoWDB](https://thewowdb.com/developers/)**. The adapter calls only the `forever` namespace, limits request throughput, caches successful responses for one hour, and retains unresolved IDs. It never sends character exports or authentication credentials to the item service. See [data provenance](docs/DATA.md).

Class artwork is served by Blizzard’s official render host. World of Warcraft and its artwork belong to Blizzard Entertainment. This is an independent guild tool, not an official Blizzard product.

The JSON architecture is intended for one guild. It is deliberately conflict-detecting, not a real-time collaborative editor. Large histories or many guilds should move operational data to a database with repository snapshots. Source changes belong in pull requests; shared raid changes go through the validator.

Read [SECURITY.md](SECURITY.md) before configuring production credentials.
