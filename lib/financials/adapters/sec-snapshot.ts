import stored from '../data/sec-snapshots.json';
import type { FinancialComparison, FinancialMetric, FinancialPeriod, FinancialSnapshot, FinancialValue, FinancialView, FinancialsProvider } from '../types';

export type SecObservation = { start?: string; end: string; val: number; accn: string; fy?: number; fp?: string; form: string; filed: string; frame?: string };
export type SecFact = { concept: string; unit: string; observation: SecObservation; filingUrl: string };
export type SecPeriod = { label: string; startDate: string; endDate: string; facts: Partial<Record<FinancialMetric, SecFact | null>> };
export type SecCompanySnapshot = { ticker: string; entityName: string; cik: string; capturedAt: string; sourceUrl: string; views: Record<FinancialView, SecPeriod[] | null> };

const incomeKeys = ['revenue', 'operatingIncome', 'netIncome'] as const;
const balanceKeys = ['cashAndCashEquivalents', 'totalCurrentAssets', 'totalCurrentLiabilities', 'totalAssets', 'totalLiabilities'] as const;
const acceptedConcepts: Record<FinancialMetric, readonly string[]> = {
  revenue: ['us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', 'us-gaap:Revenues', 'us-gaap:SalesRevenueNet'],
  operatingIncome: ['us-gaap:OperatingIncomeLoss'],
  netIncome: ['us-gaap:NetIncomeLoss'],
  cashAndCashEquivalents: ['us-gaap:CashAndCashEquivalentsAtCarryingValue'],
  totalCurrentAssets: ['us-gaap:AssetsCurrent'],
  totalCurrentLiabilities: ['us-gaap:LiabilitiesCurrent'],
  totalAssets: ['us-gaap:Assets'],
  totalLiabilities: ['us-gaap:Liabilities'],
};
const unavailable = (reason: string): FinancialValue => ({ value: null, currency: 'USD', source: null, unavailableReason: reason });
const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date));

function normalizeFact(company: SecCompanySnapshot, period: SecPeriod, key: FinancialMetric, duration: boolean): FinancialValue {
  const fact = period.facts[key];
  if (!fact) return unavailable('This metric was not available in the verified SEC snapshot.');
  const raw = fact.observation;
  const cikPath = `/Archives/edgar/data/${Number(company.cik)}/`;
  let validUrl = false;
  try { const url = new URL(fact.filingUrl); validUrl = url.protocol === 'https:' && url.hostname === 'www.sec.gov' && url.pathname.startsWith(cikPath); } catch { /* Fail closed. */ }
  const valid = validUrl && fact.unit === 'USD' && Number.isFinite(raw.val)
    && acceptedConcepts[key].includes(fact.concept)
    && isDate(raw.filed) && raw.filed <= company.capturedAt.slice(0, 10)
    && ['10-K', '10-K/A', '10-Q', '10-Q/A'].includes(raw.form)
    && raw.end === period.endDate && (duration ? raw.start === period.startDate : !raw.start);
  if (!valid) return unavailable('The supplied fact did not match the verified company, unit, concept, filing, or period.');
  return {
    value: raw.val,
    currency: 'USD',
    source: { url: fact.filingUrl, documentId: raw.accn, documentType: raw.form, filedDate: raw.filed, concept: fact.concept, periodStart: raw.start || null, periodEnd: raw.end },
  };
}

function normalizeComparison(company: SecCompanySnapshot, view: FinancialView): FinancialComparison | null {
  const periods = company.views[view];
  if (!periods || periods.length !== 2) return null;
  for (const period of periods) {
    if (!isDate(period.startDate) || !isDate(period.endDate)) return null;
    const days = (Date.parse(period.endDate) - Date.parse(period.startDate)) / 86400000 + 1;
    // Accommodate ordinary 52/53-week fiscal years. Never relabel YTD as a quarter.
    if (view === 'quarterly' ? days < 75 || days > 105 : days < 350 || days > 380) return null;
  }
  const endGap = (Date.parse(periods[0].endDate) - Date.parse(periods[1].endDate)) / 86400000;
  if (endGap < 350 || endGap > 380) return null;
  const normalized = periods.map((period): FinancialPeriod => ({
    label: period.label,
    startDate: period.startDate,
    endDate: period.endDate,
    income: Object.fromEntries(incomeKeys.map(key => [key, normalizeFact(company, period, key, true)])) as FinancialPeriod['income'],
    balance: Object.fromEntries(balanceKeys.map(key => [key, normalizeFact(company, period, key, false)])) as FinancialPeriod['balance'],
  }));
  return { periods: [normalized[0], normalized[1]] };
}

export function normalizeSecSnapshot(company: SecCompanySnapshot): FinancialSnapshot {
  const quarterly = normalizeComparison(company, 'quarterly');
  const annual = normalizeComparison(company, 'annual');
  const filingDates = [quarterly, annual].flatMap(view => view?.periods.flatMap(period => [...Object.values(period.income), ...Object.values(period.balance)].flatMap(fact => fact.source ? [fact.source.filedDate] : [])) || []);
  return {
    ticker: company.ticker,
    entityName: company.entityName,
    entityId: `CIK ${company.cik}`,
    capturedAt: company.capturedAt,
    selectedFilingsThrough: filingDates.sort().at(-1) || company.capturedAt.slice(0, 10),
    source: { providerId: 'sec-snapshot', label: 'SEC Company Facts', badgeLabel: 'SEC snapshot', url: company.sourceUrl },
    currency: 'USD',
    quarterly,
    annual,
    methodology: 'Uses the most recently filed compatible fact for each exact period in this captured dataset, including later comparative presentations. Income is a reported quarter or fiscal year; balances are period-end instants. No YTD subtraction or missing-value estimates. No conflicting values or relevant amendments were found for these selected facts; future filings and restatements are not included automatically.',
  };
}

const companies = stored.companies as SecCompanySnapshot[];
const snapshots = new Map(companies.map(company => [company.ticker, normalizeSecSnapshot(company)]));
export const secSnapshotProvider: FinancialsProvider = {
  id: 'sec-snapshot',
  async getFinancials(ticker) {
    const symbol = ticker.trim().toUpperCase();
    const snapshot = snapshots.get(symbol);
    if (!snapshot || snapshot.ticker !== symbol) return { status: 'unavailable', ticker: symbol, reason: 'No verified SEC snapshot is included for this ticker. This section does not fetch live financial data.', supportedTickers: [...snapshots.keys()] };
    return { status: 'available', ticker: symbol, snapshot };
  },
};
