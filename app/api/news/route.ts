import {env} from 'cloudflare:workers';
import {parseNewsTags,newsItem,sortNews,type NewsItem} from '../../../lib/company-news';
import {providerMessage} from '../../../lib/provider-message';
import {WATCHLIST_ITEMS_PER_TICKER} from '../../../lib/watchlist';
import {askedgarPage} from '../../../lib/askedgar-api';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  const ticker=(params.get('ticker')||'').trim().toUpperCase();
  const page=Number(params.get('page')||1);
  const kind=params.get('kind')||'all',rawTag=params.getAll('tag').join(',');
  const watchlist=params.get('view')==='watchlist';
  const dateFrom=params.get('date_from'),dateTo=params.get('date_to'),formType=params.get('form_type');
  let tags:string[];try{tags=parseNewsTags(rawTag);}catch(error){return Response.json({error:(error as Error).message},{status:400});}
  const tag=tags.join(',')||null;
  const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
  if(!/^[A-Z][A-Z0-9.\-]{0,19}$/.test(ticker))return reply({error:'Enter a valid ticker symbol.'},400);
  if(!Number.isSafeInteger(page)||page<1||page>1000)return reply({error:'Invalid page number.'},400);
  if([dateFrom,dateTo].some(date=>date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))))||(dateFrom&&dateTo&&dateFrom>dateTo)||formType!==null&&!/^[A-Za-z0-9 /,\-]{1,200}$/.test(formType))return reply({error:'Invalid news filters.'},400);
  if(!['all','filings','news'].includes(kind))return reply({error:'Choose all items, filings, or news.'},400);
  const key=(env as unknown as Record<string,string>).ASKEDGAR_API_KEY;
  if(!key)return reply({error:'The data connection is not configured.'},503);
  try{
    let rows:NewsItem[]=[],nextPage=page,hasMore=false,message:string|null=null;
    // Watchlist batches never scan additional pages automatically: one call per ticker.
    // Keep the existing commentary-skipping behavior on company detail pages.
    for(let attempt=0;attempt<(watchlist?1:5);attempt++){
      const query=new URLSearchParams({ticker,page:String(nextPage),limit:String(watchlist?WATCHLIST_ITEMS_PER_TICKER:5),include_summary:'true',include_body:'false'});
      if(tag)query.set('tag',tag);
      if(dateFrom)query.set('date_from',dateFrom);
      if(dateTo)query.set('date_to',dateTo);
      if(formType)query.set('form_type',formType);
      if(kind==='filings')query.set('hide_news','true');
      if(kind==='news')query.set('hide_filings','true');
      const body=await askedgarPage('news',query);
      const results=watchlist?body.results.slice(0,WATCHLIST_ITEMS_PER_TICKER):body.results;
      rows=sortNews(results.filter(r=>r&&typeof r==='object'&&!Array.isArray(r)).map(newsItem).filter((r):r is NewsItem=>r!==null).filter(r=>kind==='all'||(kind==='news'?r.formType==='News':r.formType!=='News')));
      message=providerMessage(body.message);nextPage++;
      hasMore=body.has_more===true&&nextPage<=1000;
      if(rows.length||!hasMore)break;
    }
    const data={ticker,kind,tag,rows,nextPage,hasMore,message};
    return reply(data);
  }catch(error){return reply({error:(error as Error).message},502);}
}
