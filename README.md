# Ønslaught

The raid headquarters for Ønslaught on WoW Forever. A responsive React app on GitHub Pages, with Battle.net identity and shared guild records versioned in a separate private repository.

**[Open the war room](https://theforcebe.github.io/onslaught/)**

## What works

- **Roster and equipment:** guided SimC import with role cards, fixed class specializations, declared buffs and a final review. Inspect equipment, bags, modifiers, talents, professions, pet data, and original exports. Roster basics are public; gear and raw exports require permission. The initial live roster was empty; the demo uses fictional characters.
- **Raid planner:** event-specific confirmed lineups, drag-and-drop groups and swaps, a confirmed bench, fill-open-positions, and a keyboard/touch alternative. Team sizes and role targets are enforced on the server; declines and team changes remove invalid positions.
- **Buff coverage:** an interactive map of declared providers, grouped by in-lineup, confirmed bench, or unconfirmed availability. Select an ability to highlight providers and jump to their raid positions. Forever-specific rules distinguish raid-wide buffs and mutually exclusive alternatives. See [planning behavior and sources](docs/RAID_PLANNING.md).
- **Loot council:** verified item IDs and sources, class eligibility, member requests, ordered council priorities, current equipment comparison, immutable awards and written rationale.
- **Preparation:** per-raid or guild-stock consumable targets, attributed member commitments, progress and shortages.
- **Schedule:** raid events, going/tentative/absent responses, attendance lists, time-zone display, and UTC iCalendar downloads.
- **Progress:** configurable encounters, attempts, best remaining health, strategy notes and kill status.
- **History:** a revisioned data file, attributed audit entries, Git commits, conflict detection and idempotent requests.
- **Practice workspace:** an explicitly labeled sample guild with local, persisted edits. Demo data never enters the real roster.
- **Members & access:** Admin, Officer, Raider, and Guild Member ranks; verified requests, approval, individual section/team permissions, suspension and private audit history. Structural edits remain admin-only.

## Shared editing and visibility

Canonical data lives in **theforcebe/onslaught-data**, a private repository. The Worker returns a filtered view for every request and commits validated edits privately. The public roster contains names, classes, levels, roles, specs and team names. The public schedule contains raid titles, instances, teams and times. Equipment, imports, plans, notes, attendance and member identities never enter the public build.

Members sign in with Battle.net and request membership. Admins assign a rank and choose private sections and specific teams for each person in **Members & access**. Admin has full control; Officer, Raider, and Guild Member receive only their explicit grants. Two people with the same rank can have different access. Approved members can edit their own records within that access. Only admins configure structure, membership, targets and awards. Members do not need GitHub accounts or repository access. Public GitHub issue submissions have been removed because they cannot protect private data.

An import is not proof of in-game ownership or simulated DPS. Guild admins handle ownership disputes. Equipment comparisons retain unknown data instead of inventing an upgrade score.

## Battle.net sign-in

Battle.net sign-in and private saving are **active** through the Cloudflare Worker in `server/worker.ts`. On November 11, 2026, the owner completed real sign-in, confirmed admin access, and saved guild settings through the app; the resulting commit was verified in the private repository. Anonymous private reads and writes return HTTP 401. The initial live roster was published empty; members add their own records through the app.

The app never asks visitors for passwords or personal access tokens. Provider credentials and the repository-scoped service token stay in Cloudflare secret storage. See [deployment and renewal instructions](docs/DEPLOYMENT.md); the current GitHub token expires February 8, 2027.

Refreshing the page preserves the one-hour app session in the current browser tab; the owner verified this in the deployed app on November 11, 2026. The app rechecks identity and permissions with the gateway before showing private data. Sign-out clears the saved session; expiry requires signing in again. The browser stores only the short-lived app token and its expiry, never Battle.net credentials.

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

## Guild coordination and item tooltips

Guild coordination adds an Officer/Admin announcement board, short member replies, raid-night polls with visual results, and assigned material requests with timestamped fulfillment history. Section and team permissions are enforced server-side. Site polls keep one editable response per member; native Discord polls take votes only in Discord and mirror counts to the site every 30 seconds while visible.

Discord delivery is explicit: save a record, preview its destination, then post to the configured channel. Request DMs require each recipient to link Discord and opt in. See [Discord setup](docs/DISCORD.md). The bot's credentials and installation are separate from deploying the app; the site reports setup pending until configured.

Wowhead Forever tooltips are available on gear, loot, supplies and material requests with item IDs. Hover/focus to inspect, click to pin, Escape to dismiss. Variant-aware caching keeps repeated lookups fast without delaying imports. See [data provenance and cache policy](docs/DATA.md).
