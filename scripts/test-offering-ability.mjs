import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';

const target=path.resolve('.sites-runtime/offering-ability-tests');
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'package.json'),'{"type":"commonjs"}');
fs.writeFileSync(path.join(target,'offering-ability.js'),ts.transpileModule(fs.readFileSync('lib/offering-ability.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
const {offeringAbilityParts,offeringAbilityLines}=createRequire(path.join(target,'test.cjs'))('./offering-ability.js');

const sample='Shelf Capacity: $2.03M, No ATM, Equity Line Capacity: $35.00M, No S-1 Offering';
const parts=offeringAbilityParts(sample);
assert.equal(parts.map(part=>part.text).join(''),sample);
assert.deepEqual(parts.filter(part=>part.tone),[{text:'$2.03M',tone:'orange'},{text:'$35.00M',tone:'green'}]);

for(const label of ['Shelf Capacity','ATM Capacity','Equity Line Capacity']){
  for(const [amount,tone] of [['$0','red'],['$999,999','red'],['$0.99M','red'],['$1M','orange'],['$1,000,000','orange'],['$4.99M','orange'],['$5M','green'],['$5,000,000','green'],['$35.00M','green'],['$500K','red'],['$1000K','orange'],['$1.2B','green'],['$5 million','green']]){
    const text=`${label}: ${amount}, No ATM`;
    const parsed=offeringAbilityParts(text);
    assert.equal(parsed.map(part=>part.text).join(''),text);
    assert.deepEqual(parsed.filter(part=>part.tone),[{text:amount,tone}],text);
  }
}
assert.deepEqual(offeringAbilityParts('Pending S-1').filter(part=>part.tone),[{text:'Pending S-1',tone:'green'}]);
assert.deepEqual(offeringAbilityParts('pending s-1').filter(part=>part.tone),[{text:'pending s-1',tone:'green'}]);
for(const text of ['', 'No Shelf, No ATM, No Equity Line, No S-1 Offering', 'Shelf Capacity: N/A', 'Other amount: $35M', 'Pending S-10']){
  const parsed=offeringAbilityParts(text);
  assert.equal(parsed.map(part=>part.text).join(''),text);
  assert.equal(parsed.filter(part=>part.tone).length,0);
}
const lines=offeringAbilityLines(sample);
assert.deepEqual(lines.map(line=>line.map(part=>part.text).join('')),['Shelf Capacity: $2.03M','No ATM','Equity Line Capacity: $35.00M','No S-1 Offering']);
assert.deepEqual(lines.flat().filter(part=>part.bold).map(part=>part.text),['Shelf Capacity:','ATM','Equity Line Capacity:','S-1 Offering']);
assert.deepEqual(lines.flat().filter(part=>part.tone),[{text:'$2.03M',tone:'orange'},{text:'$35.00M',tone:'green'}]);
const formatted=offeringAbilityLines('Shelf Capacity: $5,000,000, ATM Capacity: $999,999; Equity Line Capacity: $1M\nPending S-1');
assert.deepEqual(formatted.map(line=>line.map(part=>part.text).join('')),['Shelf Capacity: $5,000,000','ATM Capacity: $999,999','Equity Line Capacity: $1M','Pending S-1']);
assert.deepEqual(formatted.flat().filter(part=>part.tone).map(part=>part.tone),['green','red','orange','green']);
console.log('PASS: capacity color boundaries and formats, Pending S-1, separate offering lines, bold labels, and intact thousands separators.');
