import {siteConfig} from '../../../lib/site-config';
import {askedgarPage} from '../../../lib/askedgar-api';
import {ChartEventsError,createChartEventsService} from '../../../lib/stock-chart-events-provider';
import type {OverlayKind} from '../../../lib/stock-chart-overlays';
export const dynamic='force-dynamic';
const service=createChartEventsService(async input=>{
  const url=new URL(String(input));
  const endpoint=url.pathname.endsWith('/news')?'news':'offerings-advanced';
  return Response.json(await askedgarPage(endpoint,url.searchParams,true));
});
export async function GET(request:Request){
  if(siteConfig.chart.mode!=='custom')return Response.json({error:'Custom charts are disabled.'},{status:404,headers:{'Cache-Control':'private, no-store'}});
  const p=new URL(request.url).searchParams;
  try{return Response.json(await service.get((p.get('ticker')||'').trim().toUpperCase(),p.get('kind') as OverlayKind,p.get('from')||'',p.get('to')||'',Number(p.get('page')||1),'configured-by-askedgar-page'),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return Response.json({error:error instanceof ChartEventsError?error.message:'Chart events could not be loaded.'},{status:error instanceof ChartEventsError?error.status:502,headers:{'Cache-Control':'private, no-store'}});}
}
