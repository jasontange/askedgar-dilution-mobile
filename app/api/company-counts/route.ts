import {env} from 'cloudflare:workers';
import {registeredOffering,recentWindow,recentNews} from '../../../lib/company-counts';
import {askedgarPage} from '../../../lib/askedgar-api';
export const dynamic='force-dynamic';
type Row=Record<string,unknown>;
export async function GET(request:Request){
  const ticker=(new URL(request.url).searchParams.get('ticker')||'').trim().toUpperCase();
  const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
  if(!/^[A-Z][A-Z0-9.\-]{0,19}$/.test(ticker))return reply({error:'Enter a valid ticker symbol.'},400);
  const key=(env as unknown as Record<string,string>).ASKEDGAR_API_KEY;
  if(!key)return reply({error:'The data connection is not configured.'},503);
  async function count(endpoint:'dilution-data'|'offerings'|'reverse-splits'|'news',filters:Record<string,string>,matches:(row:Row)=>boolean){
    let total=0;
    for(let page=1;page<=20;page++){
      const params=new URLSearchParams({ticker,page:String(page),limit:'100',...filters});
      const body=await askedgarPage(endpoint,params,true);
      if(typeof body.has_more!=='boolean')throw new Error('Count unavailable.');
      total+=body.results.filter(matches).length;
      if(!body.has_more)return total;
    }
    throw new Error('The complete count could not be loaded.');
  }
  const window=recentWindow();
  const [dilution,offerings,splits,news]=await Promise.allSettled([
    count('dilution-data',{show_in_play:'true'},()=>true),
    count('offerings',{headline:'REGISTERED OFFERING'},registeredOffering),
    count('reverse-splits',{},()=>true),
    count('news',{date_from:window.queryFrom,date_to:window.queryTo,include_summary:'false',include_body:'false'},row=>recentNews(row,window))
  ]);
  const data={ticker,inPlayDilutionCount:dilution.status==='fulfilled'?dilution.value:null,registeredOfferingCount:offerings.status==='fulfilled'?offerings.value:null,reverseSplitCount:splits.status==='fulfilled'?splits.value:null,recentNewsCount:news.status==='fulfilled'?news.value:null,newsWindow:{from:window.from,to:window.to,timeZone:'America/New_York'}};
  return reply(data);
}
