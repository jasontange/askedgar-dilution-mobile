'use client';
import {useId,useState} from 'react';
import {changeDate,dilutionChanges,parseDilutionDetails} from '../lib/dilution-changes';

export function InstrumentDetails({value}:{value:unknown}) {
  const [expanded,setExpanded]=useState(false);
  const id=useId();
  const {terms,changes}=parseDilutionDetails(value);
  if(!terms&&!changes.length)return <>—</>;
  const earlier=Math.max(0,changes.length-2);
  const canExpand=earlier>0||terms.length>180;
  return <div className="instrument-details">
    <div id={id}>
      {changes.length>0&&<ol className="instrument-changes">{(expanded?changes:changes.slice(0,2)).map((change,index)=><li key={change.date+'-'+index}><time dateTime={change.date}>{changeDate(change.date)}</time>{' '}{change.text}</li>)}</ol>}
      {terms&&<p className={'instrument-original-terms'+(!expanded&&terms.length>180?' terms-preview':'')}>{terms}</p>}
    </div>
    {canExpand&&<button type="button" className="changes-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}>{expanded?'Show less':earlier?`Show all (${earlier} earlier ${earlier===1?'change':'changes'})`:'Show all'}</button>}
  </div>;
}

export default function DilutionChanges({rows,complete}:{rows:Record<string,unknown>[];complete:boolean}) {
  const [expanded,setExpanded]=useState(false);
  const id=useId();
  const changes=dilutionChanges(rows);
  return <section className="panel dilution-changes section-target" id="dilution-updates" tabIndex={-1} aria-labelledby="dilution-updates-heading">
    <div className="section-head"><div><h2 id="dilution-updates-heading">Recent dilution updates</h2><p>Changes to warrants and convertibles, including out-of-play instruments.</p></div></div>
    {!complete&&<p className="changes-incomplete">Only part of the instrument history loaded. More updates may be available.</p>}
    {changes.length?<><ol className="dilution-change-feed" id={id}>{(expanded?changes:changes.slice(0,3)).map(change=><li key={change.key}><time dateTime={change.date}>{changeDate(change.date)}</time><div><p>{change.text}</p><span className="change-instrument">{change.name} · {change.kind}</span></div></li>)}</ol>{changes.length>3&&<button type="button" className="changes-toggle feed-toggle" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}>{expanded?'Show less':`Show all ${changes.length} changes`} <span aria-hidden="true">{expanded?'⌃':'⌄'}</span></button>}</>:<p className="empty-row">{complete?'No dated dilution updates reported for this ticker.':'No dated updates in the instruments loaded so far.'}</p>}
  </section>;
}
