'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {NEWS_EVENT_TAGS,type NewsItem,type NewsKind} from '../lib/company-news';
import {mergeWatchNews,nextWatchBatch,parseTickerInput,parseWatchlist,WATCHLIST_BATCH_SIZE,WATCHLIST_ITEMS_PER_TICKER,WATCHLIST_KEY,WATCHLIST_LIMIT,type WatchNews} from '../lib/watchlist';
import {NewsList} from './company-news';
import NewsSummary from './news-summary';
import LabelPicker from './label-picker';
import {useSavedLabels} from './use-saved-labels';
type Feed={rows:WatchNews[];nextPage:number;hasMore:boolean;error:string;message:string};
const blank=():Feed=>({rows:[],nextPage:1,hasMore:true,error:'',message:''});
function WatchFeed({tickers,onTicker}:{tickers:string[];onTicker:(ticker:string)=>void}){
  const [kind,setKind]=useState<NewsKind>('all'),[feeds,setFeeds]=useState<Record<string,Feed>>({}),[loading,setLoading]=useState(false),[selected,setSelected]=useState<NewsItem|null>(null);
  const labels=useSavedLabels('askedgar-watchlist-labels-v1',NEWS_EVENT_TAGS,600),tag=labels.values.join(',');
  const active=useRef<AbortController|null>(null),current=useRef<Record<string,Feed>>({});
  const listKey=tickers.join(',');
  const load=useCallback(async(reset=false,failedOnly=false)=>{
    active.current?.abort();const controller=new AbortController();active.current=controller;setLoading(true);
    const base=reset?{}:current.current;const next:Record<string,Feed>={...base};
    const symbols=listKey?listKey.split(','):[];
    const pending=nextWatchBatch(symbols,base,failedOnly);
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(3,pending.length)},async()=>{
      while(cursor<pending.length&&!controller.signal.aborted){const ticker=pending[cursor++],previous=base[ticker]||blank();
        try{const query=new URLSearchParams({ticker,kind,tag,page:String(previous.nextPage),view:'watchlist'});const response=await fetch('/api/news?'+query,{signal:controller.signal});const body=await response.json() as {rows:NewsItem[];nextPage:number;hasMore:boolean;error?:string;message?:string};if(!response.ok)throw new Error(body.error||'Unable to load items.');if(controller.signal.aborted)return;
          next[ticker]={rows:mergeWatchNews([...previous.rows,...body.rows.map((row:NewsItem)=>({...row,ticker}))]),nextPage:body.nextPage,hasMore:body.hasMore,error:'',message:body.message||''};
        }catch(error){if(controller.signal.aborted)return;next[ticker]={...previous,error:error instanceof Error?error.message:'Unable to load items.'};}
      }
    }));
    if(controller.signal.aborted)return;
    current.current=next;setFeeds(next);setLoading(false);
  },[listKey,kind,tag]);
  useEffect(()=>{if(!labels.ready)return;current.current={};setFeeds({});setSelected(null);void load(true);return()=>active.current?.abort();},[load,labels.ready]);
  const rows=mergeWatchNews(tickers.flatMap(t=>feeds[t]?.rows||[])),errors=tickers.filter(t=>feeds[t]?.error),hasMore=nextWatchBatch(tickers,feeds).length>0;
  const checked=tickers.filter(t=>feeds[t]&&feeds[t].nextPage>1).length,unchecked=tickers.some(t=>!feeds[t]);
  const selectedIndex=selected?rows.indexOf(selected as WatchNews):-1;
  return <section className="panel news-panel watch-feed" aria-labelledby="watch-news-title">
    <div className="section-head"><div><h2 id="watch-news-title">Your news &amp; filings</h2><p>Across your watchlist · Newest loaded items first</p></div><span className="news-timezone">Times shown in ET</span></div>
    <div className="news-filters"><div className="news-kind" role="group" aria-label="Record type">{([['all','All'],['filings','Filings'],['news','News']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={kind===value} onClick={()=>setKind(value)}>{label}</button>)}</div><LabelPicker label="Event labels" options={NEWS_EVENT_TAGS} value={labels.values} onChange={labels.save} disabled={!labels.ready} maxLength={600}/>{(tag||kind!=='all')&&<button type="button" className="news-clear" onClick={()=>{labels.save([]);setKind('all');}}>Clear</button>}<button className="news-clear" type="button" disabled={loading} onClick={()=>{setSelected(null);void load(true);}}>Refresh</button></div>
    <p className="filter-memory-note">Up to {WATCHLIST_BATCH_SIZE*WATCHLIST_ITEMS_PER_TICKER} items from {WATCHLIST_BATCH_SIZE} tickers per load. Load more to check the rest. Labels are remembered in this browser.</p>{labels.error&&<p className="label-save-error" role="alert">{labels.error}</p>}
    <div aria-live="polite" aria-busy={loading}>
      {errors.length>0&&<div className="table-message table-error" role="alert"><strong>{rows.length?'Some tickers could not be updated.':'Could not load your feed.'}</strong>{errors.map(t=><p key={t}>{t}: {feeds[t].error}</p>)}<button type="button" disabled={loading} onClick={()=>void load(false,true)}>Retry failed tickers</button></div>}
      {tickers.filter(t=>feeds[t]?.message).map(t=><p key={t} className="table-message">{t}: {feeds[t].message}</p>)}
      {rows.length>0&&<NewsList rows={rows} onTag={tag=>labels.save([...labels.values,tag])} onSummary={setSelected} onTicker={onTicker}/>}
      {loading&&<div className="table-loading" role="status"><span className="spinner"/>Loading news and filings…</div>}
      {!loading&&!rows.length&&!errors.length&&<div className="empty-row">No matching news or filings in the pages checked.{hasMore?' Load more to continue.':''}</div>}
      <div className="news-footer"><span>{rows.length} items loaded · {checked}/{tickers.length} tickers checked</span>{hasMore&&<button type="button" className="load-more" disabled={loading} onClick={()=>void load()}>{loading?'Loading…':unchecked?'Load more':'Load older items'}</button>}</div>
    </div>
    {selected&&selectedIndex>=0&&<NewsSummary item={selected} ticker={rows[selectedIndex].ticker} index={selectedIndex} total={rows.length} hasMore={false} loading={false} error="" onClose={()=>setSelected(null)} onPrevious={()=>setSelected(rows[selectedIndex-1])} onNext={()=>setSelected(rows[selectedIndex+1])}/>}
  </section>;
}
type Account={accountId:string;displayName:string;tickers:string[];revision:number;updatedAt:string|null;signOutUrl:string};
type AccountMode='checking'|'local'|'account'|'error';
export default function Watchlist({onTicker}:{onTicker:(ticker:string)=>void}){
  const [localTickers,setLocalTickers]=useState<string[]>([]),[ready,setReady]=useState(false),[input,setInput]=useState(''),[notice,setNotice]=useState(''),[storageError,setStorageError]=useState('');
  const [mode,setMode]=useState<AccountMode>('checking'),[account,setAccount]=useState<Account|null>(null),[accountError,setAccountError]=useState(''),[saving,setSaving]=useState(false),[signInUrl,setSignInUrl]=useState(''),[signOutUrl,setSignOutUrl]=useState('');
  const request=useRef<AbortController|null>(null),generation=useRef(0),mutating=useRef(false),refreshPending=useRef(false);
  const loadAccount=useCallback(async()=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;const version=++generation.current;setMode('checking');setAccount(null);setAccountError('');setSaving(false);mutating.current=false;
    try{const response=await fetch('/api/watchlist',{signal:controller.signal,cache:'no-store'});const body=await response.json() as Account&{error?:string;signInUrl?:string};if(version!==generation.current||controller.signal.aborted)return;
      if(response.status===401){setSignInUrl(body.signInUrl||'');setMode('local');setSignOutUrl('');return;}
      if(body.signOutUrl)setSignOutUrl(body.signOutUrl);
      if(!response.ok)throw new Error(body.error||'Your account watchlist could not be loaded.');
      setAccount(body);setMode('account');
    }catch(error){if(!controller.signal.aborted&&version===generation.current){setMode('error');setAccountError(error instanceof Error?error.message:'Your account watchlist could not be loaded.');}}
  },[]);
  useEffect(()=>{try{setLocalTickers(parseWatchlist(JSON.parse(localStorage.getItem(WATCHLIST_KEY)||'[]')));}catch{setStorageError('Browser storage is unavailable. Your device watchlist will last only for this visit.');}setReady(true);void loadAccount();
    const sync=(event:StorageEvent)=>{if(event.key===WATCHLIST_KEY){try{setLocalTickers(parseWatchlist(JSON.parse(event.newValue||'[]')));}catch{}}};
    const refresh=()=>{if(document.visibilityState==='visible'){if(mutating.current){refreshPending.current=true;return;}void loadAccount();}};
    window.addEventListener('storage',sync);window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);
    return()=>{request.current?.abort();generation.current++;window.removeEventListener('storage',sync);window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);};
  },[loadAccount]);
  const tickers=mode==='account'?account?.tickers||[]:mode==='local'?localTickers:[];
  const missing=localTickers.filter(t=>!account?.tickers.includes(t));
  const available=mode==='local'||mode==='account';
  function saveLocal(next:string[]){setLocalTickers(next);try{localStorage.setItem(WATCHLIST_KEY,JSON.stringify(next));setStorageError('');}catch{setStorageError('Could not save on this browser. Your device changes will last only for this visit.');}}
  async function mutate(action:'add'|'remove'|'import',symbol?:string,additions?:string[]){
    if(!account||mode!=='account'||mutating.current)return false;
    mutating.current=true;setSaving(true);setNotice('');request.current?.abort();const controller=new AbortController();request.current=controller;const version=++generation.current;
    try{const payload={action,revision:account.revision,accountId:account.accountId,...(action==='import'?{tickers:additions||localTickers}:{ticker:symbol})};const response=await fetch('/api/watchlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});const body=await response.json() as Account&{error?:string;code?:string;signInUrl?:string};
      if(controller.signal.aborted||version!==generation.current)return false;
      if(response.status===401){setAccount(null);setMode('local');setSignInUrl(body.signInUrl||'');setSignOutUrl('');setNotice('Your session ended. Showing your separate device watchlist; your account change was not saved.');return false;}
      if(!response.ok){if(body.code==='conflict'||body.code==='account_changed'){setNotice(body.error||'Your account changed. Please try again.');await loadAccount();return false;}if(response.status>=500)throw new Error(body.error||'Could not confirm the save. Reload before trying again.');setNotice(body.error||'The change could not be saved.');return false;}
      if(body.accountId!==account.accountId)throw new Error('Your account changed. Reload before trying again.');
      setAccount(body);setNotice(action==='import'?(additions?additions.length+' tickers added to your account watchlist.':'Device tickers merged into your account. Your device list is unchanged.'):symbol+(action==='add'?' added to':' removed from')+' your account watchlist.');return true;
    }catch(error){if(!controller.signal.aborted&&version===generation.current){setAccount(null);setMode('error');setAccountError(error instanceof Error?error.message:'Could not confirm the save. Reload before trying again.');}return false;}
    finally{if(version===generation.current){setSaving(false);mutating.current=false;if(refreshPending.current){refreshPending.current=false;void loadAccount();}}}
  }
  async function add(event:React.FormEvent){event.preventDefault();if(!available||saving)return;
    let symbols:string[];try{symbols=parseTickerInput(input);}catch(error){setNotice((error as Error).message);return;}
    const additions=symbols.filter(ticker=>!tickers.includes(ticker));
    if(!additions.length){setNotice('These tickers are already on your watchlist.');return;}
    if(tickers.length+additions.length>WATCHLIST_LIMIT){setNotice('Your watchlist can hold up to '+WATCHLIST_LIMIT+' tickers. There is room for '+(WATCHLIST_LIMIT-tickers.length)+' more; you entered '+additions.length+' new tickers. Nothing was added.');return;}
    if(mode==='account'){if(await (additions.length===1?mutate('add',additions[0]):mutate('import',undefined,additions)))setInput('');}else{saveLocal([...tickers,...additions]);setInput('');setNotice((additions.length===1?additions[0]:additions.length+' tickers')+' added to your device watchlist.');}
  }
  async function remove(ticker:string){if(saving||!available)return;if(mode==='account')await mutate('remove',ticker);else{saveLocal(tickers.filter(t=>t!==ticker));setNotice(ticker+' removed from your device watchlist.');}}
  return <div className="watchlist-page"><div className="watchlist-heading"><div className="eyebrow">YOUR MARKET, IN FOCUS</div><h1>Watchlist<span>.</span></h1><p>The latest news and filings for the companies you follow.</p></div>
    <section className="watchlist-account" aria-label="Watchlist account">
      {mode==='checking'?<p role="status">Checking your account…</p>:mode==='account'&&account?<><div><strong>Account watchlist</strong><p>Signed in as {account.displayName}. Saved across your devices.</p></div><div className="watchlist-account-actions"><button type="button" disabled={saving} onClick={()=>void loadAccount()}>Sync now</button><a href={account.signOutUrl} target="_top" onClick={event=>{if(saving)event.preventDefault();}}>Sign out</a></div></>:mode==='local'?<><div><strong>Device watchlist</strong><p>Saved only in this browser.{signInUrl&&' Sign in to save a separate account watchlist across devices.'}</p></div>{signInUrl&&<a className="watchlist-signin" href={signInUrl} target="_top">Sign in with ChatGPT →</a>}</>:<><div role="alert"><strong>Account connection unavailable</strong><p>{accountError}</p><p>Your device list is still stored separately in this browser.</p></div><div className="watchlist-account-actions"><button type="button" onClick={()=>void loadAccount()}>Reload account</button>{signOutUrl&&<a href={signOutUrl} target="_top">Sign out</a>}</div></>}
    </section>
    {mode==='account'&&localTickers.length>0&&<div className="watchlist-import"><div><strong>{missing.length?missing.length+' device '+(missing.length===1?'ticker is':'tickers are')+' not in your account.':'Your device tickers are already in your account.'}</strong><p>{localTickers.join(', ')} · Import merges lists and leaves your device list unchanged.</p>{missing.length+tickers.length>WATCHLIST_LIMIT&&<p>There is room for {WATCHLIST_LIMIT-tickers.length} more. Remove account tickers before importing all {missing.length}.</p>}</div>{missing.length>0&&<button type="button" disabled={saving||missing.length+tickers.length>WATCHLIST_LIMIT} onClick={()=>void mutate('import')}>Import device list</button>}</div>}
    {available&&<section className="watchlist-manager" aria-label="Manage watchlist"><form onSubmit={add}><label htmlFor="watch-ticker">ADD TICKERS</label><div className="search"><input id="watch-ticker" placeholder="e.g. DVLT, AAPL, MSFT" value={input} onChange={e=>setInput(e.target.value)} disabled={saving} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={4000} aria-describedby="watch-ticker-help"/><button disabled={!ready||saving||!input.trim()}>{saving?'Saving…':'Add +'}</button></div><p id="watch-ticker-help" className="watchlist-storage">Separate multiple tickers with commas. Duplicates are skipped.</p></form><div className="watchlist-storage">{mode==='account'?'Saved to your account':'Saved in this browser'} · {tickers.length}/{WATCHLIST_LIMIT} tickers</div>{notice&&<p className="watchlist-notice" role="status">{notice}</p>}{storageError&&<p className="watchlist-notice" role="alert">{storageError}</p>}{tickers.length>0&&<ul className="watchlist-tickers">{tickers.map(ticker=><li key={ticker}><a href={'/?ticker='+encodeURIComponent(ticker)} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onTicker(ticker);}}}>{ticker} <span aria-hidden="true">↗</span></a><button type="button" disabled={saving} aria-label={'Remove '+ticker+' from watchlist'} onClick={()=>void remove(ticker)}>×</button></li>)}</ul>}</section>}
    {available&&(tickers.length?<WatchFeed key={mode==='account'?account!.accountId:'device'} tickers={tickers} onTicker={onTicker}/>:<section className="welcome watchlist-empty"><div className="welcome-mark">☆</div><h2>Keep your companies close.</h2><p>Add your first ticker above to build a combined feed.<br/>Open any ticker to explore its company research.</p></section>)}
  </div>;
}
