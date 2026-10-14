import { env } from 'cloudflare:workers';
import {providerMessage} from '../../../lib/provider-message';
import {askedgarPage} from '../../../lib/askedgar-api';
export const dynamic = 'force-dynamic';
const endpoints = {offerings:'offerings-advanced',ownership:'ownership',actions:'split-status',splits:'reverse-splits'} as const;
export async function GET(request:Request) {
  const params = new URL(request.url).searchParams;
  const ticker = (params.get('ticker') || '').trim().toUpperCase();
  const kind = params.get('kind');
  const page = Number(params.get('page') || 1);
  const reply = (data:unknown, status=200) => Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
  if(!/^[A-Z][A-Z0-9.\-]{0,19}$/.test(ticker)) return reply({error:'Enter a valid ticker symbol.'},400);
  if(kind!=='offerings'&&kind!=='ownership'&&kind!=='actions'&&kind!=='splits') return reply({error:'Choose offerings, ownership, or corporate actions.'},400);
  if(!Number.isSafeInteger(page)||page<1||page>1000) return reply({error:'Invalid page number.'},400);
  const key = (env as unknown as Record<string,string>).ASKEDGAR_API_KEY;
  if(!key) return reply({error:'The data connection is not configured.'},503);
  try {
    const body=await askedgarPage(endpoints[kind],new URLSearchParams({ticker,page:String(page),limit:kind==='ownership'?'5':'10'}));
    const data={ticker,kind,rows:body.results,hasMore:body.has_more===true,page,message:providerMessage(body.message),fetchedAt:body.fetchedAt};
    return reply(data);
  } catch(error) {return reply({error:(error as Error).message},502);}
}
