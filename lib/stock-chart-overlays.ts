import {finiteNumber,priceSignal} from './dilution-price';
import {newsItem,type NewsItem} from './company-news';
import {chartSession,easternParts,type ChartBar,type ChartInterval} from './stock-chart';
export type OverlayKind='offerings'|'news';
export type EventTone='red'|'yellow'|'green';
export type ChartEvent={id:string;kind:OverlayKind;date:string;day:string;timestamp:number|null;headline:string;url:string|null;sharePrice:number|null;amount:number|null;formType:string;tags:string[];tone:EventTone;toneReason:string;record?:Record<string,unknown>;lookupDate?:string};
export type EventPage={ticker:string;kind:OverlayKind;events:ChartEvent[];nextPage:number;hasMore:boolean;fetchedAt:string;skipped:number};
export const PRICE_COLORS:Record<string,string>={'price-green':'#159447','price-yellow':'#ad7d00','price-red':'#ed424f','price-neutral':'#6b7280'};
export const EVENT_COLORS:Record<EventTone,string>={red:'#ed424f',yellow:'#ad7d00',green:'#159447'};
const negatives=new Set(['dilution','stock split','stock splits','reverse split','reverse splits','financial trouble','offering','offerings','offer for sale','payment default','payment defaults','bankruptcy','delisting','delisting actions','insider selling','workforce reduction','negative data','legal disputes','operational disruptions']);
const positives=new Set(['contract','contracts','partnership','partnerships','buyback','share buyback','insider buying','positive data','product launch','product launches','license agreements','patents','expansion plans','dividends']);
const normalized=(value:string)=>value.trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
export function newsTone(tags:string[]):{tone:EventTone;reason:string}{
  const red=tags.filter(tag=>negatives.has(normalized(tag)));
  if(red.length)return {tone:'red',reason:'Negative tags: '+red.join(', ')};
  const green=tags.filter(tag=>positives.has(normalized(tag)));
  if(green.length)return {tone:'green',reason:'Positive tags: '+green.join(', ')};
  return {tone:'yellow',reason:tags.length?'Neutral or unclear tags':'No event tags supplied'};
}
export function eventDate(value:unknown):{date:string;day:string;timestamp:number|null}|null{
  if(typeof value!=='string')return null;
  const date=value.trim();if(!/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(date))return null;
  const isoDay=date.slice(0,10),check=new Date(isoDay+'T12:00:00Z');
  if(!Number.isFinite(check.getTime())||check.toISOString().slice(0,10)!==isoDay)return null;
  const timestamp=/[T ]\d{2}:\d{2}.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(date)?Date.parse(date)/1000:null;
  if(timestamp!==null&&!Number.isFinite(timestamp))return null;
  return {date,day:timestamp===null?isoDay:easternParts(timestamp).date,timestamp};
}
function safeUrl(value:unknown){try{const u=new URL(String(value));return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
function nonnegative(v:unknown){const n=finiteNumber(v);return n!==null&&n>=0?n:null;}
export function offeringEvent(row:Record<string,unknown>):ChartEvent|null{
  const date=eventDate(row.filed_at_time)||eventDate(row.filed_at);if(!date)return null;
  const headline=text(row.headline)||text(row.offering_type)||'Offering';
  const url=safeUrl(row.askedgar_url)||safeUrl(row.document_url);
  const sharePrice=nonnegative(row.share_price),amount=nonnegative(row.offering_amount);
  return {...date,id:JSON.stringify(['offering',date.date,headline,sharePrice,amount,url]),kind:'offerings',headline,url,sharePrice,amount,formType:text(row.form_type)||'Offering',tags:[],tone:'yellow',toneReason:'Offering record; date is the source filing date',record:row};
}
export function newsEvent(row:Record<string,unknown>):ChartEvent|null{
  const item:NewsItem|null=newsItem(row);if(!item)return null;
  const date=eventDate(item.date);if(!date)return null;
  const {tone,reason}=newsTone(item.tags);
  return {...date,id:JSON.stringify(['news',date.date,item.formType,item.headline,item.url]),kind:'news',headline:item.headline,url:item.url,sharePrice:null,amount:null,formType:item.formType,tags:item.tags,tone,toneReason:reason,lookupDate:eventDate(row.filed_at)?.date.slice(0,10)||date.date.slice(0,10)};
}
export type DilutionInstrument={row:Record<string,unknown>;kind:string;description:string};
export type DilutionLevel={price:number;color:string;label:string;details:string[];instruments:DilutionInstrument[]};
export function dilutionLevels(rows:Record<string,unknown>[],stockPrice:number|null):DilutionLevel[]{
  const levels=new Map<string,DilutionLevel>();
  function add(value:unknown,kind:string,row:Record<string,unknown>,remaining:unknown){
    const price=finiteNumber(value);if(price===null||price<0)return;
    const signal=priceSignal(price,stockPrice,remaining,row.price_protection),color=PRICE_COLORS[signal.className];
    const key=price+':'+color,name=text(row.details)||'Unnamed instrument';
    const detail=kind+': '+name+' — '+signal.description;
    const existing=levels.get(key);
    if(existing){if(!existing.details.includes(detail))existing.details.push(detail);existing.instruments.push({row,kind,description:signal.description});if(!existing.label.split(' / ').includes(kind))existing.label+=' / '+kind;}
    else levels.set(key,{price,color,label:kind,details:[detail],instruments:[{row,kind,description:signal.description}]});
  }
  for(const row of rows){
    if('warrants_exercise_price' in row)add(row.warrants_exercise_price,'Exercise',row,row.warrants_remaining);
    if('conversion_price' in row||'convertible_debt_remaining' in row||'underlying_shares_remaining' in row){
      const conversion=nonnegative(row.conversion_price),floor=nonnegative(row.floor_price);
      const useFloor=floor!==null&&(conversion===null||floor<conversion);
      add(useFloor?floor:conversion,useFloor?'Floor':'Conversion',row,row.underlying_shares_remaining??row.convertible_debt_remaining);
    }
  }
  return [...levels.values()].sort((a,b)=>a.price-b.price);
}
export type PositionedEvent={event:ChartEvent;time:number|string;note:string};
// Map events to existing candles only: preserve source times and explain compressed gaps.
export function placeChartEvents(events:ChartEvent[],bars:ChartBar[],interval:ChartInterval):PositionedEvent[]{
  if(!bars.length)return [];
  const days=bars.map(b=>easternParts(b.time).date),first=days[0],last=days.at(-1)!;
  const size=(interval==='1h'?60:interval==='1D'?1440:Number(interval.slice(0,-1)))*60;
  return events.flatMap(event=>{
    if(event.day<first||event.day>last)return [];
    let lo=0,hi=bars.length;
    if(interval==='1D'||event.timestamp===null){
      while(lo<hi){const mid=(lo+hi)>>>1;if(days[mid]<event.day)lo=mid+1;else hi=mid;}
    }else{
      const stamp=event.timestamp;
      while(lo<hi){const mid=(lo+hi)>>>1;if(bars[mid].time<=stamp)lo=mid+1;else hi=mid;}
      if(lo>0&&stamp<bars[lo-1].time+size&&days[lo-1]===event.day&&chartSession(stamp)===chartSession(bars[lo-1].time))lo--;
    }
    if(lo>=bars.length)return [];
    const bar=bars[lo],day=days[lo];
    let note=interval==='1D'?'Placed on the daily candle.':event.timestamp===null?'Date only; placed on the first available candle for that date.':'Placed on the candle containing the source timestamp.';
    if(day!==event.day||event.timestamp!==null&&interval!=='1D'&&event.timestamp<bar.time)note='Placed on the next visible candle because the event falls in a chart/session gap.';
    return [{event,time:interval==='1D'?day:bar.time,note}];
  });
}
