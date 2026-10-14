# AskEdgar Dilution Mobile agent guide

## First task: create a user's own site

Read `README.md` and `docs/agent-setup.md` before setup. This is a distributable copy of AskEdgar V2. The recipient is usually nontechnical: perform supported installation, database initialization, verification, and hosting steps yourself. Ask the user only for required account access, secure key entry, or a decision that cannot be inferred. Use the installed Sites skill for hosting; this document does not replace its current tool instructions or access checks.

The canonical starter has `.openai/hosting.json` containing `d1: "DB"` and `r2: null`, **without `project_id`**. Create a new project only when no identity exists and persist the returned identity immediately. On retries and later edits reuse the user's existing project. A private GitHub URL does not grant access: use an authorized connector or an explicitly supplied source ZIP.

Keep a recipient's deployment in a separate working directory/source repository. Never push their project identity, keys, cached API responses, watchlists, or runtime state into this starter. Never use a source template owner's key or hosted project. Do not modify another AskEdgar deployment.

## Credentials and access

The only required research credential is `ASKEDGAR_API_KEY`. Guide the user to their site's secret settings; keep values out of prompts, files, logs, client code, Git history, and public environment variables. Never fetch the template owner's runtime secrets. New recipient sites stay private unless the recipient explicitly changes their audience. Each deployment has its own D1 database and its own key; this is not a multi-tenant bring-your-own-key server.

## Charts and preserved behavior

Default `siteConfig.chart.mode` is `embedded`, requiring no chart-data key. Embedded mode must not call custom price or overlay endpoints. Keep the existing mobile layout, research sections, watchlist limits, and cache durations.

When asked to enable custom charts, overlays, or a market-data provider, read `docs/charts.md`. The complete implementation is in `app/custom-stock-chart.tsx`; do not rebuild it or uncomment a stale copy. Keep the provider-neutral `ChartData` contract and configure provider keys server-side.

## Local use and validation

`npm run setup` copies a blank `.env.example` if needed and applies only local database migrations. It preserves existing environment values and local data. Local `WATCHLIST_MODE=browser` uses device storage. For a private Sites deployment, leave `WATCHLIST_MODE` unset to use authenticated account watchlists. Do not upload `.env` to Sites or treat local migrations as proof that the hosted database was initialized.

Run relevant existing checks and a production build. Use mock tests for repeated checks and a small real-data smoke check only after the recipient configures their own key. Report completed checks and any unavailable browser or authenticated verification honestly. Do not claim the copy is ready based only on a successful build.
