import { env } from 'cloudflare:workers';
import {finiteNumber} from '../../../lib/dilution-price';
import {providerMessage} from '../../../lib/provider-message';
import {askedgarPage} from '../../../lib/askedgar-api';
export const dynamic = 'force-dynamic';
type Row = Record<string, unknown>;
export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get('ticker')?.trim().toUpperCase() || '';
  if (!/^[A-Z][A-Z0-9.\-]{0,19}$/.test(ticker)) return Response.json({error:'Enter a valid ticker symbol.'},{status:400});
  const key = (env as unknown as Record<string,string>).ASKEDGAR_API_KEY;
  if(!key) return Response.json({error:'The data connection is not configured.'},{status:503});
  const query=(endpoint:'dilution-rating'|'dilution-data-advanced'|'screener',page=1)=>askedgarPage(endpoint,new URLSearchParams({ticker,page:String(page),limit:'100'}));
  try {
    const [ratingResult, detailResult, screenerResult] = await Promise.allSettled([query('dilution-rating'), query('dilution-data-advanced'), query('screener')]);
    const warnings: string[] = [];
    let rating: Row | null = null, rows: Row[] = [], complete = true;
    const dilutionTimes:string[]=[];
    if(ratingResult.status==='fulfilled') { rating=ratingResult.value.results[0] || null; if(ratingResult.value.message) warnings.push(ratingResult.value.message); }
    else warnings.push(ratingResult.reason.message);
    if(detailResult.status==='fulfilled') {
      rows=[...detailResult.value.results]; let more=detailResult.value.has_more, page=1;
      dilutionTimes.push(detailResult.value.fetchedAt);
      if(detailResult.value.message) warnings.push(detailResult.value.message);
      while(more && page<20) {try {const next=await query('dilution-data-advanced',++page); rows.push(...next.results); more=next.has_more;dilutionTimes.push(next.fetchedAt);}catch(e){warnings.push((e as Error).message);complete=false;break;}}
      if(more) {complete=false;warnings.push('Only part of the instrument list could be loaded. Totals are not shown.');}
    } else {complete=false;warnings.push(detailResult.reason.message);}
    if(ratingResult.status==='rejected' && detailResult.status==='rejected') return Response.json({error:warnings[0]},{status:502});
    let overview:Row|null=null;
    let stockPrice:number|null=null;
    let stockPriceMessage:string|null=null;
    if(screenerResult.status==='fulfilled') {
      const company=screenerResult.value.results.find(r=>String(r.ticker).toUpperCase()===ticker);
      if(company)overview=Object.fromEntries(['companyname','country','exchange','market_cap_final','tradable_float','outstanding','sector','industry','price','gain_1_day','currency','mgmt_commentary'].map(field=>[field,company[field]??null]));
      const parsedPrice=finiteNumber(company?.price);
      if(parsedPrice!==null&&parsedPrice>0)stockPrice=parsedPrice;
      else stockPriceMessage='No valid screener stock price is available. Price colors are disabled.';
    } else stockPriceMessage='The screener stock price could not be loaded. Price colors are disabled.';
    const data={ticker,overview,rating,rows,complete,stockPrice,stockPriceMessage,warnings:[...new Set(warnings.map(providerMessage).filter((message):message is string=>message!==null))],
      fetchedAt:screenerResult.status==='fulfilled'?screenerResult.value.fetchedAt:null,
      ratingsFetchedAt:ratingResult.status==='fulfilled'?ratingResult.value.fetchedAt:null,
      dilutionFetchedAt:dilutionTimes.sort()[0]||null};
    return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
  } catch {return Response.json({error:'The request timed out. Please try again.'},{status:502});}
}
