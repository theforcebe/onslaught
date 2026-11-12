# Security model

## Credentials

Battle.net passwords are entered only on Battle.net. The gateway requests `openid` identity, uses the Blizzard access token to read userinfo, then discards it. Passwords, provider access tokens, client secrets and GitHub service credentials are never stored in guild records or returned to the frontend. Application logs do not record credentials or exports; Worker observability is disabled.

Cloudflare secrets hold client credentials, a dedicated repository-scoped service token, a stable identity HMAC key, and owner account IDs. The service token must have Contents read/write on **onslaught-data only**. Never reuse a broader CLI credential. `.dev.vars` and `.env*` are ignored. Only the public Worker URL belongs in a `VITE_` variable.

## Sign-in and sessions

OAuth state is random, expires after five minutes, is consumed once, and is bound to a Secure, HttpOnly, SameSite=Lax cookie. The callback posts a one-use, one-minute redemption code only to the exact app origin. The frontend checks popup identity and origin. Redemption requires the matching SHA-256 proof key. Blizzard tokens are never included.

Opaque app sessions are hashed in D1 and expire after one hour. To survive page refresh, the browser retains only its app token and absolute expiry in tab-scoped `sessionStorage`; it does not use persistent `localStorage`, URLs, or repository files. This app token is a credential: same-origin JavaScript can access it, so preventing script injection and restricting deployment access remain essential. No Battle.net access token, client secret, GitHub credential, or saved identity/permission assertion is kept there. Restoring a session requires a fresh authenticated server read; local storage cannot grant a rank or permissions. Reload does not extend the expiry. Logout clears memory and tab storage immediately and attempts server revocation; an offline logout cannot guarantee server revocation before expiry.

D1 stores temporary verified identity and hashed keys. Expired rows are removed on subsequent requests. Own identity and the bootstrap account ID are returned only to that verified session, never in anonymous views or another member's identity. Ownership uses stable HMAC identifiers. Storage-disabled browsers fall back to memory-only sessions.

Private and authentication responses use no-store. Public item metadata is cacheable. Mutations require a live bearer session and exact allowed Origin. Auth and data routes are rate limited; JSON bodies are bounded. OAuth callback pages have restrictive CSP, no external resources and no-referrer policy. Errors do not echo upstream bodies. Do not enable unredacted auth-route logging or request-body capture.

GitHub Pages project sites on one account share an origin. Use a dedicated custom domain if other applications on that origin are untrusted. Restrict source and deployment access to trusted maintainers.

## Public and private data

Website source is public. Canonical guild data and member permissions live in a separate **private repository**. The gateway refuses to use a repository whose metadata says it is public. This cannot undo disclosure if an operator makes it public; keep it private permanently. Public GitHub issue submissions and their write workflow have been removed.

Anonymous responses contain only guild branding, roster basics (name/class/level/role/spec/team name), and schedule basics (title/instance/team/time). Public exports omit gear, raw imports, ownership IDs, member lists, character notes, group positions, attendance, raid notes, loot, supplies, progression and audit. CI rejects nonempty public bootstrap records.

Authenticated reads return an allowlisted projection. Section grants and selected teams apply to every private collection. Nested priorities, requests, pledges and attendance are filtered by character team too. Guild-wide records require section access. Unassigned gear requires Gear access and ownership or all-team access. Audit visibility requires Activity plus the source section, teams and affected characters; unscoped and access-management history is admin-only. Downloads contain only the projected view.

Permissions are read again for each request. Pending and suspended accounts get only public data. Join requests derive identity from verified userinfo and start without private permissions. Admins can edit permissions but cannot forge identities or add unverified accounts through that route. Recovery owners are explicitly listed in `ADMIN_BNET_IDS`; first sign-in never grants admin access automatically.

The four ranks are Admin, Officer, Raider, and Guild Member. Only an active Admin rank or configured recovery owner grants administrative privileges. All other ranks use per-person section and team grants, with no implicit promotion privileges. Rank names do not bypass ownership or structural-edit checks. Legacy `member` records map to Raider without changing grants. The full member directory remains admin-only. Officers with Consumables access receive a limited directory of eligible request recipients, containing guild labels, pseudonymous member IDs and team grants, never Battle.net account IDs or Discord identities.

Mutations pass strict schemas, section/team authorization, and ownership/admin checks. Client flags cannot grant admin access. Conflicts use the canonical revision and GitHub file SHA; successful requests are idempotent. Structure, awards and membership require an admin even if a raider can view the section.

