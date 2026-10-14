'use client';

import { useState } from 'react';
import { financialDate, formatFinancialAmount } from '../lib/financials/format';
import type { FinancialPeriod, FinancialValue, FinancialView, FinancialsResult } from '../lib/financials/types';

type FinancialRow = { label: string; value: (period: FinancialPeriod) => FinancialValue; total?: boolean };
const incomeRows: FinancialRow[] = [
  { label: 'Revenue', value: period => period.income.revenue },
  { label: 'Operating income / (loss)', value: period => period.income.operatingIncome },
  { label: 'Net income / (loss)', value: period => period.income.netIncome, total: true },
];
const balanceRows: FinancialRow[] = [
  { label: 'Cash and cash equivalents', value: period => period.balance.cashAndCashEquivalents },
  { label: 'Total current assets', value: period => period.balance.totalCurrentAssets },
  { label: 'Total current liabilities', value: period => period.balance.totalCurrentLiabilities },
  { label: 'Total assets', value: period => period.balance.totalAssets, total: true },
  { label: 'Total liabilities', value: period => period.balance.totalLiabilities, total: true },
];

function valueDescription(fact: FinancialValue) {
  if (fact.value === null) return fact.unavailableReason || 'Unavailable in this snapshot';
  const exact = `${fact.currency} ${fact.value.toLocaleString('en-US')}`;
  if (!fact.source) return exact;
  return `${exact} · ${fact.source.concept} · ${fact.source.documentType} filed ${fact.source.filedDate} · ${fact.source.documentId}`;
}

function FinancialTable({ title, rows, periods, view, currency, balance = false }: { title: string; rows: FinancialRow[]; periods: readonly FinancialPeriod[]; view: FinancialView; currency: string; balance?: boolean }) {
  return <div className="financial-statement">
    <h3>{title}</h3>
    <p className="financial-period-note">{balance ? 'As of each period end' : view === 'quarterly' ? 'Fiscal quarters ended' : 'Fiscal years ended'} · {currency} millions</p>
    <table className="financial-table">
      <caption className="sr-only">{title}, financial snapshot in {currency} millions</caption>
      <colgroup><col className="financial-line-column"/><col/><col/></colgroup>
      <thead><tr><th scope="col">Line item</th>{periods.map(period => <th scope="col" key={period.label}><span>{period.label}</span><small>{financialDate(period.endDate)}</small></th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.label} className={row.total ? 'financial-total' : undefined}><th scope="row">{row.label}</th>{periods.map(period => {
        const fact = row.value(period);
        return <td key={period.label} title={valueDescription(fact)} aria-label={fact.value === null ? 'Unavailable' : undefined}>{formatFinancialAmount(fact.value)}</td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

function PeriodSources({ period }: { period: FinancialPeriod }) {
  const sources = [...new Map([...Object.values(period.income), ...Object.values(period.balance)].flatMap(fact => fact.source ? [[fact.source.documentId, fact.source] as const] : [])).values()];
  return <div className="financial-period-sources"><strong>{period.label}</strong><p>Income: {financialDate(period.startDate)}–{financialDate(period.endDate)}.<br/>Balance sheet: as of {financialDate(period.endDate)}.</p><ul>{sources.map(source => <li key={source.documentId}><a href={source.url} target="_blank" rel="noreferrer">{source.documentType} filed {financialDate(source.filedDate)} ↗</a><small>{source.documentId}</small></li>)}</ul></div>;
}

export default function CompanyFinancials({ result }: { result: FinancialsResult }) {
  const [view, setView] = useState<FinancialView>(result.status === 'available' && !result.snapshot.quarterly ? 'annual' : 'quarterly');
  if (result.status === 'unavailable') return <section id="financials" tabIndex={-1} className="panel financials-panel section-target" aria-labelledby="financials-heading">
    <div className="section-head financials-head"><div className="financials-title"><h2 id="financials-heading">Financials</h2><span className="financials-source-badge">Unavailable</span></div></div>
    <div className="financials-source-note"><strong>Financials unavailable for {result.ticker}</strong><p>{result.reason}</p>{result.supportedTickers.length > 0 && <p>Current snapshot coverage: {result.supportedTickers.join(', ')}. Other tickers do not use another company’s figures.</p>}</div>
  </section>;
  const { snapshot } = result;
  const comparison = snapshot[view];
  return <section id="financials" tabIndex={-1} className="panel financials-panel section-target" aria-labelledby="financials-heading" aria-describedby="financials-source-note">
    <div className="section-head financials-head">
      <div className="financials-title"><h2 id="financials-heading">Financials</h2><span className="financials-source-badge">{snapshot.source.badgeLabel}</span></div>
      <div className="financials-toggle" role="group" aria-label="Financial statement period">
        <button type="button" disabled={!snapshot.quarterly} aria-pressed={view === 'quarterly'} onClick={() => setView('quarterly')}>Quarterly</button>
        <button type="button" disabled={!snapshot.annual} aria-pressed={view === 'annual'} onClick={() => setView('annual')}>Annual</button>
      </div>
    </div>
    <div className="financials-source-note" id="financials-source-note"><strong>{snapshot.ticker} · {snapshot.entityName}</strong><p><a href={snapshot.source.url} target="_blank" rel="noreferrer">{snapshot.source.label} ↗</a> · Captured {financialDate(snapshot.capturedAt)} · Not live</p><p>Selected filings through {financialDate(snapshot.selectedFilingsThrough)}. Period dates below may differ from the current market-data date.</p></div>
    {comparison ? <>
      <div className="financials-statements" aria-live="polite">
        <FinancialTable title="Income statement" rows={incomeRows} periods={comparison.periods} view={view} currency={snapshot.currency}/>
        <FinancialTable title="Balance sheet" rows={balanceRows} periods={comparison.periods} view={view} currency={snapshot.currency} balance/>
      </div>
      <div className="financials-footnote"><p>Amounts in {snapshot.currency} millions, rounded to one decimal. Parentheses indicate losses. “—” means unavailable; values are not estimated.</p><details className="financials-sources"><summary>Sources &amp; period details</summary><div className="financials-source-grid">{comparison.periods.map(period => <PeriodSources key={period.label} period={period}/>)}</div><p>{snapshot.methodology}</p></details></div>
    </> : <p className="financials-footnote">This period comparison is unavailable in the snapshot.</p>}
  </section>;
}
