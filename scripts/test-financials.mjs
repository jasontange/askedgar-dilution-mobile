import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Compile only the isolated feature for fast dependency-free unit/render tests.
const root = process.cwd();
const target = path.join(root, '.sites-runtime/financials-tests');
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, 'package.json'), '{"type":"commonjs"}');
const sources = ['lib/site-config.ts', 'lib/financials/types.ts', 'lib/financials/format.ts', 'lib/financials/provider.ts', 'lib/financials/adapters/sec-snapshot.ts', 'app/company-financials.tsx', 'app/financials-section.tsx', 'app/section-navigation.tsx'];
for (const source of sources) {
  const destination = path.join(target, source.replace(/\.tsx?$/, '.js'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, ts.transpileModule(fs.readFileSync(path.join(root, source), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText);
}
fs.mkdirSync(path.join(target, 'lib/financials/data'), { recursive: true });
fs.copyFileSync('lib/financials/data/sec-snapshots.json', path.join(target, 'lib/financials/data/sec-snapshots.json'));
const require = createRequire(path.join(target, 'test.cjs'));
const { getFinancials } = require('./lib/financials/provider.js');
const { normalizeSecSnapshot } = require('./lib/financials/adapters/sec-snapshot.js');
const { formatFinancialAmount } = require('./lib/financials/format.js');
const CompanyFinancials = require('./app/company-financials.js').default;
const FinancialsSection = require('./app/financials-section.js').default;
const SectionNavigation = require('./app/section-navigation.js').default;
const { siteConfig } = require('./lib/site-config.js');
const data = JSON.parse(fs.readFileSync('lib/financials/data/sec-snapshots.json', 'utf8'));
const incomeKeys = ['revenue', 'operatingIncome', 'netIncome'];
const balanceKeys = ['cashAndCashEquivalents', 'totalCurrentAssets', 'totalCurrentLiabilities', 'totalAssets', 'totalLiabilities'];
let cellCount = 0;
for (const company of data.companies) {
  const result = await getFinancials(company.ticker);
  assert.equal(result.status, 'available');
  assert.equal(result.snapshot.ticker, company.ticker);
  assert.equal(result.snapshot.currency, 'USD');
  for (const view of ['quarterly', 'annual']) {
    assert.equal(result.snapshot[view].periods.length, 2);
    for (const period of result.snapshot[view].periods) {
      assert.deepEqual(Object.keys(period.income), incomeKeys);
      assert.deepEqual(Object.keys(period.balance), balanceKeys);
      for (const [key, value] of Object.entries({ ...period.income, ...period.balance })) {
        assert.ok(Number.isFinite(value.value), `${company.ticker} ${view} ${key}`);
        assert.equal(value.currency, 'USD');
        assert.equal(value.source.periodEnd, period.endDate);
        assert.equal(value.source.periodStart, incomeKeys.includes(key) ? period.startDate : null);
        assert.ok(value.source.url.includes(`/data/${Number(company.cik)}/`));
        cellCount++;
      }
    }
  }
  const html = renderToStaticMarkup(React.createElement(CompanyFinancials, { result }));
  assert.equal((html.match(/<table/g) || []).length, 2);
  assert.ok(html.includes('SEC snapshot') && html.includes('Not live'));
  assert.ok(!html.includes('Demo data') && !html.includes('fictional'));
}
assert.equal(cellCount, 64);
const dvlt = await getFinancials(' dvlt ');
assert.equal(dvlt.snapshot.quarterly.periods[0].income.revenue.value, 6717000);
assert.equal(dvlt.snapshot.quarterly.periods[0].income.netIncome.value, -88025000);
assert.equal(dvlt.snapshot.quarterly.periods[1].balance.cashAndCashEquivalents.value, 662000);
const aapl = await getFinancials('AAPL');
assert.equal(aapl.snapshot.quarterly.periods[0].label, 'Q3 FY2026');
assert.equal(aapl.snapshot.quarterly.periods[1].endDate, '2025-06-28');
assert.equal(aapl.snapshot.quarterly.periods[0].income.revenue.value, 109417000000);
for (const ticker of ['MSFT', 'WISA', 'UNKNOWN', '']) {
  const result = await getFinancials(ticker);
  assert.equal(result.status, 'unavailable');
  const html = renderToStaticMarkup(React.createElement(CompanyFinancials, { result }));
  assert.equal((html.match(/<table/g) || []).length, 0);
  assert.ok(html.includes('unavailable'));
}
const mutate = fn => { const copy = structuredClone(data.companies[0]); fn(copy); return normalizeSecSnapshot(copy); };
assert.equal(mutate(c => { delete c.views.quarterly[0].facts.revenue; }).quarterly.periods[0].income.revenue.value, null);
assert.equal(mutate(c => { c.views.quarterly[0].facts.revenue.unit = 'EUR'; }).quarterly.periods[0].income.revenue.value, null);
assert.equal(mutate(c => { c.views.quarterly[0].facts.revenue.observation.start = '2026-01-01'; }).quarterly.periods[0].income.revenue.value, null);
assert.equal(mutate(c => { c.views.quarterly[0].facts.revenue.observation.filed = '2099-01-01'; }).quarterly.periods[0].income.revenue.value, null);
assert.equal(mutate(c => { c.views.quarterly[0].facts.revenue.filingUrl = 'https://www.sec.gov/Archives/edgar/data/320193/other.htm'; }).quarterly.periods[0].income.revenue.value, null);
assert.equal(mutate(c => { c.views.quarterly[0].facts.cashAndCashEquivalents.concept = 'us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'; }).quarterly.periods[0].balance.cashAndCashEquivalents.value, null);
assert.equal(mutate(c => { c.views.quarterly[0].startDate = '2026-01-01'; }).quarterly, null);
assert.equal(formatFinancialAmount(null), '—');
assert.equal(formatFinancialAmount(0), '0.0');
assert.equal(formatFinancialAmount(-88025000), '(88.0)');
assert.equal(formatFinancialAmount(109417000000), '109,417.0');
assert.ok(!renderToStaticMarkup(React.createElement(SectionNavigation)).includes('value="financials"'));
assert.ok(!renderToStaticMarkup(React.createElement(SectionNavigation, { showFinancials: false })).includes('value="financials"'));
assert.equal(renderToStaticMarkup(React.createElement(FinancialsSection, { ticker: 'DVLT', enabled: false })), '');
// Verify one shared configuration switch hides both defaults.
siteConfig.financials.enabled = false;
assert.ok(!renderToStaticMarkup(React.createElement(SectionNavigation)).includes('value="financials"'));
assert.equal(renderToStaticMarkup(React.createElement(FinancialsSection, { ticker: 'DVLT' })), '');
assert.ok(!fs.readFileSync('app/page.tsx', 'utf8').includes('<FinancialsSection'));
console.log(`PASS: ${cellCount} sourced cells; exact duration/instant, currency and company validation; missing/unsupported data; presentation; shared hide switch; formatting.`);
