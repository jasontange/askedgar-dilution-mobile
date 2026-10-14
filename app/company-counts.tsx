'use client';
import React,{useEffect,useState} from 'react';
import {countTone} from '../lib/company-counts';
type Counts={inPlayDilutionCount:number|null;registeredOfferingCount:number|null;reverseSplitCount:number|null;recentNewsCount:number|null};
export default function CompanyCounts({ticker}:{ticker:string}){
  const [data,setData]=useState<Counts|null>(null),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setData(null);setLoading(true);
    fetch('/api/company-counts?ticker='+encodeURIComponent(ticker),{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('Unavailable');const body=await response.json() as Counts;if(!controller.signal.aborted)setData(body);
    }).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[ticker,attempt]);
  const counts:[string,number|null,'dilution'|'offerings'|'splits'|'news',string,string][]=[
    ['In-play dilution',data?.inPlayDilutionCount??null,'dilution','Number of dilution records returned with Show in play enabled.','#dilution'],
    ['Registered offerings',data?.registeredOfferingCount??null,'offerings','All available offering records whose headline contains REGISTERED OFFERING.','#offerings'],
    ['Reverse splits',data?.reverseSplitCount??null,'splits','All available historical reverse splits.','#reverse-splits'],
    ['News & filings · 3 days',data?.recentNewsCount??null,'news','Today and the previous two calendar days in Eastern time.','#news-filings']
  ];
  const incomplete=!loading&&counts.some(([,count])=>count===null);
  return <div className="profile-counts" aria-live="polite"><dl className="profile-count-grid">{counts.map(([label,count,kind,description,href])=><div key={kind}><dt title={description}><a href={href}>{label} <span aria-hidden="true">↗</span></a></dt><dd className={countTone(count,kind)} title={description}><a href={href} aria-label={label+': '+(loading?'loading':count===null?'unavailable':count.toLocaleString('en-US'))}>{loading?'…':count===null?'Unavailable':count.toLocaleString('en-US')}</a></dd></div>)}</dl>{incomplete&&<button type="button" className="count-retry" onClick={()=>setAttempt(n=>n+1)}>Retry counts</button>}</div>;
}
