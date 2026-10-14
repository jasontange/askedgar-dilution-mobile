import React from 'react';
import {finiteNumber,priceSignal} from '../lib/dilution-price';
type Row = Record<string, unknown>;
function value(v: unknown): string {
  if(v === null || v === undefined || v === '') return '—';
  if(Array.isArray(v)) return v.map(value).join(', ');
  if(typeof v === 'object') return Object.values(v as Row).map(value).join(' · ');
  return String(v);
}
function number(v: unknown, money = false): string {
  if(v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if(!Number.isFinite(n)) return value(v);
  return new Intl.NumberFormat('en-US', {maximumFractionDigits: money ? 8 : 2, ...(money ? {style:'currency',currency:'USD',minimumFractionDigits:2} : {})}).format(n);
}
function date(v: unknown): string {
  if(typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return value(v);
  const d = new Date(v.slice(0,10)+'T12:00:00Z');
  return Number.isNaN(d.getTime()) ? value(v) : d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}
function sourceUrl(v:unknown){
  if(typeof v !== 'string') return null;
  try {const url = new URL(v); return url.protocol==='https:' && (url.hostname==='app.askedgar.io'||url.hostname==='www.sec.gov'||url.hostname==='sec.gov') ? url.href : null;} catch {return null;}
}
export default function InstrumentCards({title,subtitle,rows,kind,stockPrice}:{title:string;subtitle:string;rows:Row[];kind:'warrant'|'convertible';stockPrice:number|null}) {
  const warrant = kind === 'warrant';
  return <section id={kind==='warrant'?'warrants':'convertibles'} tabIndex={-1} className="panel instruments section-target"><div className="section-head"><div><h2>{title} <span className="count">{rows.length}</span></h2><p className="instrument-subtitle-mobile">{subtitle}</p><p className="instrument-subtitle-desktop">Ownership, price protection, dates, and filing details.</p></div></div><div className="instrument-list">{rows.length ? rows.map((r,i)=>{
    const name = value(r.details)==='—' ? 'Unnamed '+kind : value(r.details);
    const shares = warrant ? r.warrants_remaining : r.underlying_shares_remaining;
    const price = warrant ? r.warrants_exercise_price : r.conversion_price;
    const protection = typeof r.price_protection==='string' ? r.price_protection.trim() : '';
    const visibleProtection = protection && !/customary/i.test(protection) ? protection : null;
    const signalFor = (amount:unknown)=>priceSignal(amount,stockPrice,shares??(!warrant?r.convertible_debt_remaining:undefined),r.price_protection);
    const signal = signalFor(price);
    const floorPrice = finiteNumber(r.floor_price);
    const floorSignal = signalFor(r.floor_price);
    const prefundedCost = r.prefunded_cost??r.pre_funded_cost;
    const link = sourceUrl(r.askedgar_url);
    const fields: [string,string,ReturnType<typeof priceSignal>?][] = [
      [warrant?'Warrants Remaining':'Shares Remaining',number(shares)],
      [warrant?'Exercise Price':'Conversion Price',number(price,true),signal],
      ['Floor Price',number(r.floor_price,true),floorSignal],
      ...(warrant ? [['Total Warrants',number(r.warrants_amount)],['Pre-Funded Cost',number(prefundedCost,true),signalFor(prefundedCost)]] as [string,string,ReturnType<typeof priceSignal>?][] : [['Amount Remaining',number(r.convertible_debt_remaining,true)],['Total Amount',number(r.offering_amount,true)]] as [string,string,ReturnType<typeof priceSignal>?][]),
      ['Owners',value(r.owners)],['Bank',value(r.bank)],
      ...(visibleProtection ? [['Price Protection',visibleProtection]] as [string,string,ReturnType<typeof priceSignal>?][] : []),['Details',value(r.pp_clause)],
      ...(warrant ? [['Exercisable Date',date(r.exercisable_date)],['Expiration Date',date(r.expiration_date)]] as [string,string,ReturnType<typeof priceSignal>?][] : [['Convertible Date',date(r.convertible_date)],['Maturity Date',date(r.maturity_date)]] as [string,string,ReturnType<typeof priceSignal>?][]),
      ['Filed Date',date(r.filed_at)]
    ];
    const body = (mobile=false)=><div className="instrument-body"><dl>{fields.map(([label,v,fieldSignal],fieldIndex)=>mobile&&(fieldIndex<2||(label==='Floor Price'&&floorPrice!==null)||label==='Price Protection')?null:<div className={'instrument-field'+(label==='Details'?' clause-field':'')+(fieldIndex<2?' key-instrument-field':'')} key={label}><dt>{label}</dt><dd className={fieldSignal?'instrument-price '+fieldSignal.className:undefined} title={fieldSignal?.description}>{v}{fieldSignal&&<span className="sr-only"> — {fieldSignal.description}</span>}</dd></div>)}</dl>{link&&<div className="card-source"><a href={link} target="_blank" rel="noreferrer">View filing ↗</a></div>}</div>;
    return <React.Fragment key={`${name}-${i}`}>
      <article className={'instrument-card instrument-card-desktop '+signal.className}>
        <div className="instrument-desktop-heading"><h3 className="instrument-name">{name}</h3>{value(r.registered)!=='—'&&<span className="instrument-registration">{value(r.registered)}</span>}</div>
        {body()}
      </article>
      <details className={'instrument-card instrument-card-mobile '+signal.className}><summary className="instrument-summary"><span className="instrument-name">{name}{value(r.registered)!=='—'&&<span className="instrument-registration">{value(r.registered)}</span>}{visibleProtection&&<span className="instrument-protection"><span>Price protection</span><strong>{visibleProtection}</strong></span>}</span><span className="summary-stat"><span>{warrant?'Warrants remaining':'Shares remaining'}</span><strong>{number(shares)}</strong></span><span className="summary-stat"><span>{warrant?'Exercise price':'Conversion price'}</span><strong className={"instrument-price "+signal.className} title={signal.description}>{number(price,true)}<span className="sr-only"> — {signal.description}</span></strong>{floorPrice!==null&&<span className="summary-stat summary-floor-price"><span>Floor price</span><strong className={"instrument-price "+floorSignal.className} title={floorSignal.description}>{number(floorPrice,true)}<span className="sr-only"> — {floorSignal.description}</span></strong></span>}</span><span className="card-chevron" aria-hidden="true">⌄</span></summary>{body(true)}</details>
    </React.Fragment>;
  }) : <div className="empty-row">No {title.toLowerCase()} returned for this ticker.</div>}</div></section>;
}
