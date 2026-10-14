import { siteConfig } from '../site-config';
import { secSnapshotProvider } from './adapters/sec-snapshot';
import type { FinancialsProvider, FinancialsResult } from './types';

const providers: Record<string, FinancialsProvider> = {
  'sec-snapshot': secSnapshotProvider,
};
export async function getFinancials(ticker: string): Promise<FinancialsResult> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const provider = providers[siteConfig.financials.provider];
  if (!provider) return { status: 'unavailable', ticker: normalizedTicker, reason: 'The configured financials provider is unavailable.', supportedTickers: [] };
  return provider.getFinancials(normalizedTicker);
}
