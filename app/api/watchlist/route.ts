import {env} from 'cloudflare:workers';
import {getChatGPTUser,chatGPTSignInPath,chatGPTSignOutPath} from '../../chatgpt-auth';
import {changeWatchlist,parseMutation,readWatchlist,WatchlistError} from '../../../lib/account-watchlist';
export const dynamic='force-dynamic';
const returnTo='/?view=watchlist';
function reply(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});}
const signInUrl=chatGPTSignInPath(returnTo),signOutUrl=chatGPTSignOutPath(returnTo);
function browserOnly(){return (env as unknown as Record<string,string>).WATCHLIST_MODE==='browser';}
function deviceReply(){return reply({code:'device_only',signInUrl:''},401);}
async function identity(){const user=await getChatGPTUser();return user;}
export async function GET(){
  if(browserOnly())return deviceReply();
  const user=await identity();if(!user)return reply({error:'Sign in to use an account watchlist.',code:'unauthenticated',signInUrl},401);
  try{if(!env.DB)throw new Error('Database unavailable');return reply({accountId:user.userId,displayName:user.displayName,...await readWatchlist(env.DB,user.userId),signOutUrl});}catch{return reply({error:'Your account watchlist is temporarily unavailable. Your saved list has not been changed.',code:'unavailable',signOutUrl},503);}
}
export async function POST(request:Request){
  if(browserOnly())return deviceReply();
  const user=await identity();if(!user)return reply({error:'Your session ended. Sign in again to update your account watchlist.',code:'unauthenticated',signInUrl},401);
  // Mutations require an exact same-origin browser request and JSON content type.
  if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return reply({error:'This request must come from this site.',code:'origin'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'Expected a JSON request.',code:'invalid'},415);
  const length=Number(request.headers.get('Content-Length')||0);if(length>8192)return reply({error:'Request is too large.',code:'invalid'},413);
  try{const text=await request.text();if(text.length>8192)return reply({error:'Request is too large.',code:'invalid'},413);let body:unknown;try{body=JSON.parse(text);}catch{return reply({error:'Invalid JSON request.',code:'invalid'},400);}const mutation=parseMutation(body);if(!env.DB)throw new Error('Database unavailable');const list=await changeWatchlist(env.DB,user.userId,mutation);return reply({accountId:user.userId,displayName:user.displayName,...list,signOutUrl});}catch(error){if(error instanceof WatchlistError)return reply({error:error.message,code:error.code},error.status);return reply({error:'Could not confirm the save. Reload your account watchlist before trying again.',code:'unavailable'},503);}
}
