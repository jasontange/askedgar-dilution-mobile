export type FinancialView = 'quarterly' | 'annual';
export type IncomeMetric = 'revenue' | 'operatingIncome' | 'netIncome';
export type BalanceMetric = 'cashAndCashEquivalents' | 'totalCurrentAssets' | 'totalCurrentLiabilities' | 'totalAssets' | 'totalLiabilities';
export type FinancialMetric = IncomeMetric | BalanceMetric;

// Provider-independent, entity-level financial data. Amounts are raw currency
// units; formatting into millions is solely a presentation concern.
export type FinancialFactSource = {
  url: string;
  documentId: string;
  documentType: string;
  filedDate: string;
  concept: string;
  periodStart: string | null;
  periodEnd: string;
};
export type FinancialValue = {
  value: number | null;
  currency: string;
  source: FinancialFactSource | null;
  unavailableReason?: string;
};
export type FinancialPeriod = {
  label: string;
  startDate: string;
  endDate: string;
  income: Record<IncomeMetric, FinancialValue>;
  balance: Record<BalanceMetric, FinancialValue>;
};
export type FinancialComparison = {
  periods: readonly [FinancialPeriod, FinancialPeriod];
};
export type FinancialSnapshot = {
  ticker: string;
  entityName: string;
  entityId: string;
  capturedAt: string;
  selectedFilingsThrough: string;
  source: { providerId: string; label: string; badgeLabel: string; url: string };
  currency: string;
  quarterly: FinancialComparison | null;
  annual: FinancialComparison | null;
  methodology: string;
};
export type FinancialsResult =
  | { status: 'available'; ticker: string; snapshot: FinancialSnapshot }
  | { status: 'unavailable'; ticker: string; reason: string; supportedTickers: readonly string[] };

// The UI consumes this contract, never a provider's response or secret.
// A live provider can fetch normalized data from a same-origin server endpoint.
export interface FinancialsProvider {
  id: string;
  getFinancials(ticker: string): Promise<FinancialsResult>;
}
