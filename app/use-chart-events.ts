'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ChartEvent,EventPage,OverlayKind} from '../lib/stock-chart-overlays';
type State={key:string;events:ChartEvent[];nextPage:number;hasMore:boolean;skipped:number;expires:number};
const cache=new Map<string,State>();
const EMPTY_EVENTS:ChartEvent[]=[];
export function useChartEvents(ticker:string,kind:OverlayKind,from:string,to:string,enabled:boolean){
  const key=JSON.stringify([ticker,kind,from,to]);
  const [state,setState]=useState<State|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null);
  const load=useCallback(async(page:number)=>{
    if(!from||!to)return;
    active.current?.abort();const controller=new AbortController();active.current=controller;
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/chart-events?'+new URLSearchParams({ticker,kind,from,to,page:String(page)}),{signal:controller.signal});
      const data=await response.json() as EventPage&{error?:string};
      if(!response.ok)throw new Error(data.error||'Chart events could not be loaded.');
      if(controller.signal.aborted)return;
      const previous=page===1?undefined:cache.get(key),events=[...(previous?.events||[]),...data.events];
      const next:State={key,events:[...new Map(events.map(event=>[event.id,event])).values()],nextPage:data.nextPage,hasMore:data.hasMore,skipped:(previous?.skipped||0)+data.skipped,expires:Date.now()+300000};
      if(cache.size>=24&&!cache.has(key))cache.delete(cache.keys().next().value!);
      cache.set(key,next);setState(next);
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Chart events could not be loaded.');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  },[ticker,kind,from,to,key]);
  useEffect(()=>{
    active.current?.abort();setError('');setLoading(false);
    if(!enabled||!from||!to)return;
    const previous=cache.get(key);
    if(previous&&previous.expires>Date.now())setState(previous);
    else{setState(null);void load(1);}
    return()=>active.current?.abort();
  },[enabled,key,from,to,load]);
  const current=state?.key===key?state:null;
  return {events:current?.events||EMPTY_EVENTS,loading,error,loaded:!!current,hasMore:current?.hasMore||false,skipped:current?.skipped||0,loadMore:()=>void load(current?.nextPage||1),retry:()=>void load(current?.nextPage||1)};
}
