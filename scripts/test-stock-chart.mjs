import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const dir=path.resolve('.sites-runtime/chart-tests');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),'{"type":"commonjs"}');
for(const source of ['lib/stock-chart.ts','lib/stock-chart-provider.ts','lib/watchlist.ts']){
 const dest=path.join(dir,source.replace(/\.ts$/,'.js'));fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
}
const require=createRequire(path.join(dir,'test.cjs'));
const {aggregateChartBars,normalizeChartBars,easternParts,chartVWAP,chartAxisPrice}=require('./lib/stock-chart.js');
const {createStockChartService}=require('./lib/stock-chart-provider.js');
const sec=s=>Date.parse(s)/1000;
const bar=(s,o,h,l,c,v)=>({time:sec(s),open:o,high:h,low:l,close:c,volume:v});
const minuteBars=[
 bar('2026-10-12T13:29:00Z',100,150,100,149,100),
 bar('2026-10-12T13:30:00Z',10,12,9,11,20),
 bar('2026-10-12T13:34:00Z',11,14,8,13,30),
 bar('2026-10-12T13:35:00Z',13,15,12,14,40),
 bar('2026-10-12T19:59:00Z',20,22,19,21,50),
 bar('2026-10-12T20:00:00Z',200,210,195,205,60),
 bar('2026-10-13T00:00:00Z',300,310,295,305,60),
];
const regular=aggregateChartBars(minuteBars,'5m',false);
assert.equal(regular.length,3);assert.deepEqual(regular[0],{time:sec('2026-10-12T13:30:00Z'),open:10,high:14,low:8,close:13,volume:50});
const extended=aggregateChartBars(minuteBars,'5m',true);assert.equal(extended.length,5);assert.equal(extended.at(-1).close,205);
const hourly=aggregateChartBars(minuteBars,'1h',false);assert.equal(hourly[0].time,sec('2026-10-12T13:30:00Z'));assert.equal(hourly[0].volume,90);assert.equal(hourly[0].high,15);
assert.equal(easternParts(sec('2026-01-12T14:30:00Z')).minute,570);assert.equal(easternParts(sec('2026-07-13T13:30:00Z')).minute,570);
const winter=[bar('2026-01-12T14:29:00Z',1,2,1,2,1),bar('2026-01-12T14:30:00Z',2,3,2,3,1)];assert.equal(aggregateChartBars(winter,'1m',false).length,1);
const raw=minuteBars.slice(0,3).map(b=>({t:b.time*1000,o:b.open,h:b.high,l:b.low,c:b.close,v:b.volume}));
assert.equal(normalizeChartBars([...raw.reverse(),raw[0],{t:1,o:null,h:2,l:1,c:1,v:0}]).length,3);
assert.deepEqual(aggregateChartBars(minuteBars,'1D',false),minuteBars);
let clock=Date.parse('2026-10-12T17:00:00Z'),calls=0;
const service=createStockChartService(async(url,opts)=>{calls++;assert.equal(opts.headers.Authorization,'Bearer private-key');assert.ok(!url.includes('private-key'));const u=new URL(url);assert.equal(u.searchParams.get('adjusted'),'true');assert.equal(u.searchParams.get('sort'),'asc');return Response.json({status:'DELAYED',results:raw});},()=>clock);
const [a,b]=await Promise.all([service.get('aapl','minute','private-key'),service.get('AAPL','minute','private-key')]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.ticker,'AAPL');assert.equal(a.delayed,true);assert.equal(a.from,'2026-09-28');assert.equal(a.to,'2026-10-12');
await service.get('AAPL','minute','private-key');assert.equal(calls,1);clock+=61000;await service.get('AAPL','minute','private-key');assert.equal(calls,2);
await service.get('AAPL','day','private-key');assert.equal(calls,3);clock+=61000;await service.get('AAPL','day','private-key');assert.equal(calls,3);
await assert.rejects(service.get('../bad','minute','private-key'),/valid stock ticker/);await assert.rejects(service.get('AAPL','minute'),/not configured/);
let errors=0;const unavailable=createStockChartService(async()=>{errors++;return Response.json({error:'sensitive upstream detail'},{status:403});},()=>clock);
await assert.rejects(unavailable.get('AAPL','minute','private-key'),/plan does not include/);await assert.rejects(unavailable.get('AAPL','minute','private-key'),/plan does not include/);assert.equal(errors,1);
const empty=await createStockChartService(async()=>Response.json({status:'OK',results:[]})).get('AAPL','day','private-key');assert.equal(empty.bars.length,0);
// VWAP uses provider per-bar VWAP and volume, not a simple average of prices.
const vwapBars=[
 {...bar('2026-10-12T13:29:00Z',100,102,99,101,1000),vwap:100},
 {...bar('2026-10-12T13:30:00Z',10,11,9,10,100),vwap:10},
 {...bar('2026-10-12T13:34:00Z',20,21,19,20,300),vwap:20},
 {...bar('2026-10-12T13:35:00Z',30,31,29,30,100),vwap:30},
 {...bar('2026-10-12T20:00:00Z',40,41,39,40,500),vwap:40},
 {...bar('2026-10-13T13:30:00Z',5,6,4,5,100),vwap:5},
];
const vwapRegular=chartVWAP(vwapBars,'5m',false);
assert.deepEqual(vwapRegular.map(p=>p.value),[17.5,20,5]);
assert.ok(vwapRegular.every(p=>!p.estimated));
const vwapMinute=chartVWAP(vwapBars,'1m',false);
assert.equal(vwapRegular[0].value,vwapMinute[1].value);
assert.equal(vwapRegular[1].value,vwapMinute[2].value);
assert.equal(chartVWAP(vwapBars,'1h',false)[0].value,20);
assert.deepEqual(vwapRegular.map(p=>p.time),aggregateChartBars(vwapBars,'5m',false).map(b=>b.time));
const vwapExtended=chartVWAP(vwapBars,'5m',true);
assert.equal(vwapExtended[0].value,100);assert.equal(vwapExtended[1].value,107000/1400);
assert.equal(vwapExtended[3].value,65);assert.equal(vwapExtended.at(-1).value,5);
assert.equal(aggregateChartBars(vwapBars,'5m',false)[0].vwap,17.5);
assert.equal(normalizeChartBars([{...raw[0],vw:1.2345}])[0].vwap,1.2345);
assert.equal(normalizeChartBars([{...raw[0],vw:NaN}])[0].vwap,undefined);
const noVolume=[{...vwapBars[1],volume:0},vwapBars[2],{...vwapBars[3],volume:0}];
assert.deepEqual(chartVWAP(noVolume,'1m',false).map(p=>p.value),[undefined,20,20]);
const estimates=[{...bar('2026-10-12T13:30:00Z',2,4,1,4,100)},vwapBars[2],vwapBars.at(-1)];
assert.deepEqual(chartVWAP(estimates,'1m',false).map(p=>p.estimated),[true,true,false]);
assert.equal(chartVWAP(estimates,'1m',false)[0].value,3);
const dailyVWAP=chartVWAP([vwapBars[1],vwapBars.at(-1)],'1D',false);
assert.deepEqual(dailyVWAP.map(p=>p.value),[10,5]); // Separate daily VWAPs, never a two-day cumulative average.
assert.equal(chartVWAP([{...winter[1],vwap:2.5}],'5m',false)[0].value,2.5);
assert.deepEqual(chartVWAP([],'5m',false),[]);
for(const [value,label] of [[60,'60'],[17.28,'17.28'],[2.547,'2.55'],[0,'0'],[-0,'0'],[0.005,'0.005'],[0.123456,'0.1235'],[0.000123456,'0.000123'],[0.00000001,'0.00000001'],[1234.5,'1,234.5']])assert.equal(chartAxisPrice(value),label);
// Lightweight Charts measures synthetic crosshair values to reserve axis width.
// These must stay compact even though their fractional digits never end in zero.
assert.equal(chartAxisPrice(2+.11111111111111),'2.11');
assert.equal(chartAxisPrice(4-.11111111111111),'3.89');
assert.equal(chartAxisPrice(-.11111111111111),'-0.1111');
assert.notEqual(chartAxisPrice(1e-10),'0');assert.equal(chartAxisPrice(NaN),'—');
console.log('Chart checks passed: VWAP volume weighting, session resets, extended hours, daily bars, zero volume, estimated inputs, compact price labels, OHLC aggregation, provider cache and errors.');
