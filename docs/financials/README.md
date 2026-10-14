# Financials: removable, provider-independent snapshots

This feature is separate from AskEdgar dilution, news, risk, ownership and corporate-action APIs. No existing AskEdgar API route changed. No paid-provider credentials, runtime SEC requests or automatic refresh were added.

## Coverage and dates

The bundled snapshot contains **DVLT (Datavault AI Inc., CIK 0001682149)** and **AAPL (Apple Inc., CIK 0000320193)** only. Unknown tickers return an explicit unavailable result. There is no default-company fallback, alias inference, fabricated zero or demonstration data.

Captured from official SEC Company Facts on **October 10, 2026**:

- DVLT: 12:12:01 UTC. Q2 2026, April 1–June 30, compared with the same dates in 2025. Annual FY2025 compared with FY2024, each January 1–December 31. Latest selected filing: August 19, 2026.
- AAPL: 12:11:24 UTC. Fiscal Q3 2026, March 29–June 27, compared with fiscal Q3 2025, March 30–June 28. Annual FY2025, September 29, 2024–September 27, 2025, compared with FY2024, October 1, 2023–September 28, 2024. Latest selected filing: July 31, 2026.

Balance-sheet values are instants at each period end, including the prior-year **quarter end**, rather than the prior fiscal year-end column in a current 10-Q. Income values are directly reported quarter/full-year durations. Quarterly values are never taken from six-/nine-month YTD values or derived by subtraction. Apple's fiscal-quarter labels are not its calendar-quarter XBRL frame labels.

All 64 cells were checked against same-accession official SEC filing XBRL. `sec-verification.json` records those checks and source links; `lib/financials/data/sec-snapshots.json` retains the exact selected Company Facts observations.

## Remove for a copied site

In `lib/site-config.ts`, set `financials.enabled` to `false`, then rebuild/redeploy. This hides both the complete section and its jump-navigation option. The loader performs no financials work while disabled. Dilution features remain unchanged. No production access setting or API key needs changing.

## Feature boundaries

- `lib/site-config.ts`: single enable switch and provider selection.
- `lib/financials/types.ts`: provider-independent `FinancialsProvider`, `FinancialsResult`, `FinancialSnapshot`, periods and per-value provenance.
- `lib/financials/adapters/sec-snapshot.ts`: maps the captured SEC observations to that contract. It validates ticker selection, source-company CIK, exact periods, concept, USD unit, form and filing date. Missing or mismatched metrics become null.
- `lib/financials/provider.ts`: provider registry and selection.
- `app/financials-section.tsx`: cancellable loader, disabled/loading/error states. A ticker change cannot display a previous ticker's result.
- `app/company-financials.tsx`: presentation only. It consumes normalized data, not SEC or vendor payloads. It preserves the requested two tables/eight metrics.
- `lib/financials/format.ts`: raw currency-to-millions display formatting. Raw values remain available in cell descriptions.

## Provenance, units and restatements

Amounts are raw USD in the source and normalized model; the UI shows USD millions rounded to one decimal. Negative operating/net results use parentheses. A null is unavailable, never zero. Cash is only `CashAndCashEquivalentsAtCarryingValue`, excluding restricted cash, investments and crypto. Total liabilities is `Liabilities`, not debt or liabilities-and-equity.

For each exact concept, USD unit and start/end pair, the capture selects the latest compatible 10-K, 10-Q or amendment filed by the capture date, ordered by filed date then accession. Comparative facts may therefore come from later filings than the original reporting period. Per-cell accession, form, filing date, concept, period and source URL are preserved. Do not interpret a later comparative as proof of a restatement.

No conflicting values or relevant amendments were found for these selected periods/metrics in the captured data. This is not a claim about every historical filing. A snapshot cannot incorporate future restatements automatically. Reverify and replace it explicitly to refresh. Do not use `fy`, `fp` or `frame` alone to infer the income duration. Standard Company Facts only supplies entity-wide standard-taxonomy concepts; missing custom concepts must remain unavailable unless independently verified and mapped.

## Add Fiscal AI, FMP or another provider later

1. Fetch external data in a **server-only** module or route. Store secrets in Sites secret environment variables (or an ignored server-only local environment file). Never put a key in this client-imported provider registry, `NEXT_PUBLIC_*`, JSON, source control, browser requests or rendered output.
2. Verify the provider's symbol/entity mapping, currency, units, exact fiscal period boundaries, statement meaning and amended/restated-report policy. Normalize to `FinancialSnapshot`. Preserve provenance. Return null for missing metrics and an unavailable result for unsupported companies. Never copy another company's data or infer a missing total.
3. Add a client-safe provider implementing `FinancialsProvider.getFinancials(ticker)`. It may call a same-origin server endpoint that returns only the normalized public fields, never credentials or vendor authorization headers. Check that the returned ticker matches the requested one; bound/cache upstream calls and return clear errors.
4. Register the adapter in `lib/financials/provider.ts`, select its ID in `lib/site-config.ts`, and run the tests/build. The presentation and dilution modules do not need vendor-specific changes.

No Fiscal AI/FMP endpoint assumptions or live integration stubs are included. New server fetch/auth/caching behavior must be implemented and verified when that connection is actually requested.

## Verify or refresh snapshots

Run `node scripts/test-financials.mjs` for feature, missing-data, mismatched-period/unit/company, formatting and shared-hide-switch tests. Run TypeScript with `node node_modules/typescript/bin/tsc --noEmit --incremental false` and the normal Sites production build.

To reproduce the raw-data check after obtaining official Company Facts JSON locally:

`node scripts/verify-sec-snapshots.mjs DVLT=/path/to/dvlt-companyfacts.json AAPL=/path/to/aapl-companyfacts.json`

This checks all selected observations and confirms latest compatible filing selection by the capture date. It does not replace exact-context filing-XBRL verification. For a refresh, verify identity against SEC submissions, capture the new retrieval timestamp, choose genuinely reported fiscal periods and same-year-ago counterparts, preserve all per-cell sources, verify exact consolidated USD facts, and update the audit. If a source is absent or ambiguous, store null instead of guessing.

Authoritative references:
- [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [DVLT Company Facts](https://data.sec.gov/api/xbrl/companyfacts/CIK0001682149.json)
- [AAPL Company Facts](https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json)

The SEC API needs no API key and does not support browser CORS. Follow its published automated-access policy if a future server-side refresh is implemented; do not add browser-side polling.
