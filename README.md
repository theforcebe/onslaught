# Ønslaught

The raid headquarters for Ønslaught on WoW Forever. A responsive React app on GitHub Pages, with Battle.net identity and shared guild records versioned in a separate private repository.

**[Open the war room](https://theforcebe.github.io/onslaught/)**

## What works

- **Roster and equipment:** paste or upload SimC exports, review before saving, inspect equipment, bags, modifiers, talents, professions, pet data, and original exports. Roster basics are public; gear and raw exports require permission. The live roster starts empty; the demo uses fictional characters.
- **Raid planner:** multiple teams, configurable sizes and role targets, five-player groups, capacity validation, class colors and official class portraits.
- **Loot council:** verified item IDs and sources, class eligibility, member requests, ordered council priorities, current equipment comparison, immutable awards and written rationale.
- **Preparation:** per-raid or guild-stock consumable targets, attributed member commitments, progress and shortages.
- **Schedule:** raid events, going/tentative/absent responses, attendance lists, time-zone display, and UTC iCalendar downloads.
- **Progress:** configurable encounters, attempts, best remaining health, strategy notes and kill status.
- **History:** a revisioned data file, attributed audit entries, Git commits, conflict detection and idempotent requests.
- **Practice workspace:** an explicitly labeled sample guild with local, persisted edits. Demo data never enters the real roster.
- **Members & access:** verified membership requests, admin approval, section permissions, selected raid teams, suspension and private audit history. Structural edits remain admin-only.

## Shared editing and visibility

Canonical data lives in **theforcebe/onslaught-data**, a private repository. The Worker returns a filtered view for every request and commits validated edits privately. The public roster contains names, classes, levels, roles, specs and team names. The public schedule contains raid titles, instances, teams and times. Equipment, imports, plans, notes, attendance and member identities never enter the public build.

After gateway activation, raiders sign in with Battle.net and request membership. Admins choose private sections and specific teams in **Members & access**. Approved raiders can edit their own records within that access. Only admins configure structure, membership, targets and awards. Raiders do not need GitHub accounts or repository access. Public GitHub issue submissions have been removed because they cannot protect private data.

An import is not proof of in-game ownership or simulated DPS. Guild admins handle ownership disputes. Equipment comparisons retain unknown data instead of inventing an upgrade score.

## Battle.net sign-in

A Cloudflare Worker gateway is implemented in `server/worker.ts`. It is **not active until configured** with Blizzard OAuth credentials, a token scoped only to the private data repository, a stable identity key, and an initial owner account ID. See [deployment instructions](docs/DEPLOYMENT.md). Until then, live editing is unavailable and the fictional demo remains usable. The app never asks visitors for passwords or personal access tokens.

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
- `public/data/raid-state.json`: empty public bootstrap only; CI rejects live records here.
- `public/data/items.json`: cached public Forever metadata for illustrative item IDs, with provider status and timestamps.
- `src/lib/example.ts`: fictional parser fixture. No real player's export is bundled.
- `server/`: Battle.net gateway and private D1 auth schema.
- `src/lib/access.ts`: server-enforced section/team projections and membership policy.
- `.github/workflows/`: verified Pages publishing.
- `tests/`: privacy, team isolation, import, permissions, conflicts, calendars and OAuth boundaries.

## Data sources and limits

Item data is provided by **[TheWoWDB](https://thewowdb.com/developers/)**. The adapter calls only the `forever` namespace, limits request throughput, caches successful responses for one hour, and retains unresolved IDs. It never sends character exports or authentication credentials to the item service. See [data provenance](docs/DATA.md).

Class artwork is served by Blizzard’s official render host. World of Warcraft and its artwork belong to Blizzard Entertainment. This is an independent guild tool, not an official Blizzard product.

The JSON architecture is intended for one guild, with revision conflicts rather than simultaneous merging. Large histories or many guilds should move operational data to a database with repository snapshots. Source changes belong in pull requests; shared raid changes go through the authenticated gateway.

Read [SECURITY.md](SECURITY.md) before configuring production credentials.
