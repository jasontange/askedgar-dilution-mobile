'use client';
import React, {useCallback,useEffect,useId,useRef,useState} from 'react';
import {splitStatus,splitRatio} from '../lib/corporate-actions';
import {newsDate} from '../lib/company-news';
import DetailsDialog,{DetailsButton} from './details-dialog';
import {SummaryText} from './news-summary';
import {nextDetail} from '../lib/detail-navigation';
type Row=Record<string,unknown>;
type Kind='offerings'|'ownership'|'actions'|'splits';
export type Column={key:string;label:string;format?:'amount'|'money'|'price'|'date'|'link'|'details'|'split-status'|'split-ratio'|'ticker'|'datetime';fallback?:string};
type Page={rows:Row[];hasMore:boolean;page:number;message:string|null;fetchedAt:string;error?:string};
export function displayValue(v:unknown):string {
  if(v===null||v===undefined||v==='')return '—';
  if(Array.isArray(v))return v.map(displayValue).join(', ');
  if(typeof v==='object')return Object.entries(v as Row).map(([k,x])=>`${k.replaceAll('_',' ')}: ${displayValue(x)}`).join('; ');
  return String(v);
}
function numeric(v:unknown){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function numberText(v:unknown,money=false,compact=true){const n=numeric(v);if(n===null)return displayValue(v);return new Intl.NumberFormat('en-US',{notation:compact&&Math.abs(n)>=1000?'compact':'standard',maximumFractionDigits:compact?2:8,...(money?{style:'currency',currency:'USD',minimumFractionDigits:compact?0:2}:{})}).format(n);}
export function dateText(v:unknown){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(v))return displayValue(v);const d=new Date(v.slice(0,10)+'T12:00:00Z');return Number.isNaN(d.getTime())?displayValue(v):d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});}
function filingUrl(v:unknown){if(typeof v!=='string')return null;try{const u=new URL(v);return u.protocol==='https:'&&['app.askedgar.io','www.sec.gov','sec.gov'].includes(u.hostname)?u.href:null;}catch{return null;}}
export const offeringColumns:Column[]=[
  {key:'headline',label:'Title',fallback:'offering_type'},
  {key:'offering_amount',label:'Offering amount',format:'money'},
  {key:'shares_amount',label:'Share amount',format:'amount'},
  {key:'share_price',label:'Share price',format:'price'},
  {key:'filed_at',label:'Filed date',format:'date'},
  {key:'investors',label:'Investors'},
  {key:'bank',label:'Bank'},
  {key:'warrants_amount',label:'Warrant amount',format:'amount'},
  {key:'conversion_price',label:'Conversion price',format:'price'},
  {key:'offering_type',label:'Offering type'},
  {key:'form_type',label:'Form'},
  {key:'selling_shareholder_details',label:'Details',format:'details'},
  {key:'askedgar_url',label:'Filing',format:'link'}
];
export const ownershipColumns:Column[]=[
  {key:'owner_name',label:'Owner'},
  {key:'common_shares_amount',label:'Common shares',format:'amount'},
  {key:'owner_type',label:'Owner type'},
  {key:'title',label:'Title'},
  {key:'preferred_shares_amount',label:'Preferred shares',format:'amount'},
  {key:'options_amount',label:'Options',format:'amount'},
  {key:'warrants_amount',label:'Warrants',format:'amount'},
  {key:'shares_underlying_convertibles',label:'Convertible shares',format:'amount'},
  {key:'restricted_stock_units',label:'Restricted stock units',format:'amount'},
  {key:'outstanding_shares_final',label:'Shares outstanding',format:'amount'},
  {key:'filed_at',label:'Filed date',format:'date'},
  {key:'form_type',label:'Form'},
  {key:'classes_details',label:'Share classes',format:'details'},
  {key:'document_url',label:'Filing',format:'link'}
];
export const splitColumns:Column[]=[{key:'execution_date',label:'Execution date',format:'date'},{key:'split_from',label:'Split ratio',format:'split-ratio'}];
export const actionColumns:Column[]=[
  {key:'action_type',label:'Split status',format:'split-status'},
  {key:'split_from',label:'Split ratio',format:'split-ratio'},
  {key:'filed_at',label:'Filed date',format:'date'},
  {key:'vote_date',label:'Vote date',format:'date'},
  {key:'approved_date',label:'Approved date',format:'date'},
  {key:'effective_date',label:'Effective date',format:'date'},
  {key:'details',label:'Details',format:'details'},
  {key:'form_type',label:'Form'},
  {key:'document_url',label:'Source',format:'link'}
];
export function reportOwners(group?:Row):Row[]{return Array.isArray(group?.owners)?group.owners.filter((v):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v)):[];}
export function Cell({v,format,row,onTicker}:{v:unknown;format?:Column['format'];row:Row;onTicker?:(ticker:string)=>void}){
  if(format==='datetime'){const timestamp=newsDate(typeof v==='string'?v:null);return <div className="deal-filed"><time dateTime={typeof v==='string'?v:undefined}>{timestamp.date}{timestamp.time&&<small>{timestamp.time}</small>}</time></div>;}
  if(format==='ticker'){const ticker=typeof v==='string'?v.trim().toUpperCase():'';return /^[A-Z][A-Z0-9.\-]{0,19}$/.test(ticker)?<a href={'/?ticker='+encodeURIComponent(ticker)} onClick={event=>{if(onTicker&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onTicker(ticker);}}}>{ticker} ↗</a>:<>—</>;}
  if(format==='split-status'){const status=splitStatus(v);return <span className={'split-status '+status.className} title={displayValue(v)}>{status.label}</span>;}
  if(format==='split-ratio')return <span className="split-ratio">{splitRatio(v,row.split_to)}</span>;
  if(format==='link'){const href=filingUrl(v);return href?<a href={href} target="_blank" rel="noreferrer">View ↗</a>:<>—</>;}
  if(format==='date')return <>{dateText(v)}</>;
  if(format==='amount'||format==='money'||format==='price')return <span title={numberText(v,format!=='amount',false)}>{numberText(v,format!=='amount',format!=='price')}</span>;
  if(format==='details')return <span className="record-detail-text">{displayValue(v)}</span>;
  return <>{displayValue(v)}</>;
}
export function TableRecordDetails({row,columns}:{row:Row;columns:Column[]}){
  const narrativeColumns:Column[]=[...(row.details!==undefined&&!columns.some(column=>column.key==='details')?[{key:'details',label:'Details'}]:[]),...columns.filter(column=>column.format==='details')];
  const narratives=narrativeColumns.filter(column=>displayValue(row[column.key])!=='—');
  return <>
    <div className="summary-prose record-narratives">{narratives.length?narratives.map(column=><section key={column.key}><h3>{column.key==='selling_shareholder_details'?'Selling shareholder details':column.label}</h3><SummaryText summary={displayValue(row[column.key])}/></section>):<p className="summary-unavailable">No additional narrative details provided for this record.</p>}</div>
    <dl className="record-facts">{columns.filter(column=>column.format!=='details').map(column=><div key={column.key}><dt>{column.label}</dt><dd><Cell v={row[column.key]??(column.fallback?row[column.fallback]:undefined)} format={column.format} row={row}/></dd></div>)}</dl>
  </>;
}
export function DataTable({title,rows,columns,onTicker,hasMore=false,loading=false,error='',onLoadMore}:{title:string;rows:Row[];columns:Column[];onTicker?:(ticker:string)=>void;hasMore?:boolean;loading?:boolean;error?:string;onLoadMore?:()=>Promise<Row[]|undefined>}){
  const [selected,setSelected]=useState<Row|null>(null),[navigating,setNavigating]=useState(false);
  const pending=useRef(false);
  const withDetails=columns.some(column=>column.format==='details');
  const visibleColumns=withDetails?columns.filter(column=>column.format!=='details'):columns;
  const selectedIndex=selected?rows.indexOf(selected):-1;
  const recordTitle=(row:Row)=>displayValue(row.headline??row.owner_name??row[visibleColumns[0]?.key])==='—'?title+' record':displayValue(row.headline??row.owner_name??row[visibleColumns[0]?.key]);
  useEffect(()=>{if(selected&&selectedIndex<0)setSelected(null);},[selected,selectedIndex]);
  async function nextRecord(){
    if(!selected||loading||pending.current)return;
    const requested=selected;pending.current=true;setNavigating(true);
    try{const following=await nextDetail(rows,selectedIndex,hasMore,onLoadMore);if(following)setSelected(current=>current===requested?following:current);}
    finally{pending.current=false;setNavigating(false);}
  }
  return <><table className={'research-table'+(withDetails?' table-with-details':'')}><caption className="sr-only">{title}</caption><thead><tr>{visibleColumns.map(c=><th key={c.key} scope="col">{c.label}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{visibleColumns.map((c,j)=>{const v=row[c.key]??(c.fallback?row[c.fallback]:undefined);const content=<Cell v={v} format={c.format} row={row} onTicker={onTicker}/>;return j===0?<th scope="row" key={c.key}>{withDetails?<div className="table-row-heading"><DetailsButton label={'View '+title.toLowerCase()+' details: '+recordTitle(row)} onClick={()=>setSelected(row)}/><span className="table-row-title">{content}</span></div>:content}</th>:<td key={c.key} className={c.format==='amount'||c.format==='money'||c.format==='price'?'numeric-cell':undefined}>{content}</td>;})}</tr>)}</tbody></table>
    {selected&&selectedIndex>=0&&<DetailsDialog title={recordTitle(selected)} item={selected} index={selectedIndex} total={rows.length} hasMore={hasMore} loading={loading||navigating} error={error} onClose={()=>setSelected(null)} onPrevious={()=>{if(selectedIndex>0&&!loading&&!navigating)setSelected(rows[selectedIndex-1]);}} onNext={()=>void nextRecord()} meta={<div className="summary-meta"><span className="news-form">{title}</span></div>}><TableRecordDetails row={selected} columns={columns}/></DetailsDialog>}
  </>;
}
function useDataset(ticker:string,kind:Kind){
  const [rows,setRows]=useState<Row[]>([]),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[fetchedAt,setFetchedAt]=useState('');
  const active=useRef<AbortController|null>(null);
  const load=useCallback(async(nextPage:number)=>{
    active.current?.abort();const controller=new AbortController();active.current=controller;setLoading(true);setError('');
    try{const response=await fetch(`/api/company-tables?ticker=${encodeURIComponent(ticker)}&kind=${kind}&page=${nextPage}`,{signal:controller.signal});const body=await response.json() as Page;if(!response.ok)throw new Error(body.error||'Unable to load this table.');if(controller.signal.aborted)return;
      setRows(previous=>nextPage===1?body.rows:[...previous,...body.rows]);setPage(nextPage);setHasMore(body.hasMore);setMessage(body.message||'');setFetchedAt(body.fetchedAt);return body.rows;
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to load this table.');}finally{if(!controller.signal.aborted)setLoading(false);}
  },[ticker,kind]);
  useEffect(()=>{setRows([]);setPage(0);setHasMore(false);setMessage('');setFetchedAt('');void load(1);return()=>active.current?.abort();},[load]);
  return {rows,page,hasMore,loading,error,message,fetchedAt,load};
}
function DatasetPanel({ticker,kind}:{ticker:string;kind:Kind}){
  const dataset=useDataset(ticker,kind);const [reportIndex,setReportIndex]=useState(0);
  const scrollRef=useRef<HTMLDivElement>(null);const [edges,setEdges]=useState({left:false,right:false});const id=useId();
  const ownership=kind==='ownership',actions=kind==='actions',splits=kind==='splits';const title=ownership?'Ownership':actions?'Corporate actions':splits?'Reverse split history':'Offering history';
  const columns=ownership?ownershipColumns:actions?actionColumns:splits?splitColumns:offeringColumns;
  const groups=dataset.rows;const selected=groups[reportIndex];const rows=ownership?reportOwners(selected):dataset.rows;
  const updateEdges=useCallback(()=>{const el=scrollRef.current;if(el)setEdges({left:el.scrollLeft>2,right:el.scrollLeft+el.clientWidth<el.scrollWidth-2});},[]);
  useEffect(()=>{updateEdges();const el=scrollRef.current;if(!el)return;const observer=new ResizeObserver(updateEdges);observer.observe(el);if(el.firstElementChild)observer.observe(el.firstElementChild);return()=>observer.disconnect();},[updateEdges,rows.length,reportIndex,dataset.loading]);
  const move=(direction:number)=>{const el=scrollRef.current;if(el)el.scrollBy({left:direction*Math.max(180,el.clientWidth*.75),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
  return <section id={kind==='splits'?'reverse-splits':kind} tabIndex={-1} className="panel research-panel section-target" aria-labelledby={id+'-title'}><div className="section-head"><div><h2 id={id+'-title'}>{title}</h2><p>{ownership?'Shareholdings grouped by reported date.':actions?'Stock split status and vote history.':splits?'Historical reverse splits and execution dates.':'Capital raises, share issuances, and financing events.'}</p></div><div className="table-arrows"><button type="button" aria-label={'Scroll '+title.toLowerCase()+' left'} aria-controls={id} disabled={!edges.left} onClick={()=>move(-1)}>‹</button><button type="button" aria-label={'Scroll '+title.toLowerCase()+' right'} aria-controls={id} disabled={!edges.right} onClick={()=>move(1)}>›</button></div></div>
    {ownership&&groups.length>0&&<div className="report-bar"><label htmlFor={id+'-report'}>Reported date</label><select id={id+'-report'} value={reportIndex} onChange={e=>{setReportIndex(Number(e.target.value));scrollRef.current?.scrollTo({left:0});}}>{groups.map((g,i)=><option key={i} value={i}>{dateText(g.reported_date)}{i===0?' · Latest':''}</option>)}</select><span>{rows.length} holders</span></div>}
    {dataset.message&&<p className="table-message">{dataset.message}</p>}
    {dataset.error&&<div role="alert" className="table-message table-error">{dataset.error} <button type="button" disabled={dataset.loading} onClick={()=>void dataset.load(dataset.page+1)}>Retry</button></div>}
    {dataset.loading&&!dataset.rows.length?<div className="table-loading" role="status"><span className="spinner"/>Loading {title.toLowerCase()}…</div>:rows.length>0?<><div className="table-scroll research-scroll" ref={scrollRef} id={id} role="region" aria-label={title+' table, scroll horizontally for more columns'} tabIndex={0} onScroll={updateEdges}><DataTable title={title+(ownership?' · '+dateText(selected?.reported_date):'')} rows={rows} columns={columns} hasMore={!ownership&&dataset.hasMore} loading={dataset.loading} error={dataset.error} onLoadMore={()=>dataset.load(dataset.page+1)}/></div><div className="scroll-hint">Swipe or use the arrows to see more columns <span aria-hidden="true">↔</span></div></>:!dataset.error&&<div className="empty-row">No {ownership?'holders in this report':actions?'corporate action records':splits?'reverse split records':'offering records'} returned for {ticker}.</div>}
    {dataset.rows.length>0&&<div className="table-footer"><span>{ownership?`${groups.length} reports loaded`:`${rows.length} records loaded`}{dataset.fetchedAt&&<small>Retrieved {new Date(dataset.fetchedAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small>}</span>{dataset.hasMore&&<button type="button" className="load-more" disabled={dataset.loading} onClick={()=>void dataset.load(dataset.page+1)}>{dataset.loading?'Loading…':ownership?'Load earlier reports':actions?'Load more actions':splits?'Load more splits':'Load more offerings'}</button>}</div>}
  </section>;
}
export default function CompanyTables({ticker}:{ticker:string}){return <div className="company-tables"><DatasetPanel key={ticker+'-offerings'} ticker={ticker} kind="offerings"/><DatasetPanel key={ticker+'-ownership'} ticker={ticker} kind="ownership"/><DatasetPanel key={ticker+'-actions'} ticker={ticker} kind="actions"/><DatasetPanel key={ticker+'-splits'} ticker={ticker} kind="splits"/></div>}
