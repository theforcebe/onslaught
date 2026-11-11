# Forever data and import provenance

Research date: 2026-11-10 (America/Los_Angeles).

The live guild starts with an empty roster. No real player's export is bundled or included in public tests. The demo and tests use a fictional `Example Raider` fixture in `src/lib/example.ts`. Its statistics, variant modifiers and talents are illustrative test values, not gameplay recommendations.

The parser preserves equipped items, bag alternatives, bag IDs, stat sections, talents, professions, pet attributes and raw text. Commented bag items are never treated as equipped. Blank roles and unknown specializations stay unassigned. Commented item levels are export labels, not required levels.

## Item adapter

Item data is provided by **[TheWoWDB](https://thewowdb.com/developers/)**.

- Detail: `https://thewowdb.com/api/v1/forever/item/{id}`
- Search: `https://thewowdb.com/api/v1/forever/item/?q=bow&per_page=20`
- Credential-free browser CORS; visible attribution required.
- Requests are limited to approximately 1.8 per second, cached for one hour, and backed off on HTTP 429.
- Offline and unresolved records preserve original export details. The adapter never substitutes Classic or retail statistics.

Cache records retain source build and retrieval time. No item request contains a character export, session token or Battle.net credential.

A resolved ID may have incomplete statistics. Precision Bow (8183) resolved without complete weapon data during research. Base item records do not automatically resolve suffixes, enchants, bonus IDs, content tuning, procs or set effects. Original names remain visible when a provider returns a generic base name. Provider data can come from a beta build even if the import is newer.

[Blizzard game-data documentation](https://community.developer.battle.net/documentation/world-of-warcraft/game-data-apis) and [OAuth documentation](https://community.developer.battle.net/documentation/guides/using-oauth) were consulted. No stable official Forever equipment API contract was verified. The gateway handles Battle.net identity only; automatic armory sync is not implemented.

## Loot decisions

An addon export is simulator input, not simulation output. This release uses evidence-linked items, current equipment, member-assessed upgrade tiers, council order and auditable awards. It does not invent simulated DPS gains, complete raid loot tables or objective priority scores from incomplete data. Ring and trinket comparisons consider both equipped slots; procs, enchants and set bonuses still require verified evidence.

Demo characters and encounter plans are fictional. The live guild begins without invented schedules, kills or awards.
