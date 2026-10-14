# Local development and hosting

A small-cap research app built around the AskEdgar API: company profiles, dilution instruments, offering capacity, offerings, news, filings, corporate actions, ownership, and watchlists.

The default chart is a TradingView embedded widget with its own data. **Local use requires only an AskEdgar API key**—no Massive, Alpaca, TradingView API key, Cloudflare account, or ChatGPT sign-in. Node.js and a network connection are required. Hosting a copy online has separate hosting requirements.

## Run a local copy

Requires Node.js **22.13 or newer**. From the cloned project directory on Windows, macOS, or Linux:

```sh
npx pnpm@11.25.0 install --frozen-lockfile
npm run setup
```

Setup creates `.env` from `.env.example` if it does not already exist and applies the database migrations locally. Edit `.env` and enter your own key:

```dotenv
ASKEDGAR_API_KEY=your_askedgar_key_here
WATCHLIST_MODE=browser
```

Then start the app:

```sh
npm run dev
```

Open the local URL printed in the terminal (normally `http://localhost:5173`). Keep the development server on your own computer. There is no account-creation step or remote database provisioning. The included Cloudflare runtime emulates the database on disk; it does not require a Cloudflare account for local use.

`npm run setup` is safe to rerun after pulling updates: it preserves `.env` and existing database records and applies only pending migrations. API keys stay on the server. Do not put them in browser code or variables prefixed with `VITE_`/`NEXT_PUBLIC_`. `.env`, `.dev.vars`, local database state, and build output are ignored by Git. If you use `.dev.vars`, it takes precedence over `.env`; avoid defining local credentials in both.

## Charts and customization

The main switch is `siteConfig.chart.mode` in [`lib/site-config.ts`](../lib/site-config.ts):

| Mode | Data source | Additional key | AskEdgar chart overlays |
| --- | --- | --- | --- |
| `embedded` (default) | TradingView widget | None | No |
| `custom` (optional) | Server-side provider; Massive adapter included | Your provider's key | Offerings, news/filings, dilution, VWAP |

The complete custom chart is preserved as working code, not commented out. It is loaded only in custom mode. The custom price and overlay endpoints are disabled in embedded mode, including when an old Massive key is still configured. Opening the default chart does not request AskEdgar overlay data.

To customize with a coding agent, ask:

> Enable the custom TradingView chart using docs/charts.md. Keep the existing AskEdgar research features and mobile layout. Use my preferred market-data provider, and configure its key server-side.

See [`charts.md`](charts.md) for the switch, file map, provider contract, and verification commands. TradingView widget availability and delay vary by symbol; the widget retains TradingView attribution and includes an external chart link. The default does not promise real-time data or coverage of every small-cap ticker.

## Cache and watchlists

The same persistent response cache works locally and on the hosted V2 site. Local state lives under `.wrangler/state`; the setup command initializes it automatically.

- **5 minutes:** screener/profile and news/filings.
- **1 hour:** dilution ratings and instrument data.
- **12 hours:** offerings, ownership, pending corporate actions, and reverse splits.

Expired data refreshes on demand. Shared cached pages and request coalescing reduce duplicate API calls. Current AskEdgar API plan permissions still determine available endpoints.

Local clones use device watchlists saved in the browser, with up to 50 tickers and comma-separated input. Clearing browser storage clears that device list. The news feed initially checks up to four tickers/five items each; Load more checks the next batch. Cross-device account sync is optional and requires a hosting/authentication integration.

On a private Sites-hosted copy, leave `WATCHLIST_MODE` unset to use authenticated account watchlists and the D1 cache. Set `WATCHLIST_MODE=browser` for a deployment without Sites account authentication.

## Development and hosting

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/test-chart-v2-integration.mjs
node scripts/test-stock-chart.mjs
node scripts/test-stock-chart-overlays.mjs
node scripts/test-account-watchlist.mjs
node scripts/test-api-cache.mjs
npm run build
```

This is a Vinext/Cloudflare Workers project. Local execution needs no Cloudflare account; deploying outside Sites requires your own compatible hosting, database binding, secrets, and access controls. It is not a generic Node-server deployment. The production build retains the Sites integration.

The template `.openai/hosting.json` declares the database binding and deliberately has no deployment identity. Register a new Sites project for your copy, and preserve that identity on subsequent edits. Configure runtime secrets in that host. Never push a personal deployment identity, credentials, or local data back into the starter repository.

The original AskEdgar site is separate. Deals and Financials are disabled/removed from V2; the retained financials reference code is documented in [`financials/README.md`](financials/README.md).
