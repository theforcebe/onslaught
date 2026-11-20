# Raid planning and character setup

Each scheduled event has its own optional `lineup` map from character ID to group number. Standing team membership and its default groups remain separate. Only characters belonging to that event's team and marked **Going** are eligible. Tentative and absent characters never count toward coverage or role totals.

Admins can drag a character's grip into a group, drop on another raider to swap (including full groups), move someone back to the confirmed bench, or fill open positions. Clicking a raider and then a group is the keyboard/touch alternative. Fill preserves existing positions, prefers standing groups, and leaves overflow on the bench. Five-player groups and the team's partial final group are checked on the server. RSVP declines and team changes remove invalid event assignments. Changing an event's team clears its lineup; editing its schedule preserves it.

Lineups require **Raid planner + Attendance & raid notes + the specific team**. Declared abilities are available to those viewers or members with the appropriate character/gear access. The public roster and schedule omit both lineup maps and ability declarations. Structural edits remain admin-only. New fields are optional so existing repository documents remain readable; no migration rewrites live data.

## Guided imports

After Battle.net sign-in, **Request membership** appears on Overview. The request shows as pending until an admin approves it. Members with gear access can use **Import character** or **Update character** in the persistent header on every page. Members with multiple linked characters choose the one they played. The importer checks the name, class and previously recorded realm before updating gear. Returning characters with a complete build go straight from export to review and can edit their role, spec or buffs there.

The upcoming raid on **Overview** accepts an RSVP and alternate build directly. Open the raid title for lineup planning. Members can also claim an open material request on Overview.

Import follows Export → Role & spec → Buffs → Review. Choose a primary role and a Forever talent tree for your class. Under **Alternate specs & roles**, add any other builds you can play. A Druid can register Feral Tank, Feral Melee and Restoration Healer on the same character. Select each build under **Buffs** to declare its own abilities. Refreshing a gear export preserves saved builds.

In **Raid planner → Your availability**, select a build for that night and choose Going, Maybe or Can’t make it. Changing the build after signing up updates the existing response. Your primary profile and other nights keep their own settings. The active lineup uses that night's role and buff declarations. The site and Discord close signups when the scheduled raid ends.

Buff declarations are private, user-confirmed availability. A class, gear item, spec label or undecoded talent string does not prove an ability was learned. The current catalog covers 15 core buffs and four utility/debuff entries. It is deliberately not a simulation of every situational ability, aura uptime, target allocation, stacking or spell rank. No unverified numeric benefit is used to rank a lineup. Talent and form requirements appear beside the selection; Divine Spirit is gated at its documented level 30.

The coverage map distinguishes a declared provider **in the lineup**, **on the confirmed bench**, and **no declared provider**. Select an ability to see named providers and their groups, highlight them in the board, and jump to their position. Available alternatives are not added together as a combat-effect score. Windfury/Flametongue Totem and blessing recipient choices need in-game coordination.

## Forever rules reviewed November 11, 2026

Primary Blizzard references, with later notes taking precedence over original deep dives:

- [Beta development notes through November 2](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696): the October 15 section makes Battle Shout, Trueshot Aura, Moonkin Aura, Leader of the Pack, Strength of Earth, Grace of Air, Windfury and Flametongue Totems raid-wide. Moonkin is spell critical strike; Leader of the Pack is melee/ranged critical strike. Windfury and Flametongue Totem remain exclusive; Grace of Air is no longer exclusive with either. These later notes supersede the original Druid aura descriptions.
- [Hunter and Druid deep dives](https://worldofwarcraft.blizzard.com/en-us/news/24301515/): talent-tree names and talent/form-dependent utility.
- [Priest and Warrior deep dives](https://worldofwarcraft.blizzard.com/en-us/news/24301514/): Divine Spirit becomes baseline at level 30 for all Priest specializations.
- [Mage and Shaman deep dives](https://news.blizzard.com/en-us/article/24302097/world-of-warcraft-forever-class-deep-dives-mage-and-shaman): class trees and totem changes; use subsequent development notes for raid-wide scope.
- [Deep Dive recap](https://worldofwarcraft.blizzard.com/en-us/news/24303313): baseline Kings, Divine Spirit, and improved Mark changes.
- [November 10 hotfixes](https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-10-2026): a Shaman's personal weapon imbue may coexist with a weapon totem. The app does not conflate personal imbues with the two totem benefits.

When Blizzard changes class rules, update `src/lib/raid.ts` and this review date. Do not replace Forever's rules with retail spec names or a Classic party-buff assumption.

## Unified raid workspace

Raid planner contains lineup and personal availability, raid-night polls, loot, raid supplies, and progress. The legacy Schedule link redirects here. Every approved rank can respond for its own characters. Manage raiders opens a searchable roster picker. Admins can also record RSVPs. New raids use the guild time zone, and editing uses the event’s saved zone. Attendees see their local time. Calendar downloads preserve the scheduled instant, including during daylight-saving transitions.

Buff coverage counts only confirmed, same-team raiders in valid group slots within the team’s capacity. Bench, tentative, absent, wrong-team, out-of-range and over-capacity entries never contribute. Bench providers are explicitly labeled not covered.

Getting started opens a guide to Battle.net, approval, character setup, optional Discord linking and DM delivery, and personal availability. The guide shows progress from the member’s current guild information. Quick help links directly to each task.
