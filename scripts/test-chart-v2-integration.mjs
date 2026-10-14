import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {testCacheDb} from './test-cache-db.mjs';
const dir=path.resolve('.sites-runtime/chart-v2-tests');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),'{"type":"commonjs"}');
for(const file of ['lib/chart-config.ts','lib/site-config.ts','lib/response-cache.ts','lib/askedgar-api.ts','lib/company-news.ts','lib/provider-message.ts','lib/dilution-price.ts','lib/watchlist.ts','lib/stock-chart.ts','lib/stock-chart-provider.ts','lib/stock-chart-overlays.ts','lib/stock-chart-events-provider.ts','app/api/chart-events/route.ts','app/api/chart/route.ts','app/api/news/route.ts']){
 const dest=path.join(dir,file.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('require("cloudflare:workers")','({env:globalThis.__chartEnv})'));
}
const require=createRequire(path.join(dir,'test.cjs')),db=testCacheDb();globalThis.__chartEnv={DB:db,ASKEDGAR_API_KEY:'test-only'};
const events=require('./app/api/chart-events/route.js'),news=require('./app/api/news/route.js'),chart=require('./app/api/chart/route.js');
const original=globalThis.fetch;const calls=[];
globalThis.fetch=async input=>{const url=new URL(input);calls.push(url);return Response.json({status:'success',has_more:false,results:[{ticker:'AAPL',title:'Test update',headline:'Test update',form_type:'news',filed_at:'2026-10-12T14:00:00Z',url:'https://example.com/test',summary:'Exact summary'}]});};
const request=(route,query)=>route.GET(new Request('https://site.test/api?'+new URLSearchParams(query)));
try{
 const {siteConfig}=require('./lib/site-config.js');
 siteConfig.chart.mode='embedded'; // Exercise both modes regardless of the selected deployment default.
 const {tradingViewSymbol,embeddedChartOptions}=require('./lib/chart-config.js');
 assert.equal(tradingViewSymbol('aapl','NASDAQ Global Select'),'NASDAQ:AAPL');
 assert.equal(tradingViewSymbol('ibm','NYSE'),'NYSE:IBM');
 assert.equal(tradingViewSymbol('btg','NYSE American'),'AMEX:BTG');
 assert.equal(tradingViewSymbol('abc','Unknown'),'ABC');
 assert.equal(tradingViewSymbol('abc'),'ABC');
 assert.equal(embeddedChartOptions('NASDAQ:AAPL').allow_symbol_change,false);
 globalThis.__chartEnv.MASSIVE_API_KEY='configured-but-unused';
 assert.equal((await request(chart,{ticker:'AAPL'})).status,404);
 assert.equal((await request(events,{ticker:'AAPL'})).status,404);
 assert.equal(calls.length,0,'Embedded mode must not use any provider, even when a Massive key exists');
 siteConfig.chart.mode='custom';
 delete globalThis.__chartEnv.MASSIVE_API_KEY;
 assert.equal((await request(chart,{ticker:'AAPL'})).status,503);
 assert.equal(calls.length,0,'Missing Massive key must not call an upstream provider');
 const q={ticker:'AAPL',kind:'news',from:'2026-10-12',to:'2026-10-12'};
 const first=await request(events,q);assert.equal(first.status,200);assert.equal((await first.json()).events.length,1);
 await request(events,q);assert.equal(calls.length,1,'Repeated overlays reuse data');
 assert.equal(calls[0].searchParams.get('date_from'),'2026-10-12');assert.equal(calls[0].searchParams.get('include_summary'),'false');
 assert(db.sqlite.prepare('SELECT COUNT(*) AS n FROM api_response_cache').get().n>0,'Overlay calls use V2 persistent cache');
 const detail={ticker:'AAPL',kind:'news',date_from:'2026-10-12',date_to:'2026-10-12',form_type:'news'};
 assert.equal((await request(news,detail)).status,200);const last=calls.at(-1);
 for(const name of ['date_from','date_to','form_type'])assert.equal(last.searchParams.get(name),detail[name]);
 await request(news,detail);assert.equal(calls.length,2,'Detail summaries reuse V2 persistent cache');
 assert.equal((await request(news,{ticker:'AAPL',date_from:'bad'})).status,400);
 assert.equal((await request(news,{ticker:'AAPL',form_type:'<script>'})).status,400);
 assert.equal((await request(events,{...q,from:'bad'})).status,400);
 assert.equal(JSON.parse(fs.readFileSync('.openai/hosting.json','utf8')).d1,'DB');
 assert(!fs.readFileSync('app/stock-chart.tsx','utf8').includes('dilution-lens-chart'));
 assert.match(fs.readFileSync('lib/site-config.ts','utf8'),/enabled:\s*false/);
 assert.match(fs.readFileSync('app/page.tsx','utf8'),/dilutionRows=\{visibleRows\}/);
 console.log('PASS: embedded mode makes zero provider calls; custom mode re-enables V2 chart integration, missing-key safety, overlay persistent cache, exact-summary filters, invalid inputs, cache database binding, isolated chart preferences, financials disabled.');
}finally{globalThis.fetch=original;db.sqlite.close();delete globalThis.__chartEnv;}
