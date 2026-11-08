import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const target=path.resolve('.sites-runtime/dilution-changes-tests');
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'package.json'),'{"type":"commonjs"}');
for(const file of ['lib/dilution-changes.ts','lib/dilution-price.ts','app/dilution-changes.tsx','app/instrument-cards.tsx']){
  const destination=path.join(target,file.replace(/\.tsx?$/,'.js'));
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText);
}
const require=createRequire(path.join(target,'test.cjs'));
const {parseDilutionDetails,dilutionChanges}=require('./lib/dilution-changes.js');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {default:Feed,InstrumentDetails}=require('./app/dilution-changes.js');
const Cards=require('./app/instrument-cards.js').default;
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
const clause='Original terms with an ordinary 2026-01-01 date. **2026-06-08 First closing. **2026-11-04** - Latest conversion.\nSecond paragraph. **2026-08-19 Principal reduced. **2026-07-21 Floor unchanged.';
const parsed=parseDilutionDetails(clause);
assert.equal(parsed.terms,'Original terms with an ordinary 2026-01-01 date.');
assert.deepEqual(parsed.changes.map(c=>c.date),['2026-11-04','2026-08-19','2026-07-21','2026-06-08']);
assert.equal(parsed.changes[0].text,'Latest conversion.\nSecond paragraph.');
assert.deepEqual(parseDilutionDetails(null),{terms:'',changes:[]});
assert.deepEqual(parseDilutionDetails('No updates. **bold**'),{terms:'No updates. **bold**',changes:[]});
assert.equal(parseDilutionDetails('**2026-02-30 Invalid date').changes.length,0);
assert.equal(parseDilutionDetails('**2024-02-29 Leap day').changes.length,1);
assert.equal(parseDilutionDetails('**2026-01-01 **2026-02-01 Body').changes.length,1);
const rows=[{details:'Note',conversion_price:1,underlying_shares_remaining:0,pp_clause:clause},{details:'Warrant',warrants_remaining:50,pp_clause:'**2026-11-05 Reset.'},{details:'Other',pp_clause:'**2026-11-06 Not an instrument.'}];
const feed=dilutionChanges(rows);
assert.equal(feed.length,5);
assert.equal(feed[0].kind,'Warrant');
assert.equal(feed[1].name,'Note'); // Exhausted notes remain in the history.
const html=render(Feed,{rows,complete:true});
assert.equal((html.match(/<time /g)||[]).length,3);
assert.ok(html.includes('Show all 5 changes'));
assert.ok(html.includes('aria-expanded="false"'));
const details=render(InstrumentDetails,{value:clause});
assert.equal((details.match(/<time /g)||[]).length,2);
assert.ok(details.indexOf('Latest conversion')<details.indexOf('Original terms'));
assert.ok(details.includes('Show all (2 earlier changes)'));
assert.ok(!details.includes('**2026'));
assert.ok(render(InstrumentDetails,{value:'**2026-11-04 <script>alert(1)</script>'}).includes('&lt;script&gt;'));
assert.ok(render(Feed,{rows:[],complete:false}).includes('Only part of the instrument history loaded'));
const cards=render(Cards,{title:'Convertibles',subtitle:'Details',rows:[rows[0]],kind:'convertible',stockPrice:1});
assert.equal((cards.match(/Details &amp; changes/g)||[]).length,2); // Desktop and mobile.
assert.ok(!cards.includes('**2026'));
console.log('PASS: dated delimiter parsing, valid dates, newest-first sorting, all-instrument history, collapsed previews, accessible controls, and escaped card content.');
