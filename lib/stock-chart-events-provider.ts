import {eventDate,newsEvent,offeringEvent,type EventPage,type OverlayKind} from './stock-chart-overlays';
export class ChartEventsError extends Error{constructor(message:string,public status=502){super(message);}}
export function createChartEventsService(fetcher:typeof fetch=fetch,now:()=>number=Date.now){
  const cache=new Map<string,{expires:number;value:EventPage}>(),pending=new Map<string,Promise<EventPage>>();
  return {get(ticker:string,kind:OverlayKind,from:string,to:string,page:number,apiKey?:string):Promise<EventPage>{
    if(!/^[A-Z][A-Z0-9.\-]{0,19}$/.test(ticker)||!['news','offerings'].includes(kind)||!Number.isSafeInteger(page)||page<1||page>1000||!eventDate(from)||from.length!==10||!eventDate(to)||to.length!==10||from>to||Date.parse(to)-Date.parse(from)>800*86400000)return Promise.reject(new ChartEventsError('Invalid chart event request.',400));
    if(!apiKey)return Promise.reject(new ChartEventsError('The chart event data connection is not configured.',503));
    const key=JSON.stringify([ticker,kind,from,to,page]),cached=cache.get(key);if(cached&&cached.expires>now())return Promise.resolve(cached.value);
    const previous=pending.get(key);if(previous)return previous;
    const task=(async()=>{
      const query=new URLSearchParams({ticker,page:String(page),limit:'100'});
      if(kind==='news'){query.set('date_from',from);query.set('date_to',to);query.set('include_summary','false');query.set('include_body','false');}
      const response=await fetcher('https://eapi.askedgar.io/v1/'+(kind==='news'?'news':'offerings-advanced')+'?'+query,{headers:{'API-KEY':apiKey},signal:AbortSignal.timeout(25000)});
      if(!response.ok){const reason=response.status===402?'AskEdgar credits are unavailable.':response.status===429?'The event data request limit was reached. Try again shortly.':'Chart '+(kind==='news'?'news and filings':'offerings')+' could not be loaded.';throw new ChartEventsError(reason);}
      const body=await response.json() as {status?:string;results?:unknown[];has_more?:boolean};
      if(body.status==='error'||!Array.isArray(body.results)||typeof body.has_more!=='boolean')throw new ChartEventsError('The provider returned incomplete event data.');
      const events:EventPage['events']=[],seen=new Set<string>();let skipped=0;
      for(const value of body.results){
        if(!value||typeof value!=='object'||Array.isArray(value))continue;
        const row=value as Record<string,unknown>;
        if(typeof row.ticker==='string'&&!row.ticker.toUpperCase().split(',').map(t=>t.trim()).includes(ticker))continue;
        if(kind==='news'&&['grok','jmt415'].includes(String(row.form_type).toLowerCase()))continue;
        const event=kind==='news'?newsEvent(row):offeringEvent(row);
        if(!event){skipped++;continue;}
        if(event.day<from||event.day>to||seen.has(event.id))continue;
        seen.add(event.id);events.push(event);
      }
      const value:EventPage={ticker,kind,events:events.sort((a,b)=>a.day.localeCompare(b.day)||(a.timestamp||0)-(b.timestamp||0)),nextPage:page+1,hasMore:body.has_more&&page<1000,fetchedAt:new Date(now()).toISOString(),skipped};
      if(cache.size>=100)cache.delete(cache.keys().next().value!);
      cache.set(key,{value,expires:now()+300000});return value;
    })().catch(error=>{throw error instanceof ChartEventsError?error:new ChartEventsError('The event data connection timed out. Try again.');}).finally(()=>pending.delete(key));
    pending.set(key,task);return task;
  }};
}
