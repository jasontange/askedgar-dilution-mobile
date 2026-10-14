import {siteConfig} from '../../../lib/site-config';
import {env} from 'cloudflare:workers';
import {createStockChartService,StockChartError} from '../../../lib/stock-chart-provider';
export const dynamic='force-dynamic';
const service=createStockChartService();
export async function GET(request:Request){
  if(siteConfig.chart.mode!=='custom')return Response.json({error:'Custom charts are disabled.'},{status:404,headers:{'Cache-Control':'private, no-store'}});
  const query=new URL(request.url).searchParams,kind=query.get('kind')||'minute';
  if(kind!=='minute'&&kind!=='day')return Response.json({error:'Invalid chart interval.'},{status:400});
  try{
    const keys=env as unknown as Record<string,string>;
    return Response.json(await service.get(query.get('ticker')||'',kind,keys.MASSIVE_API_KEY),{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return Response.json({error:error instanceof StockChartError?error.message:'Chart data could not be loaded.'},{status:error instanceof StockChartError?error.status:502,headers:{'Cache-Control':'private, no-store'}});}
}
