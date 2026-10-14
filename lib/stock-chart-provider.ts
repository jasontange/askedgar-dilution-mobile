import {normalizeChartBars,easternParts,type ChartData} from './stock-chart';
import {normalizeTicker,validTicker} from './watchlist';
export class StockChartError extends Error{constructor(message:string,public status=502){super(message);}}
export function createStockChartService(fetcher:typeof fetch=fetch,now:()=>number=Date.now){
  const cache=new Map<string,{data:ChartData;expires:number}>();
  const pending=new Map<string,Promise<ChartData>>();
  const failures=new Map<string,{error:StockChartError;expires:number}>();
  async function load(ticker:string,kind:'minute'|'day',apiKey:string):Promise<ChartData>{
    const to=easternParts(now()/1000).date;
    const start=new Date(to+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-(kind==='day'?730:14));
    const from=start.toISOString().slice(0,10);
    const url=new URL(`https://api.massive.com/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/${kind}/${from}/${to}`);
    url.search=new URLSearchParams({adjusted:'true',sort:'asc',limit:'50000'}).toString();
    const response=await fetcher(url.toString(),{headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(20000)});
    if(!response.ok){
      const messages:Record<number,string>={401:'The market-data connection could not authenticate.',403:'The Massive plan does not include this chart history or interval. Try Daily, or check the data subscription.',429:'The chart data request limit was reached. Please try again in a minute.'};
      throw new StockChartError(messages[response.status]||'Chart data is temporarily unavailable. Please try again.',response.status===429?429:502);
    }
    const body=await response.json() as Record<string,unknown>;
    if(!['OK','DELAYED'].includes(String(body.status)))throw new StockChartError('The provider could not return chart data for this ticker.');
    if(body.next_url)throw new StockChartError('The chart history was incomplete. Please try again.');
    return {source:'Massive',adjusted:true,ticker,kind,from,to,bars:normalizeChartBars(body.results),delayed:body.status==='DELAYED',fetchedAt:new Date(now()).toISOString()};
  }
  return {get(symbol:string,kind:'minute'|'day',apiKey?:string):Promise<ChartData>{
    const ticker=normalizeTicker(symbol);
    if(!validTicker(ticker))return Promise.reject(new StockChartError('Enter a valid stock ticker.',400));
    if(kind!=='minute'&&kind!=='day')return Promise.reject(new StockChartError('Invalid chart interval.',400));
    if(!apiKey)return Promise.reject(new StockChartError('The chart data connection is not configured. Configure MASSIVE_API_KEY as a secret for AskEdgar V2.',503));
    const key=ticker+':'+kind,cached=cache.get(key),failure=failures.get(key);
    if(cached&&cached.expires>now())return Promise.resolve(cached.data);
    if(failure&&failure.expires>now())return Promise.reject(failure.error);
    const existing=pending.get(key);if(existing)return existing;
    const request=load(ticker,kind,apiKey).then(data=>{
      if(cache.size>=40)cache.delete(cache.keys().next().value!);
      cache.set(key,{data,expires:now()+(kind==='day'?300000:60000)});failures.delete(key);return data;
    }).catch(error=>{
      const safe=error instanceof StockChartError?error:new StockChartError('The chart data connection timed out or could not be reached. Please try again.');
      if(failures.size>=100)failures.delete(failures.keys().next().value!);
      failures.set(key,{error:safe,expires:now()+30000});throw safe;
    }).finally(()=>pending.delete(key));
    pending.set(key,request);return request;
  }};
}
