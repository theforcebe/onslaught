# Security model

## Credentials

Battle.net passwords are entered only on Battle.net. The gateway requests `openid` identity, uses the Blizzard access token to read userinfo, then discards it. Passwords, provider access tokens, client secrets and GitHub service credentials are never stored in guild records or returned to the frontend. Application logs do not record credentials or exports; Worker observability is disabled.

Cloudflare secrets hold client credentials, a dedicated repository-scoped service token, a stable identity HMAC key, and owner account IDs. The service token must have Contents read/write on **onslaught-data only**. Never reuse a broader CLI credential. `.dev.vars` and `.env*` are ignored. Only the public Worker URL belongs in a `VITE_` variable.

## Sign-in and sessions

OAuth state is random, expires after five minutes, is consumed once, and is bound to a Secure, HttpOnly, SameSite=Lax cookie. The callback posts a one-use, one-minute redemption code only to the exact app origin. The frontend checks popup identity and origin. Redemption requires the matching SHA-256 proof key. Blizzard tokens are never included.

Opaque app sessions are hashed in D1 and expire after one hour. To survive page refresh, the browser retains only its app token and absolute expiry in tab-scoped `sessionStorage`; it does not use persistent `localStorage`, URLs, or repository files. This app token is a credential: same-origin JavaScript can access it, so preventing script injection and restricting deployment access remain essential. No Battle.net access token, client secret, GitHub credential, or saved identity/permission assertion is kept there. Restoring a session requires a fresh authenticated server read; local storage cannot grant a rank or permissions. Reload does not extend the expiry. Logout clears memory and tab storage immediately and attempts server revocation; an offline logout cannot guarantee server revocation before expiry.

D1 stores temporary verified identity and hashed keys. Expired rows are removed on subsequent requests. Own identity and the bootstrap account ID are returned only to that verified session, never in anonymous views or another member's identity. Ownership uses stable HMAC identifiers. Storage-disabled browsers fall back to memory-only sessions.

Responses use no-store. Mutations require a live bearer session and exact allowed Origin. Auth and data routes are rate limited; JSON bodies are bounded. OAuth callback pages have restrictive CSP, no external resources and no-referrer policy. Errors do not echo upstream bodies. Do not enable unredacted auth-route logging or request-body capture.

GitHub Pages project sites on one account share an origin. Use a dedicated custom domain if other applications on that origin are untrusted. Restrict source and deployment access to trusted maintainers.

## Public and private data

Website source is public. Canonical guild data and member permissions live in a separate **private repository**. The gateway refuses to use a repository whose metadata says it is public. This cannot undo disclosure if an operator makes it public; keep it private permanently. Public GitHub issue submissions and their write workflow have been removed.

Anonymous responses contain only guild branding, roster basics (name/class/level/role/spec/team name), and schedule basics (title/instance/team/time). Public exports omit gear, raw imports, ownership IDs, member lists, character notes, group positions, attendance, raid notes, loot, supplies, progression and audit. CI rejects nonempty public bootstrap records.

Authenticated reads return an allowlisted projection. Section grants and selected teams apply to every private collection. Nested priorities, requests, pledges and attendance are filtered by character team too. Guild-wide records require section access. Unassigned gear requires Gear access and ownership or all-team access. Audit visibility requires Activity plus the source section, teams and affected characters; unscoped and access-management history is admin-only. Downloads contain only the projected view.

Permissions are read again for each request. Pending and suspended accounts get only public data. Join requests derive identity from verified userinfo and start without private permissions. Admins can edit permissions but cannot forge identities or add unverified accounts through that route. Recovery owners are explicitly listed in `ADMIN_BNET_IDS`; first sign-in never grants admin access automatically.

The four ranks are Admin, Officer, Raider, and Guild Member. Only an active Admin rank or configured recovery owner grants administrative privileges. All other ranks use per-person section and team grants, with no implicit promotion privileges. Rank names do not bypass ownership or structural-edit checks. Legacy `member` records map to Raider without changing grants. The authenticated response includes only the caller's own current rank and identity; the full member directory remains admin-only.

Mutations pass strict schemas, section/team authorization, and ownership/admin checks. Client flags cannot grant admin access. Conflicts use the canonical revision and GitHub file SHA; successful requests are idempotent. Structure, awards and membership require an admin even if a raider can view the section.

Revocation prevents future responses. It cannot erase previously viewed, downloaded, copied, or historical information. Data-repository collaborators can read all historical guild data; raiders should receive app membership instead.

## Input and dependencies

Imports and raid text reject common credential patterns, but no scan can recognize every secret. Imported values render as text, never injected HTML. Item-service requests contain only item IDs, never exports or authentication. Icon URLs and source protocols are constrained. Demo data is fictional and browser-local.

Source/build scans check common tokens and private keys and reject server secret variable names in public bundles. Pages Actions has no gateway credentials and uses pinned actions with explicit permissions. Run tests, type checks, build validation and dependency audit before release.

## Recovery and limits

Report vulnerabilities privately to the owner; never post credentials in issues. Revoke exposed credentials immediately, rotate secrets, and review artifacts and history. Deleting a file does not delete prior Git revisions. Restoring old data may restore old permissions; review the member policy during recovery.

Automated tests cover public projections, team isolation, section grants, nested records, forged admin fields, live-session revocation, read/write responses, private-repository enforcement, OAuth state/redemption, ownership and conflicts. They are not an independent security audit or a guarantee that every defect is impossible. On November 11, 2026, real Battle.net sign-in, owner access, a private save, and anonymous read/write rejection were verified in the deployed system. Separate-account checks of raider section/team access and suspension remain an onboarding check.
