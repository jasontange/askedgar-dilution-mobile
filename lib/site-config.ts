// Copying this site? Set enabled to false, then rebuild/redeploy, to remove both
// Financials and its navigation entry without changing any dilution features.
export const siteConfig = {
  // 'embedded' needs no market-data key. 'custom' enables the preserved overlays.
  // See docs/charts.md for agent instructions and provider integration.
  chart: {mode: 'embedded' as 'embedded' | 'custom'},
  financials: {
    enabled: false,
    provider: 'sec-snapshot',
  },
} as const;
