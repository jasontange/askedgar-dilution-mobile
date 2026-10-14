'use client';
import {useEffect,useLayoutEffect,useId,useRef,useState} from 'react';
import {Cell,displayValue,offeringColumns,type Column} from './company-tables';
import {SummaryStar,SummaryText} from './news-summary';
import {InstrumentCard} from './chart-instrument-card';
import {newsDate,type NewsItem} from '../lib/company-news';
import {EVENT_COLORS,type DilutionInstrument,type DilutionLevel,type PositionedEvent} from '../lib/stock-chart-overlays';
import {loadChartSummary} from '../lib/chart-event-summary';
export type ChartDetail={type:'event';item:PositionedEvent}|{type:'dilution';level:DilutionLevel;instrument:DilutionInstrument};
export function eventDetails(items:PositionedEvent[]):ChartDetail[]{return items.slice().sort((a,b)=>b.event.date.localeCompare(a.event.date)).map(item=>({type:'event',item}));}
export function levelDetails(levels:DilutionLevel[]):ChartDetail[]{return levels.flatMap(level=>level.instruments.map(instrument=>({type:'dilution' as const,level,instrument})));}
function Facts({row,columns}:{row:Record<string,unknown>;columns:Column[]}){
  return <dl className="deal-facts">{columns.filter(c=>!['headline','filed_at','selling_shareholder_details'].includes(c.key)&&c.format!=='link').map(c=>{const value=row[c.key]??(c.fallback?row[c.fallback]:undefined);return value===null||value===undefined||value===''?null:<div key={c.key}><dt>{c.label}</dt><dd><Cell v={value} format={c.format} row={row}/></dd></div>;})}</dl>;
}
export default function ChartDetails({ticker,entries,onClose,emptyMessage,stockPrice}:{ticker:string;stockPrice:number|null;entries:ChartDetail[];onClose:()=>void;emptyMessage?:string}){
  const [index,setIndex]=useState(0),[summary,setSummary]=useState<{id:string;item:NewsItem|null}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const dialog=useRef<HTMLDialogElement>(null),content=useRef<HTMLDivElement>(null),id=useId();
  const entry=entries[index],event=entry?.type==='event'?entry.item.event:null;
  useLayoutEffect(()=>{
    const element=dialog.current;if(!element)return;
    const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;element.showModal();
    return()=>{element.close();if(focused?.isConnected)focused.focus();};
  },[]);
  useEffect(()=>{
    content.current?.scrollTo({top:0});setSummary(null);setError('');setLoading(false);
    if(!event||event.kind!=='news')return;
    const controller=new AbortController();setLoading(true);
    void loadChartSummary(ticker,event,controller.signal).then(item=>{if(!controller.signal.aborted)setSummary({id:event.id,item});}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'The summary could not be loaded.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[event,ticker,revision,index]);
  const currentSummary=summary?.id===event?.id?summary?.item:null;
  const filedAt=event?.date||(entry?.type==='dilution'&&typeof entry.instrument.row.filed_at==='string'?entry.instrument.row.filed_at:null);
  const stamp=newsDate(filedAt);
  const title=event?.headline||(entry?.type==='dilution'?displayValue(entry.instrument.row.details):'Chart events');
  const color=entry?.type==='dilution'?entry.level.color:event?.kind==='offerings'?'#5361bb':event?EVENT_COLORS[event.tone]:'#5266da';
  const form=event?.kind==='offerings'?'Offering':event?.formType||'Dilution';
  const source=event?.url||(entry?.type==='dilution'&&typeof entry.instrument.row.askedgar_url==='string'?entry.instrument.row.askedgar_url:null);
  let safeSource:string|null=null;try{const u=new URL(source||'');if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)safeSource=u.href;}catch{}
  return <dialog ref={dialog} className="news-summary-dialog chart-details-dialog" aria-labelledby={id} onCancel={e=>{e.preventDefault();e.stopPropagation();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}>
    <div className="summary-shell">
      <div className="summary-toolbar"><span><SummaryStar/> Details <strong className="summary-ticker">{ticker}</strong></span><button type="button" className="summary-close" aria-label="Close chart details" onClick={onClose} autoFocus>×</button></div>
      <div ref={content} className="summary-scroll" tabIndex={0} aria-label="Chart record details">
        {entry&&<div className="summary-meta"><span className="news-form" style={{color}}>{form}</span><time dateTime={event?.date}>{stamp.date}{stamp.time&&' · '+stamp.time}</time></div>}
        <h2 id={id} className={entry?.type==='dilution'?'sr-only':undefined}>{title}</h2>
        {!entry&&<p className="summary-unavailable">{emptyMessage||'No events loaded for this chart history.'}</p>}
        {event?.kind==='offerings'&&<><Facts row={event.record||{share_price:event.sharePrice,offering_amount:event.amount}} columns={offeringColumns}/>{event.record?.selling_shareholder_details!=null&&<div className="summary-prose"><SummaryText summary={displayValue(event.record.selling_shareholder_details)}/></div>}<p className="chart-detail-note">Source filing date. Reported offering terms may differ from split-adjusted chart prices.</p></>}
        {event?.kind==='news'&&<>
          {event.tags.length>0&&<div className="news-tags summary-tags">{event.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}
          <p className="chart-detail-note" style={{color}}>{event.toneReason}</p>
          <div className="summary-prose" aria-live="polite">{loading?<p>Loading summary…</p>:error?<p role="alert">{error} <button type="button" onClick={()=>setRevision(v=>v+1)}>Retry</button></p>:currentSummary?<SummaryText summary={currentSummary.summary}/>:<p className="summary-unavailable">Summary unavailable here. Open the source for the full record.</p>}</div>
        </>}
        {entry?.type==='dilution'&&<div className="chart-dilution-card"><InstrumentCard key={index} row={entry.instrument.row} kind={entry.instrument.kind==='Exercise'?'warrant':'convertible'} stockPrice={stockPrice} expanded/></div>}
        {entry?.type==='event'&&<p className="chart-detail-note">{entry.item.note}</p>}
        {safeSource&&entry?.type!=='dilution'&&<a className="summary-source" href={safeSource} target="_blank" rel="noopener noreferrer">View {event?.formType==='News'?'article':'filing'} ↗</a>}
      </div>
      {entries.length>1&&<nav className="summary-navigation" aria-label="Browse chart details"><button type="button" disabled={index===0} onClick={()=>setIndex(i=>i-1)}>← Previous</button><span aria-live="polite">{index+1} of {entries.length}</span><button type="button" disabled={index===entries.length-1} onClick={()=>setIndex(i=>i+1)}>Next →</button></nav>}
    </div>
  </dialog>;
}
