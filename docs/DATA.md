# Forever data and import provenance

Research date: 2026-11-10 (America/Los_Angeles).

The live guild starts with an empty roster. No real player's export is bundled or included in public tests. The demo and tests use a fictional `Example Raider` fixture in `src/lib/example.ts`. Its statistics, variant modifiers and talents are illustrative test values, not gameplay recommendations.

The parser preserves equipped items, bag alternatives, bag IDs, stat sections, talents, professions, pet attributes and raw text. Commented bag items are never treated as equipped. Blank roles and unknown specializations stay unassigned. Commented item levels are export labels, not required levels.

## Item tooltips

Tooltips use **[Wowhead Forever](https://www.wowhead.com/forever/database)** through the gateway. Research verified on November 11, 2026:

- The official [tooltip script](https://wow.zamimg.com/js/tooltips.js) maps Forever (CLASSICPLUS) to dataEnv=16.
- The public JSON endpoint is https://nether.wowhead.com/tooltip/item/15304?dataEnv=16&locale=0&bonus=12721&ench=8484. It supports bonus and enchant display together, including the Monkey suffix and Stamina enchant in the verified example.
- [Forever XML](https://www.wowhead.com/forever/item=4251&xml) supplies numeric metadata but lacks browser CORS. In verified probes it ignored the enchant modifier, so the richer JSON endpoint is used for visual tooltips. No XML bulk crawling is performed.
- The [official tooltip documentation](https://www.wowhead.com/tooltips) describes modifier parameters. Only bounded numeric bonus, enchant and gem IDs are sent. Content tuning was not verified and is not forwarded; imported modifiers remain visible with a caveat. No retail/Classic substitution occurs.

Tooltips load on hover, keyboard focus or tap; clicking pins them, and Escape dismisses them. Imports and saves do not wait on the item provider. Gear, loot, supply cards and material requests with an item ID use the same component.

The gateway has a D1-backed shared 12-hour cache with an optional edge copy (matching the observed provider shared-cache header), with successful data retained up to 30 days during outages. Missing items cache for five minutes; errors back off for one minute. The browser deduplicates complete item-variant keys, limits concurrent lookups to three, caches up to 300 metadata records, and keeps the same freshness policy. Only item IDs and supported numeric modifiers leave the app. Provider requests never include guild data, character exports, app sessions or credentials.

Provider HTML is bounded and reduced to plain text server-side, then rendered through React. No raw tooltip HTML or external tooltip JavaScript runs in the signed-in app. Icons use allowlisted HTTPS hosts. Imported names stay visible when the provider returns a generic name. These are verified working public endpoints rather than a guaranteed long-term API contract.

The prior TheWoWDB metadata remains attributed in any saved provenance records, but interactive lookups now use Wowhead Forever. Tooltips are reference information, not a simulation or verification of every item effect.

[Blizzard game-data documentation](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis) and [OAuth documentation](https://community.developer.battle.net/documentation/guides/using-oauth) were consulted. No stable official Forever equipment API contract was verified. The gateway handles Battle.net identity only; automatic armory sync is not implemented.

## Loot decisions

An addon export is simulator input, not simulation output. This release uses evidence-linked items, current equipment, member-assessed upgrade tiers, council order and auditable awards. It does not invent simulated DPS gains, complete raid loot tables or objective priority scores from incomplete data. Ring and trinket comparisons consider both equipped slots; procs, enchants and set bonuses still require verified evidence.

Demo characters and encounter plans are fictional. The live guild begins without invented schedules, kills or awards.
