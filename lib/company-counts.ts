import {newsItem} from './company-news';
export function registeredOffering(row:Record<string,unknown>):boolean {
  return typeof row.headline==='string'&&row.headline.toUpperCase().includes('REGISTERED OFFERING');
}
export function countTone(count:number|null,kind:'dilution'|'offerings'|'splits'|'news') {
  if(count===null)return 'count-neutral';
  if(kind==='news')return count===0?'count-red':count===1?'count-yellow':'count-green';
  if(kind==='dilution')return count>0?'count-red':'count-green';
  return count>=4?'count-red':count>=2?'count-yellow':'count-green';
}

const easternDate=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function recentWindow(now=new Date()){
  const to=easternDate(now),end=new Date(to+'T12:00:00Z');
  // Bound the API query at the current UTC date: future dates are rejected.
  // Keep the lower date buffer and apply the Eastern calendar window below.
  return {from:new Date(end.getTime()-2*86400000).toISOString().slice(0,10),to,
    queryFrom:new Date(end.getTime()-3*86400000).toISOString().slice(0,10),queryTo:now.toISOString().slice(0,10)};
}
export function recentNews(row:Record<string,unknown>,window:ReturnType<typeof recentWindow>){
  const item=newsItem(row);if(!item?.date)return false;
  const value=item.date,parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))return false;
  const day=/T\d{2}:\d{2}/.test(value)&&/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)?easternDate(parsed):value.slice(0,10);
  return day>=window.from&&day<=window.to;
}
