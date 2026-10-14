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
export function registration(v:unknown):string {
  const label=value(v);
  if(label==='—')return 'Registration unavailable';
  if(/^(true|yes|registered)$/i.test(label))return 'Registered';
  if(/^(false|no|unregistered)$/i.test(label))return 'Unregistered';
  return label;
}
export function InstrumentCard({row:r,kind,stockPrice,expanded=false}:{row:Row;kind:'warrant'|'convertible';stockPrice:number|null;expanded?:boolean}){
  const warrant=kind==='warrant';
    const name = value(r.details)==='—' ? 'Unnamed '+kind : value(r.details);
    const shares = warrant ? r.warrants_remaining : r.underlying_shares_remaining;
    const price = warrant ? r.warrants_exercise_price : r.conversion_price;
    const protection = typeof r.price_protection==='string' ? r.price_protection.trim() : '';
    const visibleProtection = protection && !/customary/i.test(protection) ? protection : null;
    const remaining = shares??(!warrant?r.convertible_debt_remaining:undefined);
    const signal = priceSignal(price,stockPrice,remaining,r.price_protection);
    const floorPrice = finiteNumber(r.floor_price);
    const prefundedCost = r.prefunded_cost ?? r.pre_funded_cost;
    const fieldSignals: Record<string,ReturnType<typeof priceSignal>> = {
      [warrant?'Exercise Price':'Conversion Price']: signal,
      'Floor Price': priceSignal(r.floor_price,stockPrice,remaining,r.price_protection),
      'Pre-Funded Cost': priceSignal(prefundedCost,stockPrice,remaining,r.price_protection),
    };
    const link = sourceUrl(r.askedgar_url);
    const fields: [string,string][] = [
      [warrant?'Warrants Remaining':'Shares Remaining',number(shares)],
      [warrant?'Exercise Price':'Conversion Price',number(price,true)],
      ['Floor Price',number(r.floor_price,true)],
      ...(warrant ? [['Total Warrants',number(r.warrants_amount)],['Pre-Funded Cost',number(prefundedCost,true)]] as [string,string][] : [['Amount Remaining',number(r.convertible_debt_remaining,true)],['Total Amount',number(r.offering_amount,true)]] as [string,string][]),
      ['Owners',value(r.owners)],['Bank',value(r.bank)],
      ...(visibleProtection ? [['Price Protection',visibleProtection]] as [string,string][] : []),['Details',value(r.pp_clause)],
      ...(warrant ? [['Exercisable Date',date(r.exercisable_date)],['Expiration Date',date(r.expiration_date)]] as [string,string][] : [['Convertible Date',date(r.convertible_date)],['Maturity Date',date(r.maturity_date)]] as [string,string][]),
      ['Filed Date',date(r.filed_at)]
    ];
    const body = (omitSummaryFields = false) => <div className="instrument-body"><dl>{fields.map(([label,v],fieldIndex)=>omitSummaryFields&&(fieldIndex<2||(label==='Floor Price'&&floorPrice!==null)||label==='Price Protection')?null:<div className={'instrument-field'+(label==='Details'?' clause-field':'')+(fieldIndex<2?' key-instrument-field':'')} key={label}><dt>{label}</dt><dd className={fieldSignals[label]?'instrument-price '+fieldSignals[label].className:undefined} title={fieldSignals[label]?.description}>{v}{fieldSignals[label]&&<span className="sr-only"> — {fieldSignals[label].description}</span>}</dd></div>)}</dl>{link&&<div className="card-source"><a href={link} target="_blank" rel="noreferrer">View filing ↗</a></div>}</div>;
    return <React.Fragment ><details open={expanded||undefined} className={'instrument-card instrument-card-mobile '+signal.className}><summary className={"instrument-summary"+(floorPrice!==null?" has-floor-price":"")}><span className="instrument-name">{name}{(expanded||value(r.registered)!=='—')&&<span className="instrument-registration" aria-label="Registered status">{registration(r.registered)}</span>}{visibleProtection&&<span className="instrument-protection"><span>Price protection</span><strong>{visibleProtection}</strong></span>}</span><span className="summary-stat"><span>{warrant?'Warrants remaining':'Shares remaining'}</span><strong>{number(shares)}</strong></span><span className="summary-stat"><span>{warrant?'Exercise price':'Conversion price'}</span><strong className={"instrument-price "+signal.className} title={signal.description}>{number(price,true)}<span className="sr-only"> — {signal.description}</span></strong>{floorPrice!==null&&<><span className="summary-floor-label">Floor price</span><strong className={"instrument-price "+fieldSignals["Floor Price"].className} title={fieldSignals["Floor Price"].description}>{number(floorPrice,true)}<span className="sr-only"> — {fieldSignals["Floor Price"].description}</span></strong></>}</span><span className="card-chevron" aria-hidden="true">⌄</span></summary>{body(true)}</details><article className={'instrument-card instrument-card-desktop '+signal.className} aria-label={name}><div className="instrument-desktop-heading"><h3 className="instrument-name">{name}</h3>{(expanded||value(r.registered)!=='—')&&<span className="instrument-registration" aria-label="Registered status">{registration(r.registered)}</span>}</div>{body()}</article></React.Fragment>;
}
