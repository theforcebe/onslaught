# Security model

## Credentials are not raid data

- The Pages application contains no Battle.net client secret, GitHub service credential, Blizzard access token, or account password.
- Battle.net passwords are entered only on Battle.net. The gateway requests `openid` identity access; it does not request a WoW profile scope or inspect unrelated account data.
- Blizzard access tokens are used on the server to read identity and then discarded. They are not returned to the browser, saved in the repository, or written to application logs.
- The app’s opaque session token is held in JavaScript memory only. It is not in localStorage, sessionStorage, cookies, query parameters, analytics, or repository files. Reloading requires a new sign-in. Sessions expire after one hour and logout revokes them.
- D1 holds only hashed session/redemption keys and temporary account identity. Session rows expire after one hour and are purged on subsequent requests. Configure the hosting account’s own access and retention policies appropriately.
- Public character ownership uses an HMAC pseudonym, not a raw Battle.net account ID or BattleTag. A stable `IDENTITY_KEY` is required; rotating it requires migrating owner identifiers.
- The frontend has no analytics and never sends an export to an item database. Public asset hosts receive ordinary image/font requests, with no referrer.

## Authentication boundaries

OAuth state is random, short-lived, consumed once, and bound to a `Secure; HttpOnly; SameSite=Lax` cookie. The browser receives only a short-lived redemption code via `postMessage` to the exact configured app origin. The message listener checks both origin and popup identity. Redemption requires the matching SHA-256 proof key and is single-use.

The final session token is returned in a no-store JSON response. Credentialed mutations require an explicit bearer token, an exact allowed Origin, current membership and a live session. Every mutation is rate limited and request bodies have byte limits. Cross-origin requests fail closed. All callback pages have a restrictive CSP, no external resources and no-referrer policy. The static build also applies a CSP.

GitHub Pages project sites under one account share an origin. Use a dedicated custom domain for stronger isolation if the same account hosts other untrusted applications. Keep unrelated code out of the guild’s origin.

## Authorization boundaries

GitHub identity comes from `issue.user.login`, never request JSON. The validator reads current admin/member lists from the trusted main branch. Members may update only their own character records and personal responses. Structural writes require an admin. Payloads are strict schemas; arbitrary fields, invalid IDs, invalid quantities and ownership injection are rejected.

Battle.net identity comes from the server’s verified userinfo response. Admin and member status are checked against private server allowlists on every write, so removal takes effect for existing sessions. The client cannot grant itself admin access.

The shared reducer is tested for member isolation, admin restrictions, conflict rejection, duplicate requests, team capacity, loot eligibility and award immutability. UI visibility is not a security boundary.

GitHub Actions runs trusted code from `main`; issue contents are never interpolated into shell commands. Validation errors do not print issue bodies. Workflows have explicit permissions. The Pages workflow has no server credentials. The guild workflow uses its short-lived repository `GITHUB_TOKEN`, not a personal token. Raiders should receive app membership, **not** repository write access.

## Secret handling for operators

Store gateway credentials only with Cloudflare’s encrypted secret facility. Create a dedicated fine-grained GitHub token limited to this repository with Contents read/write; no workflow, administration or organization permissions. Set an expiry and rotate it. Never reuse a developer’s broad CLI token in the gateway.

`.env*` and `.dev.vars` are ignored. Only the public gateway URL uses a `VITE_` variable. Source/build scanning rejects common token and private-key patterns and rejects server-only configuration in the public build. Dependency audits are part of release verification. These checks reduce accidental disclosure; they cannot recognize every possible secret in arbitrary text.

Application logs never include OAuth payloads, authorization headers, exports or credentials. Worker observability is disabled by default. Do not enable HTTP request capture or third-party logging on authentication routes without redaction; OAuth authorization codes necessarily pass through the provider callback URL.

## Public content

This repository and the Pages site are public. Character exports, character names, game realms, plans, notes, GitHub usernames and guild decisions are public after submission. The import review screen states this before publication and rejects common credential patterns. Never put real names, email addresses, contact information, account tokens or private conversation logs into a raid note or import.

Item names and imported text are rendered as text, not executable HTML. Database tooltip HTML is never injected. Images and source links are constrained to safe protocols and vetted icon hosts.

## Reporting and recovery

Report a suspected vulnerability privately to the repository owner; do not post credentials in an issue. If a credential is exposed, revoke it immediately and rotate it at its issuer, then remove it from code, artifacts and Git history as appropriate. Deleting only the current file does not remove earlier Git revisions. App data can be restored from a reviewed previous commit; preserve the audit history where possible.

The included test suite and scans are not a third-party security audit. Live OAuth verification remains required after provisioning real credentials.
