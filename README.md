# AskEdgar Dilution Mobile

Your own small-cap research website, based on AskEdgar V2. Company profiles, dilution, offerings, news and filings, corporate actions, ownership, watchlists, and charts are included.

## Create your website with an agent

Use ChatGPT Work with **Sites** available in your account. The agent handles installation, database setup, and hosting. You need your own **AskEdgar API key**. Default TradingView charts do not require a Massive, Alpaca, or TradingView API key.

Copy this prompt into a new conversation:

> Create my own private AskEdgar research website from https://github.com/jasontange/askedgar-dilution-mobile. Read AGENTS.md and docs/agent-setup.md, then follow the installed Sites workflow. Keep the current design and research features. Handle installation, initialize a separate database, and register a new site for my account. Guide me through adding ASKEDGAR_API_KEY in the site's secret settings. Use the default embedded charts. Verify the setup, publish privately, and give me my website link.

If the repository is private, your agent needs authorized access to it; a link alone does not grant access. You can also attach a source ZIP you are authorized to use and replace the GitHub URL in the prompt with “the attached source ZIP.”

When the agent creates your site, enter your key in **Sites → your site → Settings → environment variables/secrets** as `ASKEDGAR_API_KEY`, marked secret. Do not paste it into the prompt or add it to GitHub. Tell the agent when it is configured so it can finish verification and deployment. AskEdgar endpoint access depends on your API plan.

Your ChatGPT account must support Sites, and its usage limits apply. No separate Cloudflare account or local software installation is needed for this hosted workflow. Other agents and hosting services may need additional setup; this starter targets ChatGPT Sites.

## Make it yours

After setup, ask the agent to edit **your site**. For example:

- “Add a screener using the AskEdgar API.”
- “Change the colors and keep the mobile layout.”
- “Enable the custom chart using docs/charts.md and my preferred market-data provider.”

The full custom chart implementation is preserved, including dilution, offering, and news overlays. It remains disabled until you request it and configure the required provider. See [chart customization](docs/charts.md).

## Included defaults

- Embedded TradingView chart, five-minute interval, extended hours enabled where available.
- Up to 50 watchlist tickers, with comma-separated entry.
- News starts with a limited batch to manage API usage.
- Persistent cache: five minutes for screener/news; one hour for dilution; twelve hours for offerings, ownership, pending corporate actions, and reverse splits.
- Separate storage and credentials for each deployed copy.

## For coding agents and developers

Start with [AGENTS.md](AGENTS.md) and [the hosted setup guide](docs/agent-setup.md). For local development and commands, see [local setup](docs/local-development.md). The application uses Vinext and Cloudflare Workers with D1; it is not a static GitHub Pages website or a generic Node server.

This repository contains source and schema migrations. It contains no real API keys, personal database state, or preassigned Sites project ID. Keep that true when updating the template. Before public distribution, complete the [release checklist](docs/release-checklist.md). The original application code is licensed under the [MIT License](LICENSE), copyright (c) 2026 Ask Edgar Inc. Existing third-party notices remain with their respective files.
