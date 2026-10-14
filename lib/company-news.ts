export type NewsItem={date:string|null;formType:string;headline:string;headlineSource:'title'|'headline'|'summary'|'form';summary:string|null;tags:string[];url:string|null};
export type NewsKind='all'|'filings'|'news';
// Request-filter values differ from free-form response tags.
export const NEWS_EVENT_TAGS=['Earnings','Contracts','Expansion Plans','Product Launches','Dividends','Mergers','Acquisitions','Management Changes','FDA','Divestures','Restructuring','Financial Trouble','Offerings','Dilution','Legal Disputes','Payment Defaults','Credit Rating Changes','Operational Disruptions','Accounting Changes','Workforce Reduction','Investor Conferences','Delisting Actions','IPOs','Name Changes','Offer for sale','Earnings Calls','Partnerships','License Agreements','Upcoming Events','Financial Performance','Insider Selling','Insider Buying','Positive Data','Negative Data','Clinical Trials','Stock Splits','Executive Compensation','Cryptocurrency','Patents','Bankruptcy','Buyback','Capital Structure','Financing Activity','Cannabis','Shareholder Vote','AI','Cash Runway','Other'].sort();
export const canonicalTag=(value:string)=>NEWS_EVENT_TAGS.find(tag=>tag.toLowerCase()===value.trim().toLowerCase())||null;
export function parseNewsTags(raw:string){
  if(raw.length>600)throw new Error('Select fewer event labels.');
  const requested=raw.split(',').map(value=>value.trim()).filter(Boolean);
  if(requested.some(value=>!canonicalTag(value)))throw new Error('Choose supported event labels.');
  return NEWS_EVENT_TAGS.filter(tag=>requested.some(value=>value.toLowerCase()===tag.toLowerCase()));
}
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
function plainText(value:unknown):string {
  return text(value).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,entity:string)=>{const n=entity.toLowerCase().startsWith('x')?parseInt(entity.slice(1),16):Number(entity);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}).replace(/&(amp|quot|apos|lt|gt|nbsp);/gi,(_,entity:string)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[entity.toLowerCase()]||'')).replace(/\s+/g,' ').trim();
}
function meaningfulHeadline(value:unknown,form:string):string {
  const candidate=plainText(value),normalized=candidate.toLowerCase().replace(/[^a-z0-9]/g,'');
  const formOnly=form.toLowerCase().replace(/[^a-z0-9]/g,'');
  return !candidate||['na','none','null','notavailable','filing','secfiling',formOnly,`form${formOnly}`,`${formOnly}filing`,`form${formOnly}filing`].includes(normalized)?'':candidate;
}
function safeUrl(value:unknown):string|null {
  try{const url=new URL(text(value));return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function newsItem(row:Record<string,unknown>):NewsItem|null {
  const form=text(row.form_type),isNews=form.toLowerCase()==='news';
  // These are AI summaries / analyst notes, rather than news or SEC filings.
  if(['grok','jmt415'].includes(form.toLowerCase()))return null;
  const candidates:[NewsItem['headlineSource'],string][]=(isNews?['title','headline']:['headline','title']).map(key=>[key as 'title'|'headline',meaningfulHeadline(row[key],form)]);
  const summaryHeadline=text(row.summary).match(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?HEADLINE\s*:(?:\*\*)?\s*([^\n]+)/i)?.[1]?.replace(/^\*\*|\*\*$/g,'');
  candidates.push(['summary',meaningfulHeadline(summaryHeadline,form)]);
  const [headlineSource,headline]=candidates.find(([,value])=>!!value)||['form',isNews?'News article':form?`${form} filing`:'SEC filing'];
  const timestamp=text(row.filed_at_time);
  const date=timestamp&&!Number.isNaN(Date.parse(timestamp))?timestamp:text(row.filed_at);
  const tags=Array.isArray(row.tags)?[...new Set(row.tags.map(plainText).filter(Boolean))]:[];
  return {date:date||null,formType:isNews?'News':form||'Filing',headline,headlineSource,summary:text(row.summary)||null,tags,url:safeUrl(row.url)||safeUrl(row.document_url)};
}
export function newsDate(value:string|null):{date:string;time:string|null} {
  if(!value)return {date:'—',time:null};
  const hasTime=/T\d{2}:\d{2}/.test(value);
  // Respect the source offset; timezone-free timestamps stay timezone-free.
  const hasZone=/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date=new Date(hasTime&&hasZone?value:value.slice(0,10)+'T12:00:00Z');
  if(Number.isNaN(date.getTime()))return {date:'—',time:null};
  const zone=hasTime&&hasZone?'America/New_York':'UTC';
  return {date:date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:zone}),time:hasTime?(hasZone?date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}):value.slice(11,16)+' (source time)'):null};
}
export function sortNews(rows:NewsItem[]):NewsItem[]{return [...rows].sort((a,b)=>(Date.parse(b.date||'')||0)-(Date.parse(a.date||'')||0));}
