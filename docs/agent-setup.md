# Agent-led setup on ChatGPT Sites

This guide is for the agent. The user should not need to learn terminal commands, database administration, or hosting configuration. Use your current installed Sites skill and supported tools for exact commands; do not assume that a plain chat, CLI, or unrelated coding agent has hosting access.

## 1. Obtain and identify the template

Read the source through the user's authorized GitHub connection or a source ZIP they supply. Do not circumvent repository access. Work in a new directory. Retain application code, build integration, lockfile, and migrations, but never import Git credentials, `.env`/`.dev.vars`, local databases, build output, or another user's `.openai/hosting.json` project identity.

The canonical starter manifest is:

```json
{"d1":"DB","r2":null}
```

If this is a continuing setup and a project ID is already present, inspect and reuse it; do not delete it or create duplicate sites. Record which project belongs to the recipient. Keep the GitHub starter remote separate from the recipient's Sites source remote; do not push deployment changes back to the starter.

## 2. Prepare a compatible project

Use the Sites retained-template workflow in the installed skill. Preserve the supplied Vinext/Cloudflare application and its `sites()` build integration. The template requires D1 bound as `DB`; it does not need R2. Initialize the execution profile and install the locked dependencies with the supported installer. Do not replace the app with a newly generated scaffold.

Register a new private Site only if this copy has no project yet, immediately save its returned project ID, and preserve the D1 binding when editing the manifest. Source publication and deployment must target this new project. The user's original account, other sites, and the template author's deployments are outside this task.

Use the included `drizzle` migrations for the new hosted database through the normal Sites publication workflow. `npm run setup` initializes a local emulator only. Do not copy someone else's SQLite files or send remote migration commands to a guessed database.

## 3. Configure the user's key

Guide the user to Sites → their new site → Settings → environment variables/secrets. Required name: `ASKEDGAR_API_KEY`; value: their own AskEdgar key; secret: enabled. Do not ask them to paste it in chat. If the active environment offers a secure secret-entry form, use it. Do not read or reuse any template-owner key.

No Massive, Alpaca, or TradingView API key is needed for embedded charts. Leave `WATCHLIST_MODE` unset on private Sites copies to retain account watchlists. `.env.example` is for local development and its browser-mode setting is not a production environment file to upload. If using a different hosting/authentication system later, follow `local-development.md` and explicitly review that host's behavior.

Deploy or redeploy after a secret update so the running version uses the current environment revision. Never include secret values in commands, commit messages, screenshots, or output.

## 4. Verify and publish privately

Before publication, run:

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/test-chart-v2-integration.mjs
node scripts/test-api-cache.mjs
node scripts/test-account-watchlist.mjs
```

Run the production build using the installed Sites workflow, synchronize the exact source revision, and deploy the resulting saved version privately. Preserve the current project ID on subsequent attempts. Inspect failed builds/deployments and resolve the actual error; do not repeatedly recreate projects.

When browser QA is available through the supported workflow, use the recipient's authenticated session to:

1. Search one ticker and verify profile/dilution/news render with their API plan.
2. Open the default chart; confirm it does not require a market-data key or call custom chart endpoints.
3. Add and remove a temporary watchlist ticker; verify account storage and reload persistence.
4. Confirm the live site is private and belongs to the recipient's new project.

Use a small number of upstream calls; do not scan an entire watchlist to test setup. Existing tests cover caching with fake data. Never test key validity by printing it, embedding it in a URL, or exposing an unauthenticated diagnostic endpoint.

Report the actual production URL and verification completed. If credentials, browser access, or publishing are blocked, preserve the working project and explain the one missing step. Do not report an untested live API connection as working.

## 5. Hand off for customization

Tell the user they can return to the site and ask for changes in plain language. Their copy uses their API credits and is independent; template changes do not automatically update deployed copies. Future updates should preserve their own features, secret configuration, project identity, and database.

Custom-chart requests are documented in `charts.md`. Other hosting services require an adapter/setup specific to that platform; do not promise a one-prompt deployment there without testing it.
