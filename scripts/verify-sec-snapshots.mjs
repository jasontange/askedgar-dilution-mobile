import fs from 'node:fs';
import assert from 'node:assert/strict';
// Read-only check against fresh/captured official Company Facts JSON files.
// Example: node scripts/verify-sec-snapshots.mjs DVLT=/tmp/dvlt.json AAPL=/tmp/aapl.json
const inputs = new Map(process.argv.slice(2).map(argument => { const split = argument.indexOf('='); return [argument.slice(0, split).toUpperCase(), argument.slice(split + 1)]; }));
const dataset = JSON.parse(fs.readFileSync('lib/financials/data/sec-snapshots.json', 'utf8'));
let count = 0;
for (const company of dataset.companies) {
  assert.ok(inputs.has(company.ticker), `Provide ${company.ticker}=<official Company Facts JSON path>`);
  const original = JSON.parse(fs.readFileSync(inputs.get(company.ticker), 'utf8'));
  assert.equal(Number(original.cik), Number(company.cik), 'CIK mismatch');
  for (const periods of Object.values(company.views)) for (const period of periods) for (const [metric, fact] of Object.entries(period.facts)) {
    if (!fact) continue;
    const [namespace, concept] = fact.concept.split(':');
    const candidates = original.facts[namespace][concept].units[fact.unit].filter(candidate => candidate.start === fact.observation.start && candidate.end === fact.observation.end && ['10-K','10-K/A','10-Q','10-Q/A'].includes(candidate.form) && candidate.filed <= company.capturedAt.slice(0,10)).sort((a,b) => a.filed.localeCompare(b.filed) || a.accn.localeCompare(b.accn));
    assert.ok(candidates.some(candidate => Object.entries(fact.observation).every(([key,value]) => candidate[key] === value)), `${company.ticker} ${metric}: selected observation missing`);
    const latest = candidates.at(-1);
    assert.equal(latest.accn, fact.observation.accn, `${company.ticker} ${metric}: newer compatible source available`);
    assert.equal(latest.val, fact.observation.val, `${company.ticker} ${metric}: value mismatch`);
    assert.equal(fact.observation.end, period.endDate);
    count++;
  }
}
console.log(`PASS: ${count} selected observations match official SEC Company Facts and latest compatible filings by the capture date.`);
