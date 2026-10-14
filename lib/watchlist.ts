import type {NewsItem} from './company-news';
export const WATCHLIST_KEY='askedgar-watchlist-v1';
export const WATCHLIST_LIMIT=50;
export const WATCHLIST_BATCH_SIZE=4;
export const WATCHLIST_ITEMS_PER_TICKER=5;
export const normalizeTicker=(value:string)=>value.trim().replace(/^\$/,'').toUpperCase();
export const validTicker=(value:string)=>/^[A-Z][A-Z0-9.\-]{0,19}$/.test(value);
export function parseTickerInput(value:string):string[]{
  const symbols=[...new Set(value.split(/[,\r\n]+/).map(normalizeTicker).filter(Boolean))];
  if(!symbols.length)throw new Error('Enter a ticker or a comma-separated list, such as DVLT, AAPL, MSFT.');
  const invalid=symbols.filter(ticker=>!validTicker(ticker));
  if(invalid.length)throw new Error('Check these ticker symbols: '+invalid.slice(0,3).join(', ')+'. Separate tickers with commas. Nothing was added.');
  if(symbols.length>WATCHLIST_LIMIT)throw new Error('Add up to '+WATCHLIST_LIMIT+' unique tickers at a time. Nothing was added.');
  return symbols;
}
type FeedProgress={nextPage:number;hasMore:boolean;error:string};
// Check unseen tickers before fetching older pages, then advance all tickers fairly.
export function nextWatchBatch(tickers:string[],feeds:Record<string,FeedProgress>,failedOnly=false):string[]{
  const candidates=tickers.filter(ticker=>failedOnly?!!feeds[ticker]?.error:!feeds[ticker]||(!feeds[ticker].error&&feeds[ticker].hasMore));
  const unseen=candidates.filter(ticker=>!feeds[ticker]);
  return (unseen.length?unseen:candidates)
    .sort((a,b)=>(feeds[a]?.nextPage||0)-(feeds[b]?.nextPage||0)).slice(0,WATCHLIST_BATCH_SIZE);
}
export function parseWatchlist(value:unknown):string[]{return Array.isArray(value)?[...new Set(value.filter((x):x is string=>typeof x==='string').map(normalizeTicker).filter(validTicker))].slice(0,WATCHLIST_LIMIT):[];}
export type WatchNews=NewsItem&{ticker:string};
export function mergeWatchNews(rows:WatchNews[]):WatchNews[]{const seen=new Set<string>();return rows.filter(row=>{const key=[row.ticker,row.url||row.headline,row.date,row.formType].join('|');if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>(Date.parse(b.date||'')||0)-(Date.parse(a.date||'')||0)||a.ticker.localeCompare(b.ticker));}
