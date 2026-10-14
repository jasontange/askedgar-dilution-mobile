import {finiteNumber} from './dilution-price';
export function splitStatus(value:unknown):{label:string;className:string}{
  const text=typeof value==='string'?value.trim():'';
  const status=text.toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').replace(/^stock split /,'');
  if(status==='vote approved')return {label:'Vote approved',className:'split-approved'};
  if(status==='pending vote')return {label:'Pending vote',className:'split-pending'};
  if(status==='announced')return {label:'Split announced',className:'split-announced'};
  return {label:text||'Unavailable',className:'split-unknown'};
}
export function splitRatio(from:unknown,to:unknown):string {
  const oldShares=finiteNumber(from),newShares=finiteNumber(to);
  if(oldShares===null||newShares===null||oldShares<=0||newShares<=0)return '—';
  const format=(value:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:8}).format(value);
  return `${format(newShares)}-for-${format(oldShares)}`;
}
