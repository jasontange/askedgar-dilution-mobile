# Chart modes: instructions for users and coding agents

## Default: embedded TradingView chart

`lib/site-config.ts` sets `chart.mode` to `embedded`. `app/stock-chart.tsx` selects the chart implementation. `app/embedded-stock-chart.tsx` loads TradingView's official Advanced Chart **widget**, only after the user opens Chart. The widget includes data and needs no market-data key. It is separate from the Advanced Charts **library**, which requires your own datafeed.

`lib/chart-config.ts` contains the widget options and mapping from AskEdgar's exchange label to a TradingView symbol. Known US exchange labels are mapped explicitly. Unknown exchanges use the ticker without guessing NASDAQ. Verify any new exchange or unusual symbol format against TradingView; some symbols cannot be embedded. The widget's built-in unavailable-symbol message and the external link remain available.

The widget opens on 5-minute candles with `extended_hours: true`, a supported option in TradingView's official widget loader. Pre-market and after-hours bars depend on the symbol's available data. They are visible on intraday intervals, not Daily/Weekly/Monthly; users can change the interval in the widget toolbar.

The vendor script is confined to a disposable DOM subtree. Closing/reopening or changing ticker removes the prior subtree. Script-loading failure offers retry and an external link. The site does not try to scrape or extract TradingView's data. Attribution stays visible. Data availability, delays, branding, and widget customization follow TradingView's widget terms.

Official references:
- https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/
- https://www.tradingview.com/widget-docs/faq/data/
- https://www.tradingview.com/widget-docs/faq/general/

## Enable the preserved custom TradingView chart

If the user asks to "enable the custom TradingView chart", "restore overlays", or "enable the Massive chart", use this existing implementation rather than creating a new chart from scratch.

1. Change **only** `siteConfig.chart.mode` from `embedded` to `custom` in `lib/site-config.ts`.
2. Configure the selected provider's key securely. The included adapter expects `MASSIVE_API_KEY`. For local use, put it in ignored `.env`; on Sites, use the native runtime-secrets tool and redeploy to apply the environment revision. Never include the real key in source, examples, logs, or client configuration.
3. Keep `ASKEDGAR_API_KEY` for research and overlay data. Custom charts do not replace AskEdgar data.
4. Run the chart tests and typecheck, build, and restart/redeploy. Confirm the provider subscription covers the chosen history, interval, and display use. Missing credentials must remain a friendly error without an upstream call.

Use the embedded mode until the user configures a provider. Turning on custom mode does not create a provider account or subscription. To return to the no-key chart, set the mode back to `embedded`; both custom endpoints will stop making upstream requests.

### Preserved code map

| File | Responsibility |
| --- | --- |
| `app/stock-chart.tsx` | Mode selection and lazy import of custom chart |
| `app/embedded-stock-chart.tsx` | Default widget and modal |
| `app/custom-stock-chart.tsx` | Original Lightweight Charts candles, volume, sessions, interval selection, VWAP, overlay controls |
| `app/api/chart/route.ts` | Server-side price endpoint, disabled unless custom mode is enabled |
| `lib/stock-chart-provider.ts` | Included Massive adapter, request coalescing, short chart cache, safe provider errors |
| `lib/stock-chart.ts` | Provider-neutral `ChartData`/`ChartBar`, aggregation, VWAP, axis formatting; also includes Massive raw-bar normalizer |
| `app/use-chart-events.ts`, `lib/stock-chart-events-provider.ts` | On-demand AskEdgar overlay fetching |
| `app/api/chart-events/route.ts` | AskEdgar overlay endpoint using the shared persistent cache; disabled in embedded mode |
| `lib/stock-chart-overlays.ts`, `app/chart-event-layer.tsx` | Dilution levels, offering/news placement and interactions |
| `app/chart-details.tsx`, `app/chart-instrument-card.tsx`, `lib/chart-event-summary.ts` | Existing detail panels and exact news/filing summary retrieval |

### Connect another price provider

The chart UI consumes `ChartData`, not provider-specific JSON. Replace the server-side adapter used by `app/api/chart/route.ts` or add an explicit provider selector there. Do not expose provider credentials to the browser. There is intentionally only one implemented provider today; Alpaca/Twelve Data are not silently treated as supported.

A provider returns:

```ts
{
  ticker: string;
  source?: string;       // e.g. your provider's display name
  adjusted?: boolean;   // true only for split-adjusted data
  kind: 'minute' | 'day';
  from: string;         // YYYY-MM-DD
  to: string;           // YYYY-MM-DD
  fetchedAt: string;    // actual retrieval timestamp in ISO format
  delayed: boolean;    // reflect actual feed access
  bars: {
    time: number;      // UTC Unix SECONDS, ascending, unique
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    vwap?: number;     // provider's per-bar VWAP, if available
  }[];
}
```

Return minute bars for intraday intervals (the client aggregates 5m/15m/1h) and daily bars for Daily. The included implementation requests 14 calendar days of minute data or two years of daily data. Daily bars must map to the intended trading date in America/New_York. Match timestamps, split treatment, volume coverage, and sessions. If provider history differs, update the chart's history labels too. Validate finite OHLCV values, handle pagination explicitly, and keep errors free of keys/provider account details.

VWAP uses per-bar VWAP weighted by volume when supplied; otherwise the existing calculation labels its typical-price estimate. Preserve this distinction. The embedded widget cannot supply raw prices for the custom implementation.

### Verify

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/test-chart-v2-integration.mjs
node scripts/test-stock-chart.mjs
node scripts/test-stock-chart-overlays.mjs
node scripts/test-chart-event-summary.mjs
```

The integration test exercises both modes, including zero provider calls in embedded mode even with a configured key. After enabling a different provider, extend the adapter tests for its real payload and history limits. Check mobile size, ticker switching, close/reopen, a supported small-cap ticker, unavailable symbols, and provider errors in a browser when available.
