# Activate Battle.net and private guild coordination

The public app is https://theforcebe.github.io/onslaught/. Source lives in `theforcebe/onslaught`. Canonical guild records and member permissions live in the **private** repository `theforcebe/onslaught-data`, at `data/guild.json`.

The gateway is deployed at `https://onslaught-gateway.onslaught-raid.workers.dev`. D1 is initialized, and `IDENTITY_KEY` has been generated directly into Cloudflare secret storage. Do not regenerate that key during onboarding. Cloudflare CLI authentication uses encrypted storage backed by Windows Credential Manager.

Activation is complete as of November 11, 2026. The Battle.net client credentials, private-repository `GITHUB_TOKEN`, and verified owner configuration `ADMIN_BNET_IDS` are installed as Cloudflare secrets. Pages is connected to the gateway. The owner completed real Battle.net sign-in, confirmed the admin interface, and saved guild settings through the app. The resulting private commit was verified. Live checks confirm an empty public roster and HTTP 401 for anonymous private reads and writes. The demo is fictional and browser-local. Public GitHub issues are no longer an editing channel.

The sections below document setup and recovery; do not recreate the existing OAuth client, database, or identity key during routine use.

## 1. Connect Cloudflare

This section is already complete for the current deployment. For recovery from a new machine, use the app checkout and authorize only the required Cloudflare scopes:

```sh
npx wrangler login --use-keyring --scopes account:read user:read workers:write workers_scripts:write d1:write
```

Wrangler may install its credential-store helper interactively. To provision a replacement database (do not recreate the existing database during routine setup):

```sh
npx wrangler d1 create onslaught-auth
```

Put the returned database ID in `wrangler.toml`. It is not a secret. Initialize the auth tables:

```sh
npx wrangler d1 execute onslaught-auth --remote --file=server/schema.sql
npm run worker:deploy
```

The first deployment can run without secrets; sign-in fails closed. Copy the returned HTTPS Worker origin into `PUBLIC_API_URL` in `wrangler.toml`, without a trailing slash. Keep `APP_ORIGIN = "https://theforcebe.github.io"` and `GITHUB_REPOSITORY = "theforcebe/onslaught-data"`. Deploy again. A dedicated custom app domain is preferable if other untrusted apps share your Pages origin.

## 2. Register the Battle.net client

