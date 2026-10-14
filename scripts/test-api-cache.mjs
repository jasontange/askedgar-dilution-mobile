import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {testCacheDb} from './test-cache-db.mjs';

const target=path.resolve('.sites-runtime/api-cache-tests');
fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'package.json'),'{"type":"commonjs"}');
for(const file of ['lib/response-cache.ts','lib/askedgar-api.ts','lib/company-news.ts','lib/company-counts.ts','lib/provider-message.ts','lib/dilution-price.ts','lib/watchlist.ts','app/api/dilution/route.ts','app/api/company-tables/route.ts','app/api/company-counts/route.ts','app/api/news/route.ts']){
  const destination=path.join(target,file.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(destination),{recursive:true});
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  fs.writeFileSync(destination,code.replaceAll('require("cloudflare:workers")','({env:globalThis.__cacheTestEnv})'));
}
const require=createRequire(path.join(target,'test.cjs')),db=testCacheDb();
globalThis.__cacheTestEnv={DB:db,ASKEDGAR_API_KEY:'test-only'};
const {cachedValue}=require('./lib/response-cache.js');
let api=require('./lib/askedgar-api.js');
const dilution=require('./app/api/dilution/route.js'),tables=require('./app/api/company-tables/route.js'),counts=require('./app/api/company-counts/route.js'),news=require('./app/api/news/route.js');
const originalFetch=globalThis.fetch,originalNow=Date.now;
let now=originalNow(),calls=[],provider;
Date.now=()=>now;
const params=(ticker='DVLT')=>new URLSearchParams({ticker,page:'1',limit:'100'});
const record=(ticker)=>({ticker,companyname:'Example',market_cap_final:50000000,price:2,headline:'REGISTERED OFFERING',title:'Example news',form_type:'news',filed_at:new Date().toISOString()});
const success=(results,has_more=false)=>Response.json({status:'success',results,has_more,usage:{credits_remaining:123}});
globalThis.fetch=async(url)=>{const parsed=new URL(url);calls.push(parsed);return provider(parsed);};
const normal=url=>success([record(url.searchParams.get('ticker'))]);
provider=normal;
const request=(route,query)=>route.GET(new Request('https://site.test/api/data?'+new URLSearchParams(query)));
const json=async(response)=>{const r=await response;assert.equal(r.status,200);return r.json();};
try{
  const expected={screener:300000,news:300000,'dilution-rating':3600000,'dilution-data':3600000,'dilution-data-advanced':3600000,offerings:43200000,'offerings-advanced':43200000,ownership:43200000,'split-status':43200000,'reverse-splits':43200000};
  assert.deepEqual(api.ENDPOINT_CACHE_MS,expected);
  for(const [endpoint,ttl] of Object.entries(expected)){
    const first=await api.askedgarPage(endpoint,params('TTL')),start=calls.length;
    now+=ttl-1;assert.equal((await api.askedgarPage(endpoint,params('TTL'))).fetchedAt,first.fetchedAt);assert.equal(calls.length,start);
    now++;await api.askedgarPage(endpoint,params('TTL'));assert.equal(calls.length,start+1);
  }
  let start=calls.length;
  const first=await api.askedgarPage('ownership',params('PERSIST'));
  delete require.cache[require.resolve('./lib/askedgar-api.js')];api=require('./lib/askedgar-api.js');
  const repeated=await api.askedgarPage('ownership',new URLSearchParams({limit:'100',page:'1',ticker:'PERSIST'}));
  assert.equal(calls.length,start+1,'A new worker/module and reordered query must reuse persistent data');
  assert.deepEqual(repeated,first);assert(!JSON.stringify(repeated).includes('credits_remaining'));
  await api.askedgarPage('ownership',new URLSearchParams({ticker:'PERSIST',page:'2',limit:'100'}));assert.equal(calls.length,start+2,'Pages must not collide');
  await api.askedgarPage('ownership',new URLSearchParams({ticker:'PERSIST',page:'1',limit:'5'}));assert.equal(calls.length,start+3,'Page sizes must not collide');

  let loads=0,release;
  const loader=()=>{loads++;return new Promise(resolve=>release=()=>resolve({answer:42}));};
  const concurrentA=cachedValue(db,'concurrent',10000,loader),concurrentB=cachedValue(db,'concurrent',10000,loader);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(loads,1);release();
  assert.deepEqual(await concurrentA,await concurrentB);assert.equal(loads,1);
  await db.prepare('INSERT INTO api_response_cache (key, lease_token, lease_until) VALUES (?, ?, ?)').bind('abandoned','old',now-1).run();
  assert.equal((await cachedValue(db,'abandoned',10000,async()=>7)).value,7,'Expired leases must recover');
  await assert.rejects(cachedValue(db,'failed',10000,async()=>{throw new Error('Upstream failure');}));
  assert.equal((await cachedValue(db,'failed',10000,async()=>8)).value,8,'Failures must release the lease');
  await db.prepare('INSERT INTO api_response_cache (key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)').bind('corrupt','{bad',now,now+10000).run();
  assert.equal((await cachedValue(db,'corrupt',10000,async()=>9)).value,9,'Malformed stored JSON must be repairable');

  // One-hour dilution responses must survive several independent price refreshes.
  start=calls.length;const initial=await json(request(dilution,{ticker:'BUNDLE'}));assert.equal(calls.length-start,3);
  now+=300001;start=calls.length;const updated=await json(request(dilution,{ticker:'BUNDLE'}));
  assert.equal(calls.length-start,1);assert(calls.at(-1).pathname.endsWith('/screener'));
  assert.equal(initial.dilutionFetchedAt,updated.dilutionFetchedAt);assert.equal(initial.ratingsFetchedAt,updated.ratingsFetchedAt);assert.notEqual(initial.fetchedAt,updated.fetchedAt);
  now+=3600000;start=calls.length;await json(request(dilution,{ticker:'BUNDLE'}));assert.equal(calls.length-start,3);

  // A failed screener must not replace/cache an incomplete combined company response.
  provider=url=>url.pathname.endsWith('/screener')?Response.json({},{status:503}):normal(url);
  const partial=await json(request(dilution,{ticker:'PARTIAL'}));assert.equal(partial.overview,null);assert.equal(partial.fetchedAt,null);
  provider=normal;start=calls.length;const recovered=await json(request(dilution,{ticker:'PARTIAL'}));
  assert.equal(calls.length-start,1);assert.equal(recovered.overview.market_cap_final,50000000);

  // Cache timestamps reflect the source response, never the latest browser visit.
  for(const kind of ['offerings','ownership','actions','splits']){
    const original=await json(request(tables,{ticker:'TABLE',kind}));now+=60000;start=calls.length;
    const cached=await json(request(tables,{ticker:'TABLE',kind}));assert.equal(calls.length,start);assert.equal(original.fetchedAt,cached.fetchedAt);
  }
  const initialCounts=await json(request(counts,{ticker:'COUNTS'}));assert.equal(initialCounts.registeredOfferingCount,1);
  now+=300001;start=calls.length;await json(request(counts,{ticker:'COUNTS'}));
  assert.equal(calls.length-start,1);assert(calls.at(-1).pathname.endsWith('/news'),'Only the news count expires at five minutes');
  provider=url=>url.pathname.endsWith('/offerings')?success([record('COUNTBAD')],null):normal(url);
  assert.equal((await json(request(counts,{ticker:'COUNTBAD'}))).registeredOfferingCount,null);
  provider=normal;start=calls.length;
  assert.equal((await json(request(counts,{ticker:'COUNTBAD'}))).registeredOfferingCount,1);
  assert.equal(calls.length-start,1,'Incomplete count pagination must not be cached as a success');

  start=calls.length;await json(request(news,{ticker:'SHARED',view:'watchlist'}));await json(request(news,{ticker:'SHARED'}));
  assert.equal(calls.length-start,1,'Watchlist and company news must reuse the same upstream page');
  const bad='BAD_RESPONSE';provider=()=>Response.json({status:'error',results:[]});
  await assert.rejects(api.askedgarPage('ownership',params(bad)));provider=normal;
  start=calls.length;await api.askedgarPage('ownership',params(bad));assert.equal(calls.length-start,1,'Provider errors must never become cached empty results');
  assert(!JSON.stringify(db.sqlite.prepare('SELECT * FROM api_response_cache').all()).includes('test-only'),'Never persist the API key');
  console.log('PASS: all endpoint TTL boundaries; persistent cross-worker reuse; canonical keys; concurrent misses; failed/abandoned leases; independent price/dilution/count freshness; accurate timestamps; retryable partial errors; and shared news pages.');
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;db.sqlite.close();delete globalThis.__cacheTestEnv;}
