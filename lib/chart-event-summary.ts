import type {NewsItem} from './company-news';
import type {ChartEvent} from './stock-chart-overlays';
export function matchesChartNews(event:ChartEvent,item:NewsItem){
  if(event.formType!==item.formType||!item.date)return false;
  // Never substitute another item from the same date's feed.
  const sameTime=event.date===item.date||Number.isFinite(Date.parse(event.date))&&Date.parse(event.date)===Date.parse(item.date);
  return sameTime&&(event.url&&item.url?event.url===item.url:event.headline===item.headline);
}
const cache=new Map<string,{expires:number;item:NewsItem|null}>();
export async function loadChartSummary(ticker:string,event:ChartEvent,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<NewsItem|null>{
  const key=ticker+':'+event.id,previous=cache.get(key);
  if(previous&&previous.expires>Date.now())return previous.item;
  const date=event.lookupDate||event.date.slice(0,10);
  let page=1,item:NewsItem|null=null;
  // Reuse the existing cached, five-record news route; only fetch on a detail tap.
  for(let batch=0;batch<10;batch++){
    const query=new URLSearchParams({ticker,kind:event.formType==='News'?'news':'filings',date_from:date,date_to:date,page:String(page)});
    if(/^[A-Za-z0-9 /,\-]{1,200}$/.test(event.formType))query.set('form_type',event.formType==='News'?'news':event.formType);
    const response=await fetcher('/api/news?'+query,{signal});
    const body=await response.json() as {rows:NewsItem[];nextPage:number;hasMore:boolean;error?:string};
    if(!response.ok)throw new Error(body.error||'The summary could not be loaded.');
    if(!Array.isArray(body.rows))throw new Error('The summary could not be loaded.');
    item=body.rows.find(row=>matchesChartNews(event,row))||null;
    if(item||!body.hasMore||!Number.isSafeInteger(body.nextPage)||body.nextPage<=page)break;
    page=body.nextPage;
  }
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  cache.set(key,{item,expires:Date.now()+300000});return item;
}
