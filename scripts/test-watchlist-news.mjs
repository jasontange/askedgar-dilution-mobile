import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {testCacheDb} from './test-cache-db.mjs';
const db=testCacheDb();globalThis.__newsTestDb=db;

const target=path.resolve('.sites-runtime/watchlist-news-tests');
fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'package.json'),'{"type":"commonjs"}');
for(const file of ['lib/response-cache.ts','lib/askedgar-api.ts','app/api/news/route.ts','lib/watchlist.ts','lib/company-news.ts','lib/provider-message.ts']){
  const destination=path.join(target,file.replace(/\.ts$/,'.js'));
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  fs.writeFileSync(destination,code.replaceAll('require("cloudflare:workers")','({env:{ASKEDGAR_API_KEY:"test-only",DB:globalThis.__newsTestDb}})'));
}
const require=createRequire(path.join(target,'test.cjs'));
const {GET}=require('./app/api/news/route.js');
const {nextWatchBatch}=require('./lib/watchlist.js');
const originalFetch=globalThis.fetch,originalNow=Date.now;
let calls=[],now=originalNow(),provider;
Date.now=()=>now;
globalThis.fetch=async(url,options)=>{
  const query=new URL(url).searchParams;calls.push(query);
  assert.equal(options.headers['API-KEY'],'test-only');
  assert.equal(query.get('limit'),'5');assert.equal(query.get('include_body'),'false');
  return provider(query);
};
const record=(form_type='news')=>({ticker:'AAPL',form_type,title:'Example',filed_at:'2026-10-10',summary:'Details'});
const success=(results,has_more=true)=>Response.json({status:'success',results,has_more});
const get=(ticker='AAPL',extra={})=>GET(new Request('https://site.test/api/news?'+new URLSearchParams({ticker,view:'watchlist',...extra})));
try{
  provider=()=>success(Array.from({length:5},()=>record('grok')));
  let body=await (await get()).json();
  assert.equal(calls.length,1,'Commentary-only watchlist page must not scan extra pages');
  assert.equal(body.rows.length,0);assert.equal(body.nextPage,2);assert.equal(body.hasMore,true);
  await get();assert.equal(calls.length,1,'Repeated watchlist requests must use the five-minute cache');

  now+=300001;
  let release;
  provider=()=>new Promise(resolve=>release=()=>resolve(success([record()])));
  const first=get(),second=get();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,2,'Concurrent requests must share one upstream call');
  release();
  assert.deepEqual(await (await first).json(),await (await second).json());

  provider=()=>success(Array.from({length:8},()=>record()));
  body=await (await get('MSFT',{kind:'filings',tag:'Offerings'})).json();
  assert.equal(body.rows.length,0,'Keep record-type filtering');
  assert.equal(calls.at(-1).get('hide_news'),'true');assert.equal(calls.at(-1).get('tag'),'Offerings');
  body=await (await get('MSFT')).json();assert.equal(body.rows.length,5,'Never expose more than five items per ticker');

  const before=calls.length;
  assert.equal((await get('AAPL,MSFT')).status,400);
  assert.equal((await get('AAPL',{page:'0'})).status,400);
  assert.equal((await get('AAPL',{kind:'other'})).status,400);
  assert.equal((await get('AAPL',{tag:'Invalid'})).status,400);
  assert.equal(calls.length,before,'Invalid inputs must not consume calls');

  provider=()=>Response.json({}, {status:402});
  const failure=await get('ERR');assert.equal(failure.status,502);
  assert.match((await failure.json()).error,/credits/);
  provider=()=>success([record()],false);
  body=await (await get('ERR')).json();assert.equal(body.hasMore,false,'Errors must remain retryable');

  const start=calls.length;
  const batch=nextWatchBatch(Array.from({length:50},(_,i)=>'T'+i),{});
  provider=()=>success(Array.from({length:5},()=>record()));
  const pages=await Promise.all(batch.map(async ticker=>(await get(ticker)).json()));
  assert.equal(calls.length-start,4,'A 50-ticker watchlist initially consumes at most four upstream calls');
  assert.equal(pages.reduce((count,page)=>count+page.rows.length,0),20);

  // Ticker-detail behavior is unchanged; it shares reusable upstream pages.
  const sharedStart=calls.length;await get('AAPL',{view:'company'});assert.equal(calls.length,sharedStart);
  const companyStart=calls.length;
  provider=query=>success([record(Number(query.get('page'))<3?'grok':'news')]);
  body=await (await get('SKIP',{view:'company'})).json();
  assert.equal(calls.length-companyStart,3);assert.equal(body.rows.length,1);assert.equal(body.nextPage,4);
  console.log('PASS: 20-item/four-call initial budget, no hidden watchlist page scans, cache expiry, concurrent request sharing, filters, retryable errors, and unchanged ticker-detail pagination.');
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;db.sqlite.close();delete globalThis.__newsTestDb;}
