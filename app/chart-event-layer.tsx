'use client';
import {useEffect,useRef,useState,type ButtonHTMLAttributes} from 'react';
import type {Coordinate,IChartApi,Time} from 'lightweight-charts';
import {EVENT_COLORS,type PositionedEvent} from '../lib/stock-chart-overlays';
type Group={x:number;items:PositionedEvent[]};
function EventButton({onActivate,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{onActivate:()=>void}){
  const gesture=useRef<{id:number;x:number;y:number}|null>(null),lastPointer=useRef(0);
  return <button {...props} type="button" aria-haspopup="dialog"
    onPointerDown={e=>{if(!e.isPrimary||e.button!==0)return;e.stopPropagation();gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerCancel={()=>{gesture.current=null;lastPointer.current=Date.now();}}
    onPointerUp={e=>{
      const start=gesture.current;if(!start||start.id!==e.pointerId)return;
      e.stopPropagation();e.preventDefault();gesture.current=null;lastPointer.current=Date.now();
      if(Math.hypot(e.clientX-start.x,e.clientY-start.y)<=10)onActivate();
    }}
    onClick={e=>{e.stopPropagation();if(e.detail===0||Date.now()-lastPointer.current>500)onActivate();}}
  />;
}
export function offeringLabel(item:PositionedEvent){
  const event=item.event,price=event.sharePrice===null?'Price —':'$'+event.sharePrice.toLocaleString('en-US',{maximumFractionDigits:8}),amount=event.amount===null?'Amount —':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(event.amount);
  return price+' · '+amount;
}
export default function ChartEventLayer({chart,events,onSelect}:{chart:IChartApi;events:PositionedEvent[];onSelect:(items:PositionedEvent[])=>void}){
  const [layout,setLayout]=useState<{groups:Group[];height:number;width:number}>({groups:[],height:0,width:0});
  useEffect(()=>{
    let frame=0,stopped=false;
    const update=()=>{
      if(stopped)return;cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        if(stopped)return;
        const width=chart.timeScale().width(),height=chart.panes()[0]?.getHeight()||0;
        const points=events.map(item=>({item,x:chart.timeScale().timeToCoordinate(item.time as Time)})).filter((v):v is {item:PositionedEvent;x:Coordinate}=>v.x!==null&&v.x>=0&&v.x<=width).sort((a,b)=>a.x-b.x);
        const groups:Group[]=[],spacing=window.matchMedia('(max-width:650px)').matches?48:32;
        for(const point of points){const previous=groups.at(-1);if(previous&&point.x-previous.x<spacing)previous.items.push(point.item);else groups.push({x:point.x,items:[point.item]});}
        setLayout({groups,height,width});
      });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(update);chart.timeScale().subscribeSizeChange(update);
    const pane=chart.panes()[0]?.getHTMLElement();const observer=new ResizeObserver(update);if(pane)observer.observe(pane);
    update();return()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();try{chart.timeScale().unsubscribeVisibleLogicalRangeChange(update);chart.timeScale().unsubscribeSizeChange(update);}catch{/* Chart can unmount first. */}};
  },[chart,events]);
  return <div className="chart-event-layer" style={{width:layout.width,height:layout.height}}>{layout.groups.map((group,index)=>{
    const offerings=group.items.filter(item=>item.event.kind==='offerings'),news=group.items.filter(item=>item.event.kind==='news');
    const tone=news.some(item=>item.event.tone==='red')?'red':news.some(item=>item.event.tone==='yellow')?'yellow':'green';
    const isNews=news.some(item=>item.event.formType==='News'),isFiling=news.some(item=>item.event.formType!=='News');
    const next=layout.groups[index+1],space=(next?.x??layout.width)-group.x,leftSpace=group.x-(layout.groups[index-1]?.x??0),labelLeft=space<125&&leftSpace>125;
    return <div key={group.items[0].event.id} className="chart-event-column" style={{left:group.x}}>
      {group.items.map(item=><div key={item.event.id} className={item.event.kind==='offerings'?'chart-offering-line':'chart-news-line'} style={{left:`calc(50% + ${(chart.timeScale().timeToCoordinate(item.time as Time)??group.x)-group.x}px)`,height:layout.height,...(item.event.kind==='news'?{borderColor:EVENT_COLORS[item.event.tone]}:{})}}/>)}
      {offerings.length>0&&<EventButton className="chart-event-offering" onActivate={()=>onSelect(offerings)} aria-label={`${offerings.length} offering${offerings.length===1?'':'s'}: ${offerings.map(item=>offeringLabel(item)).join('; ')}`} title={offerings.map(item=>`${item.event.day} · ${offeringLabel(item)} · ${item.event.headline}`).join('\n')}>O{offerings.length>1&&<sup>{offerings.length}</sup>}{offerings.length===1&&(space>125||labelLeft)&&<span className={labelLeft?'label-left':undefined}>{offeringLabel(offerings[0])}</span>}</EventButton>}
      {news.length>0&&<EventButton className={'chart-event-news'+(!offerings.length?' chart-event-news-only':'')} style={{background:EVENT_COLORS[tone]}} onActivate={()=>onSelect(news)} aria-label={`${news.length} news or filing event${news.length===1?'':'s'}; ${tone} tag signal`} title={news.map(item=>item.event.headline+' — '+item.event.toneReason).join('\n')}>{isNews&&isFiling?'N/F':isNews?'N':'F'}{news.length>1&&<sup>{news.length}</sup>}</EventButton>}
    </div>;
  })}</div>;
}
