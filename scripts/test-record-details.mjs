import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';

const target=path.resolve('.sites-runtime/record-details-tests');
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'package.json'),'{"type":"commonjs"}');
for(const file of ['app/company-tables.tsx','app/company-news.tsx','app/news-summary.tsx','app/details-dialog.tsx','lib/detail-navigation.ts','lib/company-news.ts','lib/corporate-actions.ts','lib/dilution-price.ts']){
  const destination=path.join(target,file.replace(/\.tsx?$/,'.js'));
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText);
}
const require=createRequire(path.join(target,'test.cjs'));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {DataTable,TableRecordDetails,offeringColumns,ownershipColumns,actionColumns,splitColumns}=require('./app/company-tables.js');
const {NewsList}=require('./app/company-news.js');
const NewsSummary=require('./app/news-summary.js').default;
const DetailsDialog=require('./app/details-dialog.js').default;
const {nextDetail}=require('./lib/detail-navigation.js');
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));

for(const [title,columns,row] of [
  ['Offering history',offeringColumns,{headline:'Offering headline',details:'**Financing** terms',selling_shareholder_details:'Selling shareholder disclosure',offering_amount:5000000,askedgar_url:'https://www.sec.gov/Archives/filing'}],
  ['Ownership',ownershipColumns,{owner_name:'Example holder',classes_details:'Class A common shares',common_shares_amount:12345}],
  ['Corporate actions',actionColumns,{action_type:'vote approved',details:'Approved split details',split_from:20,split_to:1}],
]){
  const table=render(DataTable,{title,columns,rows:[row]});
  assert.match(table,/<th scope="row"[^>]*><div class="table-row-heading"><button/);
  assert.match(table,/aria-haspopup="dialog"/);
  assert.equal((table.match(/class="news-summary-star details-trigger"/g)||[]).length,1);
  assert.ok(!table.includes('<details'));
  const details=render(TableRecordDetails,{row,columns});
  for(const column of columns.filter(column=>column.format==='details'))assert.ok(details.includes(row[column.key]));
  assert.ok(details.includes('record-facts'));
  if(title==='Offering history'){
    assert.match(table,/<thead><tr><th scope="col">Title<\/th>/);
    assert.ok(details.includes('<strong>Financing</strong> terms'));
    assert.ok(details.includes('$5M'));
    assert.ok(details.includes('https://www.sec.gov/Archives/filing'));
  }
}
assert.ok(!render(DataTable,{title:'Reverse splits',columns:splitColumns,rows:[{split_from:10,split_to:1}]}).includes('details-trigger'));
const hostile=render(TableRecordDetails,{row:{details:'<script>alert(1)</script>'},columns:actionColumns});
assert.ok(hostile.includes('&lt;script&gt;'));
assert.ok(!hostile.includes('<script>'));

const item={date:'2026-10-10T12:00:00Z',formType:'8-K',headline:'Example filing',headlineSource:'title',summary:'Provider summary',tags:[],url:null};
const news=render(NewsList,{rows:[item],onSummary:()=>{}});
assert.match(news,/<li class="news-has-details"><button/);
assert.ok(news.indexOf('details-trigger')<news.indexOf('<time'));
const shared={index:0,total:2,hasMore:false,loading:false,error:'',onClose:()=>{},onPrevious:()=>{},onNext:()=>{}};
const summary=render(NewsSummary,{item,...shared});
assert.ok(summary.includes('Provider summary'));
assert.ok(summary.includes('news-summary-dialog'));
for(const [index,hasMore,previousDisabled,nextDisabled] of [[0,false,true,false],[1,false,false,true],[1,true,false,false]]){
  const modal=render(DetailsDialog,{title:'Record',item,children:'Record details',...shared,index,hasMore});
  const previous=modal.match(/<button[^>]*>← Previous<\/button>/)[0];
  const next=modal.match(/<button[^>]*>Next →<\/button>/)[0];
  assert.equal(previous.includes('disabled'),previousDisabled);
  assert.equal(next.includes('disabled'),nextDisabled);
}

const rows=[{id:1},{id:2}],older={id:3};let calls=0;
const loadMore=async()=>{calls++;return [older];};
assert.equal(await nextDetail(rows,0,true,loadMore),rows[1]);assert.equal(calls,0);
assert.equal(await nextDetail(rows,1,true,loadMore),older);assert.equal(calls,1);
assert.equal(await nextDetail(rows,1,false,loadMore),undefined);assert.equal(calls,1);
assert.equal(await nextDetail(rows,-1,true,loadMore),undefined);assert.equal(calls,1);
assert.equal(await nextDetail(rows,1,true,async()=>[]),undefined);
assert.equal(await nextDetail(rows,1,true,async()=>undefined),undefined);
console.log('PASS: leftmost stars, headline-first offerings, complete escaped details, shared news/table dialogs, Previous/Next boundaries, and pagination.');