In the [Blizzard developer portal](https://community.developer.battle.net/access/clients), create an OAuth client named **Ønslaught**. Set its redirect URI to the exact URL:

```text
https://onslaught-gateway.onslaught-raid.workers.dev/auth/callback
```

The app uses the `openid` identity scope, not WoW armory access. Enter the client ID and secret directly in **Cloudflare → Workers & Pages → onslaught-gateway → Settings → Variables and Secrets**, using type **Secret**. Alternatively use Wrangler's interactive prompts:

```sh
npx wrangler secret put BNET_CLIENT_ID
npx wrangler secret put BNET_CLIENT_SECRET
```

Never paste secret values into chat, GitHub issues, source code, `wrangler.toml`, or any variable starting with `VITE_`.

## 3. Connect the private data repository

Create a dedicated [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new), with:

- Repository access: **Only selected repositories → onslaught-data**.
- Repository permission: **Contents → Read and write**. Metadata read is implicit.
- An expiration date you can maintain. No Actions, administration, organization, or public app repository permissions.

Store it directly as Cloudflare secret `GITHUB_TOKEN`. Do not reuse a developer's GitHub CLI credential. The current `IDENTITY_KEY` is already installed. For a fresh independent deployment, generate at least 32 random bytes with a password manager; changing an existing key requires migrating member and character-owner IDs.

The current repository token expires **February 8, 2027**. Renew it with the same repository and permissions, update the Cloudflare secret, and verify a private save before that date.

```sh
npx wrangler secret put GITHUB_TOKEN
```

Keep `onslaught-data` private and give repository access only to trusted operators. Raiders use the app and do not need GitHub accounts. The gateway verifies the repository is private before reading it. Accepted guild edits and access changes create private commits with conflict checks.

## 4. Connect Pages and establish the owner

Set the public repository's **Settings → Secrets and variables → Actions → Variables → VITE_API_URL** to the Worker origin. This is a public URL, not a credential. Run the **Publish raid headquarters** workflow.

Sign in with your Battle.net account. Open **Members & access → Owner setup reference** to see your verified numeric account ID. Store **your own** ID as Cloudflare secret `ADMIN_BNET_IDS`. It accepts comma-separated numeric IDs for recovery owners. Nobody becomes an admin automatically because they signed in first. Sign out and back in, then use Members & access.

## 5. Invite raiders and choose visibility

1. Raider signs in with Battle.net and clicks **Request membership** in Members & access.
2. An admin sees the verified BattleTag and pending request privately.
3. Set membership to **Active**, choose **Officer**, **Raider**, or **Guild Member**, choose private sections, and select raid teams (or all teams). Use **Admin** only for someone who should have full control.
4. Save. Permissions are checked from the current private document on every API read and save. Suspended and pending accounts get only the public view.

Roster basics (name, class, level, role, specialization, team name) and event basics (title, instance, team name, time) are public. Equipment, raw imports, character notes, group assignments, attendance and raid notes, loot, consumables, progress, and audit history are private.

Each private section needs its own grant. Team-scoped records also need the matching team. Guild-wide loot/progress/supply records are visible to anyone with that section, so choose a specific team or raid event when needed. Unassigned character gear is visible to its owner with Gear access and to members with Gear plus all-team access. Activity entries additionally require their source section and team; legacy unscoped entries and access-management history are admin-only.

Permissions are assigned per person, not inherited from a shared rank template. Officer, Raider, and Guild Member have no automatic private grants. Changing between those ranks preserves the selected permissions. New requests start as pending Guild Members without private access. Existing records using the original `member` role are read as Raider with exactly the same grants; they normalize on the next private save. Pending and suspended memberships remain restricted regardless of rank. The separate recovery-owner configuration is unchanged.

Admins can see all records and manage structure, membership, ownership, schedules, targets, priorities and awards. Section access does not grant structural editing. Raiders can edit their own character and personal responses. A signed-in owner from `ADMIN_BNET_IDS` retains recovery access independently of the editable member list.

Use a character's **Admin: assign Battle.net ownership** control to attach an existing imported character to an approved member. Exports do not prove in-game ownership.

## 6. Verify before onboarding the guild

- Sign in as the owner, confirm Members & access works, and create a harmless test record.
- Sign in as a raider with one section and one team; confirm other teams' private records are absent from API responses.
- Confirm a raider cannot edit someone else's character, change groups, grant access, or award loot.
- Suspend that raider while the session is active; refresh and confirm private content disappears and saves are denied.
- Sign out and confirm only roster and schedule basics remain. Check the calendar export too.
- Confirm private commits exist and public Pages artifacts remain empty of guild records.

The current deployment passed real owner sign-in, admin access, private saving, and anonymous read/write checks. A separate raider account is still needed to repeat the section/team and suspension checks end to end; automated tests cover those permission boundaries. Live OAuth popup behavior and provider configuration require actual accounts for verification. Local tests cannot substitute for it. The first sign-in was verified in the owner's regular browser; the embedded browser panel did not expose a usable popup.

## Operations

Sessions last one hour. The app token and absolute expiry are retained in tab-scoped `sessionStorage`, so page refresh does not require another Battle.net connection. Reload never extends the expiry. Identity and access are fetched afresh from the gateway. Sign-out clears the local copy immediately and attempts server revocation; revoked or expired sessions return to the public view. If browser storage is blocked, the app falls back to memory and refresh will require sign-in. Failed refreshes clear displayed private state. Revocation stops future responses; it cannot retract information already seen or downloaded. Guild settings exports only the authorized view. Full backups are in the private repository, including historical access grants and exports.

Run `npm test`, `npm run check:data`, `npx tsc -p tsconfig.server.json`, `npm run build`, and `node scripts/scan-secrets.mjs` before release. CI rejects live guild records in the public bootstrap. Do not copy the private data repo into the website checkout or build output.

See [Cloudflare's secret storage instructions](https://developers.cloudflare.com/workers/configuration/secrets/) and [the security model](../SECURITY.md).
