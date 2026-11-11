# Deployment and guild onboarding

## GitHub Pages

The repository is `theforcebe/onslaught`, and the site is `https://theforcebe.github.io/onslaught/`. Repository Settings → Pages uses **GitHub Actions**. A push to `main` validates data, runs tests, builds, scans for secrets and publishes.

The owner `theforcebe` is the initial admin. To add raiders, open **Guild settings → Invited GitHub members**, enter their GitHub usernames, and submit the proposed change. To add another admin, update the admin list through the same verified route. To attach an existing character to a member, open the character → **Admin: assign GitHub ownership**. The live roster starts empty.

For a shared edit, click **Review change**, inspect the public payload, and choose **Submit on GitHub**. Large imports use **Copy request** followed by **Open GitHub & paste request**. After posting the issue, the workflow commits accepted changes and explains rejected ones. It never trusts a username typed into the payload. Refresh the app to fetch the committed state.

The workflow drains pending issues on each trigger and retries open submissions hourly. Multiple people editing the same revision may cause a conflict: the second user must refresh, review, and submit a new request. This protects the first change. A duplicate request ID does not produce another award or duplicate commitment.

Keep repository write access restricted to trusted maintainers. App members do not need it.

## Activate Battle.net

**Status:** the gateway is implemented and locally type-checked and unit-tested. It has not been deployed or tested against a real Blizzard client. No credentials have been supplied or copied into this repository.

The GitHub Pages host cannot keep client secrets or run OAuth callbacks. Deploy the included Cloudflare Worker to handle sign-in and authenticated repository writes. Use your own Cloudflare and Blizzard developer accounts. The app continues to work through GitHub-verified submissions before this setup is completed.

1. Sign in to Cloudflare with Wrangler (`npx wrangler login`). Create a D1 database:

   ```sh
   npx wrangler d1 create onslaught-auth
   ```

   Replace `database_id` in `wrangler.toml` with the returned database ID. This ID is not a secret. Run:

   ```sh
   npx wrangler d1 execute onslaught-auth --remote --file=server/schema.sql
   ```

2. Choose the Worker hostname. Set `PUBLIC_API_URL` to its complete HTTPS origin and keep `APP_ORIGIN` set to the exact Pages origin `https://theforcebe.github.io` (no path or trailing slash). A dedicated custom app domain is preferable if the account hosts unrelated applications on that origin.

3. In the [Blizzard developer portal](https://community.developer.battle.net/access/clients), register an OAuth client. The redirect URI must exactly match:

   ```text
   https://YOUR-WORKER.workers.dev/auth/callback
   ```

   Store the client ID and secret using interactive secret prompts:

   ```sh
   npx wrangler secret put BNET_CLIENT_ID
   npx wrangler secret put BNET_CLIENT_SECRET
   ```

   Do not paste the secret into chat, a GitHub issue, an environment variable prefixed `VITE_`, or a committed file.

4. In GitHub, create a **dedicated fine-grained token**, limited to `theforcebe/onslaught`, with **Contents: Read and write**. No other permissions are needed. Choose an expiration date, store it using:

   ```sh
   npx wrangler secret put GITHUB_TOKEN
   ```

   Do not reuse your existing GitHub CLI credential. The gateway only uses this token on `api.github.com`.

5. Generate a strong random secret in your password manager and store it as `IDENTITY_KEY`. Keep it stable: it pseudonymizes public character owners.

   ```sh
   npx wrangler secret put IDENTITY_KEY
   npm run worker:deploy
   ```

6. Set the repository **Actions variable** `VITE_API_URL` to the Worker’s HTTPS origin and run the **Publish raid headquarters** workflow. This is a public URL, never a credential.

7. Sign in once. Before you are allowlisted, the app displays your numeric Battle.net account ID privately in the failed invitation response. Use it to set `ADMIN_BNET_IDS` via `npx wrangler secret put ADMIN_BNET_IDS`. Add raiders’ IDs to `MEMBER_BNET_IDS`; both accept comma-separated numeric account IDs. Keep these lists in server secrets. An empty admin list does not grant anyone automatic admin access. Re-deploy as required by your hosting workflow.

8. Verify the live flow: sign in, save a harmless character note, confirm the commit and audit entry, sign out, and confirm a write is denied. Confirm a non-admin cannot change a team or someone else’s profile. Live provider OAuth and browser-popup behavior must be checked with the actual registered client.

Battle.net sessions last one hour and are not saved across reloads. The server checks membership every time. Imported new characters are assigned to the verified member’s public pseudonym. GitHub and Battle.net identities are not silently linked merely because names match.

## Backup and operations

- Every accepted edit commits the complete guild state. Use GitHub history for review and recovery.
- **Guild settings → Download snapshot** exports the state being viewed. Demo snapshots are explicitly named as demo.
- `npm run check:data` validates schema and references before publication.
- `npm audit`, the tests and `scripts/scan-secrets.mjs` should pass before each release.
- The item cache can be refreshed with `npx tsx scripts/cache-items.ts`. Check source builds and unknown variants before treating a data change as gameplay truth.
- Keep the raw snapshot for provenance. Do not infer simulated DPS, attendance percentages, or loot eligibility that the available records cannot establish.
