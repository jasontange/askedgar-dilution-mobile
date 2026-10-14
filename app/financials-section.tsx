'use client';
import { useEffect, useState } from 'react';
import CompanyFinancials from './company-financials';
import { getFinancials } from '../lib/financials/provider';
import { siteConfig } from '../lib/site-config';
import type { FinancialsResult } from '../lib/financials/types';

export default function FinancialsSection({ ticker, enabled = siteConfig.financials.enabled }: { ticker: string; enabled?: boolean }) {
  const [result, setResult] = useState<FinancialsResult | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setResult(null);
    getFinancials(ticker).then(value => { if (!cancelled) setResult(value); }).catch(() => {
      if (!cancelled) setResult({ status: 'unavailable', ticker, reason: 'Financial data could not be loaded.', supportedTickers: [] });
    });
    return () => { cancelled = true; };
  }, [ticker, enabled]);
  if (!enabled) return null;
  if (!result || result.ticker !== ticker.trim().toUpperCase()) return <section id="financials" tabIndex={-1} className="panel financials-panel section-target" aria-label="Financials"><div className="section-head"><h2>Financials</h2></div><p className="financials-footnote" role="status">Loading financial snapshot…</p></section>;
  return <CompanyFinancials key={result.ticker} result={result}/>;
}