Revocation prevents future responses. It cannot erase previously viewed, downloaded, copied, or historical information. Data-repository collaborators can read all historical guild data; raiders should receive app membership instead.

## Input and dependencies

Imports and raid text reject common credential patterns, but no scan can recognize every secret. Imported values render as text, never injected HTML. Item-service requests contain only item IDs, bounded numeric modifiers, or a normalized public item-name search (2–64 characters), never exports or authentication. Material search falls back to TheWoWDB’s documented, credential-free Forever API if Wowhead declines server requests. Both providers use fixed HTTPS hosts, bounded JSON, redirect rejection, shared caching and request limits. Icon URLs and source protocols are constrained. Demo data is fictional and browser-local.

Source/build scans check common tokens and private keys and reject server secret variable names in public bundles. Pages Actions has no gateway credentials and uses pinned actions with explicit permissions. Run tests, type checks, build validation and dependency audit before release.

## Recovery and limits

Report vulnerabilities privately to the owner; never post credentials in issues. Revoke exposed credentials immediately, rotate secrets, and review artifacts and history. Deleting a file does not delete prior Git revisions. Restoring old data may restore old permissions; review the member policy during recovery.

Automated tests cover public projections, team isolation, section grants, nested records, forged admin fields, live-session revocation, read/write responses, private-repository enforcement, OAuth state/redemption, ownership and conflicts. They are not an independent security audit or a guarantee that every defect is impossible. On November 11, 2026, real Battle.net sign-in, owner access, a private save, and anonymous read/write rejection were verified in the deployed system. Separate-account checks of raider section/team access and suspension remain an onboarding check.

## Discord and coordination

Canonical announcements, scheduling polls, site votes, material requests, fulfillment history and short replies live in the private guild repository. Public projections exclude all of them. Officers may create and publish coordination records only with the relevant section and team grants; rank alone does not grant access. Every active approved rank may create a guild-wide volunteer request and claim one. An unstarted claim can be released only by its owner. Requests use revision checks so concurrent claims cannot overwrite each other. Assigned recipients can see their own requests even without a Consumables grant; scoped requests otherwise retain section/team checks. Only a request recipient or Admin can update fulfillment. The new Guild board section requires an explicit per-person grant.

The bot token and OAuth client secret live only in Worker secrets. The integration uses no privileged Gateway intents and does not ingest channel discussions. Native poll counts and delivery receipts are operational data in D1. Discord account IDs and opt-in preferences also stay in D1, outside public source and guild exports. Raw Discord account IDs are never returned as a member directory. Admins and Officers with supply access receive only approved app-member IDs and link/DM-opt-in badges for recipient selection.

Discord account linking uses identify scope, a one-use app-session-bound ticket, PKCE, an HttpOnly state cookie, a fresh live-session and membership check, and membership in the configured Discord server. Access tokens are used server-side and revoked after identity lookup; OAuth tokens are never persisted or sent to the app. Linking does not grant a guild rank. DMs are off by default and require the recipient's linked account and explicit opt-in.

Every outbound post requires an Admin/Officer action on a record they can access. Destination IDs are validated against the configured server. A preview explains that Discord channel membership determines who can read that copy; site restrictions cannot recall a Discord post. All payloads suppress mentions. Durable delivery locks and Discord nonces prevent routine duplicate sends; ambiguous delivery failures are marked unconfirmed and cannot be blindly retried. No credentialed upstream request follows redirects.

Wowhead content is reduced to bounded plain text; no provider scripts or raw HTML run in the app. Shared caches contain only public item metadata, keyed by item ID and supported modifiers. Item lookups never receive or forward app authorization headers.

## Personal availability

All active approved members can set availability for their own verified roster characters on public raid events, without private Attendance or Planner grants. Non-admin ownership is checked on the server; pending and suspended accounts cannot participate. A restricted projection includes only the viewer’s own responses, while other attendance, notes, lineups and character exports remain protected. An admin may record responses for other characters.

## Guild chat

Guild chat is stored in private D1 and excluded from public projections, GitHub guild snapshots, and Discord. Approved members can read General; private messages require the requesting member to be a participant, without an admin override. Sessions are checked on every request and membership is cached for at most 15 seconds, with invalidation after membership changes. Plain-text rendering, strict request schemas, nonce-based retry deduplication, bounded history queries, and per-member rate limits apply. This is application-level privacy, not end-to-end encryption; infrastructure operators can access D1. See [chat operations and retention](docs/CHAT.md).
