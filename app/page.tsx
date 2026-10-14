'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Watchlist from './watchlist';
import {normalizeTicker,validTicker} from '../lib/watchlist';
import InstrumentCards from './instrument-cards';
import CompanyTables from './company-tables';
import CompanyOverview, {RiskRatings,ManagementCommentary} from './company-overview';
import CompanyNews from './company-news';
import SectionNavigation from './section-navigation';
import {visibleInstruments} from '../lib/dilution-visibility';
type Row=Record<string,unknown>;
type Result={ticker:string;overview:Row|null;rating:Row|null;rows:Row[];complete:boolean;stockPrice:number|null;stockPriceMessage:string|null;warnings:string[];fetchedAt:string|null;ratingsFetchedAt:string|null;dilutionFetchedAt:string|null};
export default function Home(){
  const [showOutOfPlay,setShowOutOfPlay]=useState(false);
  const [ticker,setTicker]=useState('');const [data,setData]=useState<Result|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
  const [view,setView]=useState<'research'|'watchlist'>('research'),[visitedWatchlist,setVisitedWatchlist]=useState(false);
  const active=useRef<AbortController|null>(null),loadedTicker=useRef('');
  const analyze=useCallback(async(symbol:string)=>{active.current?.abort();const controller=new AbortController();active.current=controller;setTicker(symbol);loadedTicker.current="";setLoading(true);setError('');setData(null);setShowOutOfPlay(false);try{const r=await fetch('/api/dilution?ticker='+encodeURIComponent(symbol),{signal:controller.signal});const body=await r.json() as Result & {error?:string};if(!r.ok)throw new Error(body.error||'Unable to load data.');if(!controller.signal.aborted){loadedTicker.current=symbol;setData(body);}}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}},[]);
  useEffect(()=>{function readLocation(){const query=new URLSearchParams(window.location.search);if(query.get('view')==='watchlist'){setView('watchlist');setVisitedWatchlist(true);}else{setView('research');const symbol=normalizeTicker(query.get('ticker')||'');if(validTicker(symbol)&&symbol!==loadedTicker.current)void analyze(symbol);}}readLocation();window.addEventListener('popstate',readLocation);return()=>{window.removeEventListener('popstate',readLocation);active.current?.abort();};},[analyze]);
  function openTicker(symbol:string){const normalized=normalizeTicker(symbol);history.pushState({},'', '/?ticker='+encodeURIComponent(normalized));setView('research');void analyze(normalized);window.scrollTo({top:0,behavior:'instant'});}
  function navigate(next:'research'|'watchlist'){if(view===next)return;history.pushState({},'',next!=='research'?'/?view='+next:loadedTicker.current?'/?ticker='+encodeURIComponent(loadedTicker.current):'/');setView(next);if(next==='watchlist')setVisitedWatchlist(true);window.scrollTo({top:0,behavior:'instant'});}
  async function search(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(loading)return;if(window.matchMedia('(pointer: coarse)').matches)e.currentTarget.querySelector('input')?.blur();openTicker(ticker);}
  const visibleRows=visibleInstruments(data?.rows||[],showOutOfPlay);
  const warrants=visibleRows.filter(r=>'warrants_amount' in r||'warrants_remaining' in r||'warrants_exercise_price' in r)||[];
  const convertibles=visibleRows.filter(r=>'conversion_price' in r||'convertible_debt_remaining' in r||'underlying_shares_remaining' in r)||[];
  const additional=visibleRows.filter(r=>!warrants.includes(r)&&!convertibles.includes(r))||[];
  return <div className="app" id="top" tabIndex={-1}><header><a className="brand" href="/" aria-label="AskEdgar dilution research home"><img src="/askedgar-logo.svg" width="180" height="38" alt="AskEdgar"/></a><span className="source">V2 · Dilution research</span></header><main><nav className="primary-navigation" aria-label="Main navigation"><a href={loadedTicker.current?'/?ticker='+encodeURIComponent(loadedTicker.current):'/'} aria-current={view==='research'?'page':undefined} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate('research');}}}>Company research</a><a href="/?view=watchlist" aria-current={view==='watchlist'?'page':undefined} onClick={event=>{if(!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate('watchlist');}}}>Watchlist <span aria-hidden="true">☆</span></a></nav>
    {visitedWatchlist&&<div hidden={view!=='watchlist'}><Watchlist onTicker={openTicker}/></div>}
    <div hidden={view!=='research'}>
    <div className="intro has-results"><form onSubmit={search} className="search-card" role="search"><label htmlFor="ticker">Search ticker</label><div className="search"><span className="search-icon" aria-hidden="true">⌕</span><input id="ticker" placeholder="Enter ticker · e.g. DVLT" value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} maxLength={20} required autoComplete="off" spellCheck={false}/><button disabled={loading||!ticker.trim()}>{loading?'Loading…':'Search'}</button></div></form></div>
    {error&&<div role="alert" className="notice error">{error}</div>}{loading&&<section className="loading" role="status"><span className="spinner"/>Reading the capital structure for {ticker}…</section>}
    {data&&<div aria-live="polite">
      <SectionNavigation/>
      <CompanyOverview ticker={data.ticker} overview={data.overview} stockPrice={data.stockPrice} fetchedAt={data.fetchedAt} dilutionRows={visibleRows}/>
      <CompanyNews key={data.ticker+'-news'} ticker={data.ticker}/>
      <RiskRatings rating={data.rating}/>
      {data.ratingsFetchedAt&&<p className="footnote">Ratings retrieved {new Date(data.ratingsFetchedAt).toLocaleString()} · Cached for up to 1 hour.</p>}
      <ManagementCommentary commentary={data.overview?.mgmt_commentary}/>
      {data.warnings.map((w,i)=><div className="notice" key={i}>{w}</div>)}
      <div className="dilution-controls section-target" id="dilution" tabIndex={-1}><div><h2>Dilution</h2><p>{showOutOfPlay?'Showing all instruments':'Showing in-play instruments'} · {visibleRows.length}{data.complete?'':' loaded'}</p></div><button type="button" aria-pressed={showOutOfPlay} onClick={()=>setShowOutOfPlay(value=>!value)}>{showOutOfPlay?'Hide out-of-play':'Show out-of-play'}</button></div>
      {data.dilutionFetchedAt&&<p className="footnote">Dilution data retrieved {new Date(data.dilutionFetchedAt).toLocaleString()} · Cached for up to 1 hour.</p>}
      <div className="price-comparison"><div><strong>Instrument prices</strong><span>Compared with the screener price above</span></div>{data.stockPriceMessage?<p>{data.stockPriceMessage}</p>:<><div className="price-legend"><span><i className="green-dot"/>≤ 1× stock price</span><span><i className="yellow-dot"/>&gt; 1× to &lt; 4×</span><span><i className="red-dot"/>≥ 4×</span></div><p>Variable Rate: yellow above the stock price, green at or below. No color when nothing remains.</p></>}</div>
      <InstrumentCards title="Warrants" subtitle="Expand an instrument for ownership, price protection, dates, and filing details." rows={warrants} kind="warrant" stockPrice={data.stockPrice}/>
      <InstrumentCards title="Convertibles" subtitle="Expand an instrument for ownership, conversion terms, dates, and filing details." rows={convertibles} kind="convertible" stockPrice={data.stockPrice}/>
      {additional.length>0&&<section className="panel"><div className="section-head"><h2>Additional instruments</h2></div><pre>{JSON.stringify(additional,null,2)}</pre></section>}
      <CompanyTables key={data.ticker} ticker={data.ticker}/><p className="footnote">Potential issuance is not the same as shares already issued. “—” means the provider did not supply a value. Ownership, offerings, corporate actions, and historical splits are cached for up to 12 hours; dilution data for 1 hour; prices and news for 5 minutes.</p>
    </div>}

  </div></main><footer className="site-footer"><a href="https://askedgar.io" target="_blank" rel="noopener noreferrer">askedgar.io</a><a href="https://www.askedgar.io/legal/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a></footer></div>;
}
