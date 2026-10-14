import {env} from 'cloudflare:workers';
import {cachedValue} from './response-cache';
const MINUTE=60000,HOUR=60*MINUTE;
export const ENDPOINT_CACHE_MS={
  screener:5*MINUTE,
  news:5*MINUTE,
  'dilution-rating':HOUR,
  'dilution-data':HOUR,
  'dilution-data-advanced':HOUR,
  offerings:12*HOUR,
  'offerings-advanced':12*HOUR,
  ownership:12*HOUR,
  'split-status':12*HOUR,
  'reverse-splits':12*HOUR,
} as const;
type Endpoint=keyof typeof ENDPOINT_CACHE_MS;
export type AskedgarPage={results:Record<string,unknown>[];has_more:boolean|null;message?:string;fetchedAt:string};
class AskedgarError extends Error {}
export function askedgarCacheKey(endpoint:Endpoint,params:URLSearchParams){
  const canonical=new URLSearchParams(params);canonical.sort();
  return `askedgar:v1:${endpoint}?${canonical}`;
}
export async function askedgarPage(endpoint:Endpoint,params:URLSearchParams,requirePagination=false):Promise<AskedgarPage>{
  const key=(env as unknown as Record<string,string>).ASKEDGAR_API_KEY;
  if(!key)throw new Error('The data connection is not configured.');
  if(!env.DB)throw new Error('The shared data cache is temporarily unavailable. Please try again.');
  try{
  const cached=await cachedValue(env.DB,askedgarCacheKey(endpoint,params),ENDPOINT_CACHE_MS[endpoint],async()=>{
    const response=await fetch(`https://eapi.askedgar.io/v1/${endpoint}?${params}`,{headers:{'API-KEY':key},signal:AbortSignal.timeout(25000)});
    if(!response.ok){
      const messages:Record<number,string>={401:'AskEdgar rejected the API key.',402:'Your AskEdgar account needs more credits.',403:'Your API key does not have access to this data.',429:'AskEdgar’s request or company limit has been reached. Please try again later.'};
      throw new AskedgarError(messages[response.status]||'AskEdgar is temporarily unavailable. Please try again.');
    }
    const body=await response.json() as {status?:string;results?:Record<string,unknown>[];has_more?:boolean;message?:string};
    if(body.status==='error'||!Array.isArray(body.results)||(requirePagination&&typeof body.has_more!=='boolean'))throw new AskedgarError('AskEdgar could not return this data.');
    // Persist just reusable market data, excluding usage/account metadata.
    return {results:body.results,has_more:typeof body.has_more==='boolean'?body.has_more:null,...(typeof body.message==='string'?{message:body.message}:{})};
  });
  return {...cached.value,fetchedAt:new Date(cached.fetchedAt).toISOString()};
  }catch(error){if(error instanceof AskedgarError)throw error;throw new Error('This data could not be loaded. Please try again shortly.');}
}
