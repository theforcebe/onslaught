# Guild messenger

Approved members of every rank can open **Guild chat** at the bottom right. General is the shared guild room. **Private messages** opens a searchable member directory; select someone to start or resume a conversation. Enter sends, Shift+Enter adds a line, and Escape minimizes the messenger. The dock stays available while navigating the site. No Discord connection is required.

In General, type `@` and select a guild member to mention them. Arrow keys move through suggestions; Enter or Tab selects a person; Escape dismisses the picker first. Names remain normal readable text, with member IDs bound separately to the selected text. Editing a selected name removes its notification binding. Up to ten mentions may be selected in a message; repeated mentions notify a recipient once per message. `@everyone` and unselected names never send notifications.

Recipients see unread message and **@ counts** on the chat launcher. Opening chat prioritizes unread private messages, then **Your mentions**, with highlighted names and a **Mentioned you** label. The view retains mention history after it has been read. Mention receipts apply only to that recipient and the loaded messages; reading the latest general chat does not erase older unseen mentions.

New private messages and @mentions produce a clickable sender alert and a two-tone ping. Audio unlocks after an ordinary click or key press on the page; notification settings include a mute control and **Test ping**. Old unread history does not ping again on refresh. Messages refresh every 5 seconds when the chat is open; alerts poll every 10 seconds, including background tabs. Browsers may throttle or suspend background pages, so this is not push notification delivery. Unfocused conversations are not automatically marked read. The browser title also shows the unread DM/mention count.

In **Guild chat → notification settings**, linked members can opt into **Send my private messages to Discord too**. This separate preference forwards new messages, including the sender's name and full text, only to that recipient through the guild bot. The recipient must still share the connected server and allow bot DMs. General chat is never forwarded. Reply on the site; replies to the bot are not synced. A new Discord account requires new consent. Site delivery is preserved if Discord fails; the sender sees a separate delivery status. Each message is claimed once in private D1 before contacting Discord, and uncertain delivery is not automatically retried to avoid duplicate DMs.

Apply the idempotent `server/chat-notifications.sql` before deploying notification support. It adds recipient preferences and delivery receipts without altering message history.

Messages are stored in private Cloudflare D1, not the public source repository or public guild projection. Discord receives copies only under the recipient preference described above. DMs are accessible through the app only to their two participants: an administrator rank does not override this. Infrastructure operators with database access can access stored messages; this is not end-to-end encryption. Message text is rendered as plain text and never interpreted as HTML. Known credential formats are rejected, but members should never send passwords or tokens.

The member directory contains only active members' application IDs, BattleTags, and ranks. Pending, suspended, and unregistered accounts cannot use chat. Every request verifies the application session and membership. A private membership-only cache lasts 15 seconds to avoid GitHub API exhaustion; membership changes through the gateway invalidate it. Expired-cache refresh errors fail closed. A concurrent cache refresh or direct repository change may take up to 15 seconds to propagate.

Read cursors advance only for a focused, visible conversation at its latest messages. History loads in batches of 50. Sends are limited to 20 per member per minute and use a sender-scoped idempotency ID so a retry does not duplicate a message. Chat supports text up to 2,000 characters; no attachments or AI bot is involved.

## Deployment

Apply the additive schema before deploying the Worker:

```powershell
$chatSchemaSql = (Get-Content -LiteralPath 'server/chat-schema.sql' -Raw) -replace '\r?\n', ' '
npx wrangler d1 execute onslaught-auth --remote --command $chatSchemaSql
$chatMentionsSql = (Get-Content -LiteralPath 'server/chat-mentions.sql' -Raw) -replace '\r?\n', ' '
npx wrangler d1 execute onslaught-auth --remote --command $chatMentionsSql
$chatNotificationSql = (Get-Content -LiteralPath 'server/chat-notifications.sql' -Raw) -replace '(?m)^--.*$', '' -replace '\r?\n', ' '
npx wrangler d1 execute onslaught-auth --remote --command $chatNotificationSql
npm run worker:deploy
```

This uses the D1 query endpoint with the existing `d1:write` authorization. The file-import endpoint rejected that OAuth grant during this deployment; no broader scope is needed for these additive table definitions. Flattening SQL newlines preserves the single argument through Windows command wrappers.

Apply `chat-mentions.sql` **once** after the base chat schema, including on existing deployments. It adds `mentions_json` to existing messages with an empty default and a private recipient/read index. Check `PRAGMA table_info(chat_messages)` before retrying the migration; do not repeat the `ALTER TABLE` if that column is already present. Existing messages and read cursors are preserved. New messages and mention recipients are saved in a single [D1 batch transaction](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), with retries checked against the original message and mention payload.

Chat remains in D1 until an operator explicitly removes it. Use the account's D1 backup/export facilities for operational backups; do not put a database export in the public application repository. Ordinary guild exports intentionally exclude conversations.

The privacy, pagination, rate-limit, retry, read-cursor, and membership tests execute the actual SQL against in-memory SQLite, with fictional identities. Browser QA uses an ignored local-only fixture server; no test messages are sent to the live guild.

The implementation uses parameter-bound prepared statements from the [Cloudflare D1 API](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).
