'use client';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {canonicalTag,NEWS_EVENT_TAGS,newsDate,sortNews,type NewsItem,type NewsKind} from '../lib/company-news';
import NewsSummary from './news-summary';
import {DetailsButton} from './details-dialog';
type NewsPage={rows:NewsItem[];nextPage:number;hasMore:boolean;message:string|null;error?:string};
export function NewsList({rows,onTag,onSummary,onTicker}:{rows:(NewsItem&{ticker?:string})[];onTag?:(tag:string)=>void;onSummary?:(item:NewsItem)=>void;onTicker?:(ticker:string)=>void}){
  return <ul className="news-list">{rows.map((item,index)=>{const timestamp=newsDate(item.date);return <li key={`${item.url||item.headline}-${item.date}-${index}`} className={onSummary?"news-has-details":undefined}>{onSummary&&<DetailsButton label={"Read summary: "+item.headline} onClick={()=>onSummary(item)}/>}<time dateTime={item.date||undefined}>{timestamp.date}{timestamp.time&&<span>{timestamp.time}</span>}</time><div className="news-content">{item.ticker&&<a className="news-ticker" href={"/?ticker="+encodeURIComponent(item.ticker)} onClick={event=>{if(onTicker&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onTicker(item.ticker!);}}}>{item.ticker} <span aria-hidden="true">↗</span></a>}<span className={'news-form'+(item.formType==='News'?' news-form-article':'')}>{item.formType}</span>{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer" title={item.headlineSource==='summary'?'Headline from the AskEdgar filing summary':undefined}>{item.headline}<span className="news-link-arrow" aria-hidden="true"> ↗</span></a>:<span className="news-headline">{item.headline}</span>}{item.headlineSource==='form'&&<span className="news-no-headline">No headline provided</span>}{item.tags.length>0&&<div className="news-tags" aria-label="Tags">{item.tags.map(tag=>canonicalTag(tag)&&onTag?<button type="button" key={tag} onClick={()=>onTag(canonicalTag(tag)!)} title={'Filter by '+tag} aria-label={'Filter by '+tag}>{tag}</button>:<span key={tag}>{tag}</span>)}</div>}</div></li>;})}</ul>;
}
function NewsFeed({ticker,kind,tag,onTag}:{ticker:string;kind:NewsKind;tag:string;onTag:(tag:string)=>void}){
  const [rows,setRows]=useState<NewsItem[]>([]),[nextPage,setNextPage]=useState(1),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [selected,setSelected]=useState<NewsItem|null>(null);
  const active=useRef<AbortController|null>(null);
  const load=useCallback(async(page:number)=>{
    active.current?.abort();const controller=new AbortController();active.current=controller;setLoading(true);setError('');
    try{
      const query=new URLSearchParams({ticker,kind,tag,page:String(page)});
      const response=await fetch(`/api/news?${query}`,{signal:controller.signal});
      const body=await response.json() as NewsPage;if(!response.ok)throw new Error(body.error||'Unable to load news and filings.');if(controller.signal.aborted)return;
      setRows(previous=>sortNews(page===1?body.rows:[...previous,...body.rows]));setNextPage(body.nextPage);setHasMore(body.hasMore);setMessage(body.message||'');
      return body.rows;
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to load news and filings.');}finally{if(!controller.signal.aborted)setLoading(false);}
  },[ticker,kind,tag]);
  useEffect(()=>{setRows([]);setNextPage(1);setHasMore(false);setMessage('');void load(1);return()=>active.current?.abort();},[load]);
  const selectedIndex=selected?rows.indexOf(selected):-1;
  async function nextSummary(){
    if(loading||!selected)return;
    if(selectedIndex<rows.length-1){setSelected(rows[selectedIndex+1]);return;}
    if(!hasMore)return;
    const requested=selected,older=await load(nextPage);
    if(older?.length){const merged=sortNews([...rows,...older]);const following=merged[merged.indexOf(requested)+1]||older[0];setSelected(current=>current===requested?following:current);}
  }
  return <div aria-live="polite" aria-busy={loading}>
    {message&&<p className="table-message">{message}</p>}
    {error&&<div className="table-message table-error" role="alert">{error} <button type="button" disabled={loading} onClick={()=>void load(nextPage)}>Retry</button></div>}
    {loading&&!rows.length?<div className="table-loading" role="status"><span className="spinner"/>Loading news and filings…</div>:rows.length>0?<NewsList rows={rows} onTag={onTag} onSummary={setSelected}/>:!error&&<div className="empty-row">{hasMore?'No matching items on these pages. Check older items below.':`No matching ${kind==='all'?'news or filings':kind} returned for ${ticker}${tag?' with the tag “'+tag+'”':''}.`}</div>}
    {hasMore&&<div className="news-footer"><button type="button" className="load-more" disabled={loading} onClick={()=>void load(nextPage)}>{loading?'Loading…':'Load more'}</button></div>}
    {selected&&selectedIndex>=0&&<NewsSummary item={selected} index={selectedIndex} total={rows.length} hasMore={hasMore} loading={loading} error={error} onClose={()=>setSelected(null)} onPrevious={()=>{if(selectedIndex>0)setSelected(rows[selectedIndex-1]);}} onNext={()=>void nextSummary()}/>}
  </div>;
}
export default function CompanyNews({ticker}:{ticker:string}){
  const [kind,setKind]=useState<NewsKind>('all'),[tag,setTag]=useState(''),id=useId();
  return <section id="news-filings" tabIndex={-1} className="panel news-panel section-target" aria-labelledby={id}>
    <div className="section-head"><h2 id={id}>Recent news &amp; filings</h2><span className="news-timezone">Times shown in ET</span></div>
    <div className="news-filters"><div className="news-kind" role="group" aria-label="Record type">{([['all','All'],['filings','Filings'],['news','News']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={kind===value} onClick={()=>setKind(value)}>{label}</button>)}</div><label htmlFor={id+'-tag'}>Event tag</label><select id={id+'-tag'} value={tag} onChange={e=>setTag(e.target.value)}><option value="">All tags</option>{NEWS_EVENT_TAGS.map(value=><option key={value} value={value}>{value}</option>)}</select>{(tag||kind!=='all')&&<button type="button" className="news-clear" onClick={()=>{setTag('');setKind('all')}}>Clear</button>}</div>
    <NewsFeed key={`${ticker}:${kind}:${tag}`} ticker={ticker} kind={kind} tag={tag} onTag={setTag}/>
  </section>;
}
