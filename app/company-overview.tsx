import React from 'react';
import StockChartButton from './stock-chart';
import CompanyCounts from './company-counts';
import {finiteNumber} from '../lib/dilution-price';
import {offeringAbilityLines} from '../lib/offering-ability';
type Row=Record<string,unknown>;
export function label(value:unknown):string{return value===null||value===undefined||value===''?'—':String(value);}
function quantity(value:unknown,money=false){const n=finiteNumber(value);return n===null?'—':new Intl.NumberFormat('en-US',{notation:Math.abs(n)>=1000?'compact':'standard',maximumFractionDigits:2,...(money?{style:'currency',currency:'USD'}:{})}).format(n);}
export function dailyChange(value:unknown){const n=finiteNumber(value);return n===null?'—':`${n>0?'+':''}${n.toFixed(2)}%`;}
export default function CompanyOverview({ticker,overview,stockPrice,fetchedAt,dilutionRows=[]}:{ticker:string;overview:Row|null;stockPrice:number|null;fetchedAt:string|null;dilutionRows?:Row[]}){
  const gain=finiteNumber(overview?.gain_1_day);
  const gainClass=gain===null||gain===0?'gain-neutral':gain>0?'gain-positive':'gain-negative';
  const fields:[string,unknown,string][]=[
    ['Country',overview?.country,label(overview?.country)],
    ['Market cap',overview?.market_cap_final,quantity(overview?.market_cap_final,true)],
    ['Tradable float',overview?.tradable_float,quantity(overview?.tradable_float)],
    ['Outstanding shares (OS)',overview?.outstanding,quantity(overview?.outstanding)],
    ['Sector',overview?.sector,label(overview?.sector)],
    ['Industry',overview?.industry,label(overview?.industry)]
  ];
  return <section id="company" tabIndex={-1} className="company-overview panel section-target" aria-label={`${ticker} company overview`}><div className="company-heading"><div className="company-identity"><div className="ticker-line"><h1>{ticker}</h1><StockChartButton key={ticker} ticker={ticker} dilutionRows={dilutionRows} stockPrice={stockPrice} exchange={typeof overview?.exchange==='string'?overview.exchange:undefined}/>{Boolean(overview?.exchange)&&<span className="exchange-label">{label(overview?.exchange)}</span>}</div><p className="company-name">{label(overview?.companyname)==='—'?'Company overview':label(overview?.companyname)}</p></div><div className="company-quote"><div className="quote-values"><strong>{stockPrice===null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:8}).format(stockPrice)}</strong><span className={gainClass}>{dailyChange(overview?.gain_1_day)} <small>1D</small></span></div><span className="quote-source">AskEdgar screener · Delayed</span></div></div><dl className="overview-stats">{fields.map(([name,raw,formatted])=><div key={name}><dt>{name}</dt><dd title={label(raw)}>{formatted}</dd></div>)}</dl><CompanyCounts key={ticker} ticker={ticker}/><div className="overview-timestamp">{fetchedAt?'Profile retrieved '+new Date(fetchedAt).toLocaleString():'Profile data unavailable'}</div></section>;
}
function Badge({value}:{value:unknown}){const text=label(value);const color=['high','medium','low'].includes(text.toLowerCase())?text.toLowerCase():'';return <span className={'badge '+color}>{text==='—'?'Unavailable':text}</span>}
export function OfferingAbilityDescription({description}:{description:string}){return <>{offeringAbilityLines(description).map((line,lineIndex)=><span className="offering-ability-line" key={lineIndex}>{line.map((part,index)=>part.tone?<strong key={index} className={'offering-capacity offering-capacity-'+part.tone}>{part.text}</strong>:part.bold?<strong key={index} className="offering-ability-label">{part.text}</strong>:<React.Fragment key={index}>{part.text}</React.Fragment>)}</span>)}</>}
export function RiskRatings({rating}:{rating:Row|null}){return <section id="ratings" tabIndex={-1} className="panel risk-panel section-target" aria-label="Offering risk ratings"><div className="section-head"><h2>Offering risk ratings</h2><span className="eyebrow">ASKEDGAR RATINGS</span></div><div className="risk-grid">{[['overall_offering_risk','Overall offering risk'],['dilution','Dilution'],['offering_ability','Offering ability'],['offering_frequency','Offering frequency'],['cash_need','Cash need'],['nasdaq_compliance','Nasdaq compliance']].map(([key,name])=><div className={'risk'+(key==='overall_offering_risk'?' overall-risk':'')} key={key}><label>{name}</label><Badge value={rating?.[key]}/><p>{label(rating?.[key+'_desc'])==='—'?'No explanation available.':key==='offering_ability'?<OfferingAbilityDescription description={label(rating?.[key+'_desc'])}/>:label(rating?.[key+'_desc'])}</p></div>)}</div></section>}
export function ManagementCommentary({commentary}:{commentary:unknown}){
  const text=typeof commentary==='string'?commentary.trim():'';
  return <section id="management-commentary" tabIndex={-1} className="panel management-commentary section-target" aria-labelledby="management-commentary-heading"><div className="section-head"><h2 id="management-commentary-heading">Management commentary</h2></div><p className="management-commentary-text">{text||'No management commentary available.'}</p></section>;
}
