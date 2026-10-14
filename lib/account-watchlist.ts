import {normalizeTicker,validTicker,WATCHLIST_LIMIT} from './watchlist';
export class WatchlistError extends Error {constructor(message:string,public status:number,public code:string){super(message);}}
export type AccountList={tickers:string[];revision:number;updatedAt:string|null};
export type Mutation={action:'add'|'remove'|'import';revision:number;accountId:string;ticker?:string;tickers?:string[]};
export function parseMutation(value:unknown):Mutation{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new WatchlistError('Invalid request.',400,'invalid');
  const body=value as Record<string,unknown>,keys=Object.keys(body);
  if(typeof body.action!=='string'||!['add','remove','import'].includes(body.action)||!Number.isSafeInteger(body.revision)||Number(body.revision)<0||typeof body.accountId!=='string'||!body.accountId||body.accountId.length>512)throw new WatchlistError('Invalid request.',400,'invalid');
  const allowed=body.action==='import'?['action','revision','accountId','tickers']:['action','revision','accountId','ticker'];
  if(keys.some(key=>!allowed.includes(key)))throw new WatchlistError('Unexpected request field.',400,'invalid');
  if(body.action==='import'){
    if(!Array.isArray(body.tickers)||body.tickers.length>WATCHLIST_LIMIT||body.tickers.some(t=>typeof t!=='string'||!validTicker(normalizeTicker(t))))throw new WatchlistError('Import up to '+WATCHLIST_LIMIT+' valid ticker symbols.',400,'invalid');
    return {action:'import',revision:Number(body.revision),accountId:body.accountId,tickers:[...new Set(body.tickers.map(t=>normalizeTicker(t as string)))]};
  }
  if(typeof body.ticker!=='string'||!validTicker(normalizeTicker(body.ticker)))throw new WatchlistError('Enter a valid ticker symbol.',400,'invalid');
  return {action:body.action as 'add'|'remove',revision:Number(body.revision),accountId:body.accountId,ticker:normalizeTicker(body.ticker)};
}
export function mergedTickers(existing:string[],mutation:Mutation):string[]{
  const next=mutation.action==='remove'?existing.filter(t=>t!==mutation.ticker):[...new Set([...existing,...(mutation.action==='import'?mutation.tickers||[]:[mutation.ticker!])])];
  if(next.length>WATCHLIST_LIMIT)throw new WatchlistError('Your account can hold up to '+WATCHLIST_LIMIT+' tickers. Remove some account tickers before importing or adding. Nothing was changed.',409,'limit');
  return next;
}
type Stored={tickers:string;revision:number;updated_at:string};
function decode(row:Stored|null):AccountList{if(!row)return {tickers:[],revision:0,updatedAt:null};const tickers:unknown=JSON.parse(row.tickers);if(!Array.isArray(tickers)||tickers.length>WATCHLIST_LIMIT||tickers.some(t=>typeof t!=='string'||!validTicker(t)))throw new Error('Invalid stored watchlist');return {tickers,revision:row.revision,updatedAt:row.updated_at||null};}
export async function readWatchlist(db:D1Database,userId:string):Promise<AccountList>{return decode(await db.prepare('SELECT tickers, revision, updated_at FROM watchlists WHERE user_id = ?').bind(userId).first<Stored>());}
export async function changeWatchlist(db:D1Database,userId:string,mutation:Mutation):Promise<AccountList>{
  // accountId is only a stale-session guard. Ownership always comes from verified identity.
  if(mutation.accountId!==userId)throw new WatchlistError('Your signed-in account changed. Reload the account watchlist before trying again.',409,'account_changed');
  const before=await readWatchlist(db,userId);
  if(before.revision!==mutation.revision)throw new WatchlistError('Your watchlist changed on another device. Reload it and try again.',409,'conflict');
  const tickers=mergedTickers(before.tickers,mutation),updatedAt=new Date().toISOString();
  // Atomic revision compare-and-swap prevents lost updates across devices.
  await db.prepare('INSERT OR IGNORE INTO watchlists (user_id, tickers, revision, updated_at) VALUES (?, ?, 0, ?)').bind(userId,'[]','').run();
  const result=await db.prepare('UPDATE watchlists SET tickers = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING tickers, revision, updated_at').bind(JSON.stringify(tickers),updatedAt,userId,mutation.revision).first<Stored>();
  if(!result)throw new WatchlistError('Your watchlist changed on another device. Reload it and try again.',409,'conflict');
  return decode(result);
}
