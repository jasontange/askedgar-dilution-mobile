'use client';
import {useEffect,useRef,useState} from 'react';
import {embeddedChartOptions,tradingViewSymbol,type StockChartProps} from '../lib/chart-config';

export default function EmbeddedStockChart({ticker,exchange}:StockChartProps){
  const [open,setOpen]=useState(false);
  return <><button type="button" className="stock-chart-open" onClick={()=>setOpen(true)} aria-haspopup="dialog"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 3v17h17M7 14l4-5 4 3 5-7"/></svg>Chart</button>{open&&<EmbeddedChartDialog key={ticker+':'+exchange} ticker={ticker} exchange={exchange} onClose={()=>setOpen(false)}/>}</>;
}

function EmbeddedChartDialog({ticker,exchange,onClose}:{ticker:string;exchange?:string;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),container=useRef<HTMLDivElement>(null);
  const [failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
  const symbol=tradingViewSymbol(ticker,exchange);
  const externalUrl='https://www.tradingview.com/chart/?symbol='+encodeURIComponent(symbol);
  useEffect(()=>{
    const element=dialog.current;if(!element)return;
    const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';element.showModal();
    return()=>{document.body.style.overflow=overflow;if(focused?.isConnected)focused.focus();};
  },[]);
  useEffect(()=>{
    const host=container.current;if(!host)return;
    setFailed(false);
    // Give the vendor its own DOM subtree; React owns only the surrounding dialog.
    // A fresh subtree on retry/symbol change also isolates late script callbacks.
    const wrapper=document.createElement('div');wrapper.className='tradingview-widget-container';
    const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';wrapper.appendChild(widget);
    const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type='text/javascript';script.async=true;script.textContent=JSON.stringify(embeddedChartOptions(symbol));
    let stopped=false;
    script.onerror=()=>{if(!stopped)setFailed(true);};
    // The cross-origin widget owns data/unavailable-symbol messages. We only
    // detect a blocked loader and offer an external link without API fallback.
    const observer=new MutationObserver(()=>{
      const frame=wrapper.querySelector('iframe');if(frame){if(!stopped)setFailed(false);frame.title=ticker+' price chart by TradingView';clearTimeout(timeout);observer.disconnect();}
    });
    const timeout=setTimeout(()=>{if(!stopped&&!wrapper.querySelector('iframe'))setFailed(true);},15000);
    observer.observe(wrapper,{childList:true,subtree:true});
    host.appendChild(wrapper);wrapper.appendChild(script);
    return()=>{stopped=true;clearTimeout(timeout);observer.disconnect();script.onerror=null;wrapper.remove();};
  },[symbol,ticker,revision]);
  return <dialog ref={dialog} className="stock-chart-dialog embedded-chart-dialog" aria-labelledby="embedded-chart-title" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose();}}}>
    <div className="stock-chart-shell">
      <div className="stock-chart-heading"><div><h2 id="embedded-chart-title">{ticker} <span>Price chart</span></h2><p>TradingView · Data availability and delay vary by symbol</p></div><button type="button" className="stock-chart-close" aria-label="Close chart" onClick={onClose} autoFocus>×</button></div>
      <div className="embedded-chart-stage"><div ref={container} className="embedded-chart-host"/>{failed&&<div className="stock-chart-state" role="status"><p>The embedded chart couldn’t load.</p><button type="button" onClick={()=>setRevision(value=>value+1)}>Try again</button><a href={externalUrl} target="_blank" rel="noopener noreferrer">Open on TradingView ↗</a></div>}</div>
      <div className="embedded-chart-footer tradingview-widget-copyright"><a href={externalUrl} target="_blank" rel="noopener nofollow noreferrer">{ticker} chart by TradingView ↗</a></div>
    </div>
  </dialog>;
}
