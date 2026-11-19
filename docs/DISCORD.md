# Discord integration

The integration connects the Ønslaught server (1346205094550700072) to three destinations verified from the owner's invite links:

- Announcements: 1570172980842078248
- Raid scheduling: 1570172913955377303
- Material requests: 1570172876475072772

## Owner setup

1. Create a Discord application. Set the OAuth2 redirect to `https://onslaught-gateway.onslaught-raid.workers.dev/discord/callback`. Keep Public Client off.
2. Store `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` as encrypted Worker secrets. Never add their values to Git, frontend variables, screenshots or chat. Do not rotate existing Battle.net secrets or IDENTITY_KEY.
3. Apply `server/discord-schema.sql` to the existing D1 database. This only adds Discord tables. Apply `server/items-schema.sql` for the public item metadata cache as well.
4. In Guild coordination → Discord connection, follow the bot installation link. Grant View Channel, Send Messages, Embed Links, Read Message History and Send Polls. Administrator and privileged Gateway intents are unnecessary. Limit the bot role's channel visibility to the intended channels in Discord.
5. Click Validate & save channels. The gateway checks that all destinations belong to the same server. Explicit channel overwrites can still prevent sending; a send failure displays the reason safely.
6. Members link their Discord account from this panel and optionally enable request DMs. Battle.net remains the app sign-in. A member must belong to the connected server; Discord privacy settings may also block DMs.

## Coordination behavior

### Raid-night signups

Apply `server/raid-signups.sql` to the existing guild D1 database. In **Guild coordination → Discord connection**, an Admin can select **Enable Discord raid signup buttons**. The gateway reads the application's public verification key using the existing bot connection, then registers its signed interactions endpoint. If the app already has another endpoint, the gateway leaves it alone and reports the conflict. The signup post also includes a link to the specific raid on the site.

An Admin or an Officer with attendance access to the raid team can post a signup from the planner. Discord's **Create Events** guild permission also enables a calendar event. When Discord denies that permission, members can still use the scheduling-channel post. Use **Update Discord signup** after changing raid details or granting the calendar permission. Updating edits the original post and associated calendar event.

Members link their Discord account under **Discord connection**, then choose **Going**, **Maybe**, or **Can't make it** on the scheduling-channel post. When there are multiple choices, a private menu lists each character's **Main** and **Alternate** builds. To switch roles for one night, choose **Going** or **Maybe** again and pick the new build. Discord's **Interested** button sets a calendar reminder.

The **Raid composition** chart on the same Discord message groups confirmed characters by their role for that night. Each listed character shows their name, class and selected build. Existing and new website signups are listed by default, alongside Discord responses. Maybe and Unavailable have separate totals. A member can clear **List my character by name on this Discord chart** beside the Discord link to hide their name and keep their response in the totals. Role and availability changes preserve that preference.

Saving a response on either platform triggers an edit to the existing Discord message. The website can finish saving attendance while Discord processes the edit. A private D1 queue tracks pending edits, and a five-minute Worker cron retries temporary failures. To upgrade previously published charts, apply `server/raid-signups.sql`, deploy the Worker, then apply `server/raid-chart-roster-upgrade.sql` once. The Worker checks that each raid is still open and the original scheduling channel is still configured.

The handler authenticates interactions with the app's Ed25519 public key and validates the current guild, channel, posted message, linked account, active membership, character ownership and build. Private replies go only to the responding user. Discord message and calendar IDs are kept in D1, and attendance changes follow the same private repository reducer and concurrency checks as website signups. [Discord interactions](https://docs.discord.com/developers/interactions/receiving-and-responding) · [Scheduled event permissions](https://docs.discord.com/developers/resources/guild-scheduled-event)

### Polls, announcements and requests

Admins and Officers with the corresponding section/team grants can create announcements, polls and assigned material requests. Scheduling polls live in Raid planner → Night polls. Every approved member can create a guild-wide volunteer request, claim an unassigned request, and release their claim before any delivery. An Admin controls these grants separately for each person. Members can reply to visible announcements and requests. Only the assigned recipient or an Admin can update fulfillment, including partial deliveries and corrections. Assigned recipients can read their request even without a Consumables grant. All approved members are eligible recipients; Discord linking does not approve membership. The searchable recipient cards show whether Discord is linked and DMs are enabled. The live report refreshes shared data every 30 seconds while the page is visible. All records, authors, timestamps and progress changes are versioned in the private guild repository.

Polls have one voting location. Site polls retain one editable multi-choice response per member in the repository. Native Discord polls use Discord voting and mirror counts, avoiding duplicate site-plus-Discord votes. Discord supports up to ten options and durations up to 32 days, rounded up to whole hours. Native poll totals include everyone allowed to vote in that Discord channel, including people without site membership. Use a site poll when voting must be restricted to approved app members. Counts can change until Discord finalizes them. A failed sync retains previous counts and displays their timestamp; unknown counts are never presented as zero.

Discord posts require an explicit preview/send action. Site section restrictions do not limit the audience of a Discord channel; the preview makes that clear. Mentions are suppressed. Material-request notifications link to the site; they are snapshots, while the site maintains current fulfillment. Channel posting is the default, with a separate optional DM action. One record is posted at most once per destination in normal operation; volunteer-request DM receipts are scoped to the current claimed recipient so a new volunteer can receive a notification. Create a new record for a new channel notification.

Receipts, native poll-count caches, channel configuration and account links are held privately in D1. They are operational integration state rather than part of the guild JSON. Back up D1 separately when backing up the service. A timeout after a send is marked unconfirmed and blocks automatic retries; inspect the destination before operator recovery. A Discord message can outlive a member's site access or a cancelled request.

The integration does not synchronize arbitrary Discord chat, send automatic recurring polls, or DM people who have not opted in.

## Materials and participation

Material requests use debounced Wowhead Forever suggestions, exact item IDs, and the existing hover/focus tooltips. Different IDs with the same name remain separate choices. Wowhead search responses are cached for 12 hours in D1 and at the edge. When Wowhead declines gateway requests, the documented TheWoWDB Forever API supplies search results with visible attribution and a one-hour cache. Results are suggestions, so refine broad queries. Tooltips still come from Wowhead. Outages are cached for one minute; a fallback 429 extends that backoff according to Retry-After (bounded to one hour). Manual names remain available during provider outages. No credentials or character exports are sent to Wowhead.

The contribution board derives completed requests, requests helped, and quantities from current non-cancelled deliveries. Updating the same delivery does not award duplicate credit, and corrections adjust totals. Rankings use completed requests, then requests helped; quantities of different materials are not treated as comparable points. Members only see contributions derived from requests they can access.

## References

- [Discord polls](https://docs.discord.com/developers/resources/poll)
- [Messages, mentions and nonce behavior](https://docs.discord.com/developers/resources/message)
- [OAuth2](https://docs.discord.com/developers/topics/oauth2)
- [User and DM endpoints](https://docs.discord.com/developers/resources/user)
