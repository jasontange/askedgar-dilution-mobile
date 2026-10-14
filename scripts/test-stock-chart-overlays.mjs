import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const dir=path.resolve('.sites-runtime/chart-overlay-tests');
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),'{"type":"commonjs"}');
for(const source of ['stock-chart-overlays','stock-chart-events-provider','stock-chart','dilution-price','company-news']){
  fs.writeFileSync(path.join(dir,source+'.js'),ts.transpileModule(fs.readFileSync('lib/'+source+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
}
const require=createRequire(path.join(dir,'test.cjs'));
const {newsTone,eventDate,offeringEvent,newsEvent,dilutionLevels,placeChartEvents,PRICE_COLORS}=require('./stock-chart-overlays.js');
const {createChartEventsService}=require('./stock-chart-events-provider.js');

// Tag colors must be conservative, with negative tags winning mixed-tag records.
for(const tag of ['Dilution','Stock Splits','Financial Trouble','Bankruptcy','Offering','payment_defaults'])assert.equal(newsTone([tag]).tone,'red');
assert.equal(newsTone(['Positive Data','Dilution']).tone,'red');
assert.equal(newsTone(['Partnerships']).tone,'green');
for(const tags of [[],['Earnings'],['FDA'],['Clinical Trials'],['Unrecognized tag']])assert.equal(newsTone(tags).tone,'yellow');

const levels=dilutionLevels([
  {details:'Warrant A',warrants_exercise_price:'1',warrants_remaining:100},
  {details:'Warrant B',warrants_exercise_price:1,warrants_remaining:100},
  {details:'Convertible floor',conversion_price:6,floor_price:'0.5',underlying_shares_remaining:100},
  {details:'Higher floor',conversion_price:2,floor_price:3,convertible_debt_remaining:10},
  {details:'Red exercise',warrants_exercise_price:4,warrants_remaining:20},
  {details:'Variable exercise',warrants_exercise_price:5,warrants_remaining:20,price_protection:'Variable Rate'},
  {details:'Retired',conversion_price:9,underlying_shares_remaining:0},
  {details:'Missing prices',conversion_price:'',floor_price:null},
  {details:'Invalid price',warrants_exercise_price:-1},
],1);
assert.deepEqual(levels.map(l=>l.price),[0.5,1,2,4,5,9]);
assert.deepEqual(levels.map(l=>l.color),['#159447','#159447','#ad7d00','#ed424f','#ad7d00','#6b7280']);
assert.equal(levels[0].label,'Floor');assert.equal(levels[1].details.length,2);assert.equal(levels[2].label,'Conversion');
assert.equal(dilutionLevels([{conversion_price:2,floor_price:2}],1)[0].label,'Conversion');
assert.equal(dilutionLevels([{conversion_price:'N/A',floor_price:0.25}],1)[0].label,'Floor');
assert.equal(dilutionLevels([{warrants_exercise_price:1}],null)[0].color,PRICE_COLORS['price-neutral']);

const offering=offeringEvent({filed_at:'2026-10-12',share_price:'1.25',offering_amount:'10000000',headline:'Registered direct offering',askedgar_url:'javascript:alert(1)',document_url:'https://www.sec.gov/example'});
assert.equal(offering.sharePrice,1.25);assert.equal(offering.amount,10000000);assert.equal(offering.timestamp,null);assert.equal(offering.url,'https://www.sec.gov/example');
assert.equal(offeringEvent({filed_at:'invalid'}),null);
assert.equal(offeringEvent({filed_at:'2026-10-12',share_price:'',offering_amount:null}).sharePrice,null);
assert.equal(eventDate('2026-02-30'),null);
assert.equal(eventDate('2026-10-13T00:15:00Z').day,'2026-10-12');
assert.equal(eventDate('2026-10-12T09:30:00').timestamp,null);
assert.equal(newsEvent({form_type:'grok',filed_at:'2026-10-12'}),null);
assert.equal(newsEvent({form_type:'8-K',filed_at:'2026-10-12',tags:['Dilution']}).tone,'red');

const sec=s=>Date.parse(s)/1000;
const bar=s=>({time:sec(s),open:1,high:2,low:1,close:2,volume:100});
const event=date=>newsEvent({form_type:'News',filed_at_time:date,headline:'Test event'});
const bars=[bar('2026-10-12T13:30:00Z'),bar('2026-10-12T19:30:00Z'),bar('2026-10-13T13:30:00Z')];
assert.equal(placeChartEvents([event('2026-10-12T13:34:00Z')],bars,'5m')[0].time,bars[0].time);
assert.equal(placeChartEvents([event('2026-10-12T12:30:00Z')],bars,'5m')[0].time,bars[0].time);
// 16:10 ET must not be attached to the final 15:30 regular hourly candle.
const gap=placeChartEvents([event('2026-10-12T20:10:00Z')],bars,'1h')[0];
assert.equal(gap.time,bars[2].time);assert.match(gap.note,/gap/);
assert.equal(placeChartEvents([event('2026-10-12T20:10:00Z')],bars.slice(0,2),'1h').length,0);
assert.equal(placeChartEvents([event('2026-10-12')],bars,'1h')[0].time,bars[0].time);
assert.equal(placeChartEvents([event('2026-10-12T13:30:00Z')],bars,'1D')[0].time,'2026-10-12');
assert.equal(placeChartEvents([event('2026-10-10')],[bar('2026-10-09T13:30:00Z'),bars[0]],'1D')[0].time,'2026-10-12');
assert.equal(placeChartEvents([event('2026-10-12')],[],'1D').length,0);
const winter=[bar('2026-01-12T14:30:00Z')];
assert.equal(placeChartEvents([event('2026-01-12T09:34:00-05:00')],winter,'5m')[0].time,winter[0].time);

let calls=0,clock=Date.parse('2026-10-12T17:00:00Z');
const source={ticker:'TEST',form_type:'News',filed_at_time:'2026-10-12T13:30:00Z',headline:'Test',tags:['Dilution']};
const service=createChartEventsService(async(url,options)=>{
  calls++;const u=new URL(url);assert.equal(options.headers['API-KEY'],'private-key');assert.ok(!url.includes('private-key'));
  assert.equal(u.searchParams.get('limit'),'100');
  if(u.pathname.endsWith('/news')){
    assert.equal(u.searchParams.get('include_summary'),'false');assert.equal(u.searchParams.get('include_body'),'false');
    assert.equal(u.searchParams.get('date_from'),'2026-10-01');
    return Response.json({results:[source,source,{...source,ticker:'OTHER'},{...source,form_type:'grok'},{...source,filed_at_time:'bad date'},{...source,filed_at_time:'2026-09-12'}],has_more:true});
  }
  assert.equal(u.pathname,'/v1/offerings-advanced');assert.equal(u.searchParams.has('date_from'),false);
  return Response.json({results:[{ticker:'TEST',filed_at:'2026-10-12',share_price:1,offering_amount:1000}],has_more:false});
},()=>clock);
const request=(kind='news',page=1)=>service.get('TEST',kind,'2026-10-01','2026-10-12',page,'private-key');
const [a,b]=await Promise.all([request(),request()]);
assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.events.length,1);assert.equal(a.skipped,1);assert.equal(a.nextPage,2);assert.equal(a.hasMore,true);
await request();assert.equal(calls,1);await request('news',2);assert.equal(calls,2);
clock+=300001;await request();assert.equal(calls,3);
const offeringPage=await request('offerings');assert.equal(offeringPage.hasMore,false);assert.equal(offeringPage.events[0].amount,1000);
await assert.rejects(service.get('TEST','news','2026-10-13','2026-10-12',1,'private-key'),/Invalid/);
await assert.rejects(service.get('TEST','news','2026-10-01','2026-10-12',0,'private-key'),/Invalid/);
await assert.rejects(service.get('TEST','news','2026-10-01','2026-10-12',1),/not configured/);
for(const status of [401,402,403,429]){
  const failed=createChartEventsService(async()=>Response.json({error:'private-key and upstream detail'},{status}));
  await assert.rejects(failed.get('TEST','news','2026-10-01','2026-10-12',1,'private-key'),error=>!error.message.includes('private-key')&&error.status===502);
}
const incomplete=createChartEventsService(async()=>Response.json({results:[]}));
await assert.rejects(incomplete.get('TEST','news','2026-10-01','2026-10-12',1,'private-key'),/incomplete/);
console.log('Overlay checks passed: floor selection, shared price colors, mixed tags, dates/session gaps, safe links, pagination, deduplication, request caching, and provider failures.');
