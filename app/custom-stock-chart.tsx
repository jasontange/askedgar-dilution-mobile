'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {AutoscaleInfo,IChartApi,ISeriesApi,MouseEventParams,Time,UTCTimestamp} from 'lightweight-charts';
import ChartEventLayer from './chart-event-layer';
import ChartDetails,{eventDetails,levelDetails,type ChartDetail} from './chart-details';
import {useChartEvents} from './use-chart-events';
import {dilutionLevels,placeChartEvents,EVENT_COLORS} from '../lib/stock-chart-overlays';
import {aggregateChartBars,chartVWAP,chartAxisPrice,CHART_INTERVALS,chartInterval,chartSession,easternParts,type ChartBar,type ChartData,type ChartInterval} from '../lib/stock-chart';

const PREF='askedgar-v2-chart-v1';
const VWAP_COLOR='#b26a0a';
const clientCache=new Map<string,ChartData>();
const price=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:n<1?6:n<10?4:2}).format(n);
const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false});
const dateTime=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
function timeLabel(time:Time,full=false):string{
  if(typeof time==='number')return (full?dateTime:clock).format(new Date(time*1000));
  return typeof time==='string'?time:`${time.year}-${String(time.month).padStart(2,'0')}-${String(time.day).padStart(2,'0')}`;
}
function preference(){
  try{
    const saved=localStorage.getItem(PREF),p=JSON.parse(saved??'{}');
    // Enable VWAP once for existing charts too; retain subsequent explicit on/off choices.
    return {interval:chartInterval(p.interval)?p.interval:'5m' as ChartInterval,extended:p.extended!==false,vwap:saved!==null?p.vwap!==false:true};
  }catch{return {interval:'5m' as ChartInterval,extended:true,vwap:true};}
}

// Optional custom chart: enable via lib/site-config.ts. See docs/charts.md.
import type {StockChartProps as ChartProps} from '../lib/chart-config';
export default function StockChartButton({ticker,dilutionRows,stockPrice}:ChartProps){
  const [open,setOpen]=useState(false);
  return <><button type="button" className="stock-chart-open" onClick={()=>setOpen(true)} aria-haspopup="dialog"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 3v17h17M7 14l4-5 4 3 5-7"/></svg>Chart</button>{open&&<StockChartDialog key={ticker} ticker={ticker} dilutionRows={dilutionRows} stockPrice={stockPrice} onClose={()=>setOpen(false)}/>}</>;
}

function StockChartDialog({ticker,dilutionRows,stockPrice,onClose}:ChartProps&{onClose:()=>void}){
  const [prefs,setPrefs]=useState(preference),{interval,extended,vwap:showVWAP}=prefs;
  const [data,setData]=useState<ChartData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [ready,setReady]=useState(false),[chartError,setChartError]=useState(''),[hover,setHover]=useState<ChartBar|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),container=useRef<HTMLDivElement>(null);
  const chart=useRef<IChartApi|null>(null),candles=useRef<ISeriesApi<'Candlestick'>|null>(null),volume=useRef<ISeriesApi<'Histogram'>|null>(null),shade=useRef<ISeriesApi<'Histogram'>|null>(null),vwapLine=useRef<ISeriesApi<'Line'>|null>(null);
  const displayBars=useRef(new Map<Time,ChartBar>()),viewKey=useRef('');
  const kind=interval==='1D'?'day':'minute';
  const bars=useMemo(()=>data&&data.kind===kind?aggregateChartBars(data.bars,interval,extended):[],[data,kind,interval,extended]);
  const selected=hover||bars.at(-1);
  const vwapPoints=useMemo(()=>showVWAP&&data&&data.kind===kind?chartVWAP(data.bars,interval,extended):[],[showVWAP,data,kind,interval,extended]);
  const vwapValues=useMemo(()=>new Map(vwapPoints.map(point=>[point.time,point])),[vwapPoints]);
  const selectedVWAP=selected?vwapValues.get(selected.time):undefined;
  const vwapDescription=interval==='1D'?"Each day's VWAP from the provider daily bar.":'Session VWAP resets each trading day; includes pre-market and after-hours when Extended hours is on.';
  useEffect(()=>{
    if(!ready||!vwapLine.current)return;
    vwapLine.current.applyOptions({visible:showVWAP});
    vwapLine.current.setData(showVWAP?vwapPoints.map(point=>({time:interval==='1D'?easternParts(point.time).date:point.time as UTCTimestamp,...(point.value===undefined?{}:{value:point.value})})):[]);
  },[ready,showVWAP,vwapPoints,interval]);
  const [showOfferings,setShowOfferings]=useState(false),[showNews,setShowNews]=useState(false),[showDilution,setShowDilution]=useState(false),[fitLevels,setFitLevels]=useState(false);
  const [details,setDetails]=useState<ChartDetail[]|null>(null);
  const offers=useChartEvents(ticker,'offerings',data?.from||'',data?.to||'',showOfferings);
  const news=useChartEvents(ticker,'news',data?.from||'',data?.to||'',showNews);
  const levels=useMemo(()=>dilutionLevels(dilutionRows,stockPrice),[dilutionRows,stockPrice]);
  const events=useMemo(()=>[...(showOfferings?offers.events:[]),...(showNews?news.events:[])],[showOfferings,showNews,offers.events,news.events]);
  const positioned=useMemo(()=>placeChartEvents(events,bars,interval),[events,bars,interval]);
  const unplaced=events.length-positioned.length;
  useEffect(()=>{setDetails(null);},[showOfferings,showNews,showDilution,interval,extended]);
  useEffect(()=>{
    const instance=chart.current,series=candles.current;if(!ready||!instance||!series)return;
    const click=(param:MouseEventParams<Time>)=>{
      if(!param.point||param.paneIndex!==0)return;
      const {x,y}=param.point,width=instance.timeScale().width(),height=instance.panes()[0]?.getHeight()||0;
      if(x<0||x>width||y<0||y>height)return;
      const tappedEvents=positioned.filter(item=>{const px=instance.timeScale().timeToCoordinate(item.time as Time);return px!==null&&Math.abs(px-x)<=12;});
      const nearLevels=showDilution?levels.filter(level=>{const py=series.priceToCoordinate(level.price);return py!==null&&Math.abs(py-y)<=12;}):[];
      const selected=[...eventDetails(tappedEvents),...levelDetails(nearLevels)];
      if(selected.length)setDetails(selected);
    };
    instance.subscribeClick(click);return()=>{if(chart.current===instance)instance.unsubscribeClick(click);};
  },[ready,positioned,showDilution,levels]);
  useEffect(()=>{
    if(!ready||!candles.current)return;
    const series=candles.current;
    const lines=showDilution?levels.map(level=>series.createPriceLine({price:level.price,color:level.color,lineWidth:2,lineStyle:2,axisLabelVisible:true,title:level.label+(level.details.length>1?' ×'+level.details.length:'')})):[];
    return()=>{if(candles.current===series)for(const line of lines)series.removePriceLine(line);};
  },[ready,showDilution,levels]);
  useEffect(()=>{
    if(!ready||!candles.current||!chart.current)return;
    const range=showDilution&&fitLevels&&levels.length?{min:Math.min(...levels.map(level=>level.price)),max:Math.max(...levels.map(level=>level.price))}:null;
    candles.current.applyOptions({autoscaleInfoProvider:(base:()=>AutoscaleInfo|null)=>{const info=base();return info?.priceRange&&range?{...info,priceRange:{minValue:Math.min(info.priceRange.minValue,range.min),maxValue:Math.max(info.priceRange.maxValue,range.max)}}:info;}});
    chart.current.priceScale('right').applyOptions({autoScale:true});
  },[ready,showDilution,fitLevels,levels]);
  useEffect(()=>{
    const element=dialog.current;if(!element)return;
    const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';element.showModal();
    return()=>{document.body.style.overflow=overflow;if(focused?.isConnected)focused.focus();};
  },[]);
  useEffect(()=>{try{localStorage.setItem(PREF,JSON.stringify(prefs));}catch{/* Preference storage is optional. */}},[prefs]);
  useEffect(()=>{
    let stopped=false,inFlight=false;const controller=new AbortController();
    const key=ticker+':'+kind,ttl=kind==='day'?300000:60000;
    setData(null);setHover(null);setError('');setLoading(true);
    async function load(){
      if(inFlight||document.hidden)return;
      const cached=clientCache.get(key);
      if(cached&&Date.now()-Date.parse(cached.fetchedAt)<ttl){setData(cached);setLoading(false);return;}
      inFlight=true;
      try{
        const response=await fetch('/api/chart?'+new URLSearchParams({ticker,kind}),{signal:controller.signal});
        const body=await response.json() as ChartData&{error?:string};
        if(!response.ok)throw new Error(body.error||'Chart data could not be loaded.');
        if(stopped)return;
        if(clientCache.size>=12)clientCache.delete(clientCache.keys().next().value!);
        clientCache.set(key,body);setData(body);setError('');
      }catch(e){if(!stopped)setError(e instanceof Error?e.message:'Chart data could not be loaded.');}
      finally{inFlight=false;if(!stopped)setLoading(false);}
    }
    void load();const timer=setInterval(()=>void load(),ttl);
    const visible=()=>{if(!document.hidden)void load();};document.addEventListener('visibilitychange',visible);
    return()=>{stopped=true;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[ticker,kind,revision]);
  useEffect(()=>{
    let stopped=false;let instance:IChartApi|undefined;
    void import('lightweight-charts').then(({createChart,CandlestickSeries,HistogramSeries,LineSeries,ColorType})=>{
      if(stopped||!container.current)return;
      instance=createChart(container.current,{
        autoSize:true,layout:{background:{type:ColorType.Solid,color:'#ffffff'},textColor:'#748095',fontFamily:'DM Sans, sans-serif',attributionLogo:true},
        grid:{vertLines:{color:'#f0f2f7'},horzLines:{color:'#f0f2f7'}},
        rightPriceScale:{borderColor:'#e1e5ef'},
        timeScale:{borderColor:'#e1e5ef',timeVisible:true,secondsVisible:false,rightOffset:5,minBarSpacing:2,tickMarkFormatter:(time:Time,type:number)=>typeof time==='number'&&type>=3?timeLabel(time):typeof time==='number'?easternParts(time).date.slice(5):timeLabel(time)},
        localization:{timeFormatter:(time:Time)=>timeLabel(time,true)},
      });
      chart.current=instance;
      shade.current=instance.addSeries(HistogramSeries,{priceScaleId:'sessions',priceLineVisible:false,lastValueVisible:false,base:0,autoscaleInfoProvider:()=>({priceRange:{minValue:0,maxValue:1}})});
      shade.current.priceScale().applyOptions({visible:false,scaleMargins:{top:0,bottom:0}});
      candles.current=instance.addSeries(CandlestickSeries,{upColor:'#16876c',downColor:'#d75766',borderVisible:false,wickUpColor:'#16876c',wickDownColor:'#d75766',priceFormat:{type:'custom',formatter:chartAxisPrice,minMove:.0001}});
      vwapLine.current=instance.addSeries(LineSeries,{color:VWAP_COLOR,lineWidth:3,priceScaleId:'right',priceLineVisible:false,lastValueVisible:false,visible:false,priceFormat:{type:'custom',formatter:chartAxisPrice,minMove:.0001}});
      volume.current=instance.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceLineVisible:false,lastValueVisible:false},1);
      instance.panes()[0].setStretchFactor(4);instance.panes()[1].setStretchFactor(1);
      instance.subscribeCrosshairMove(param=>setHover(param.time?displayBars.current.get(param.time)||null:null));
      setReady(true);
    }).catch(()=>{if(!stopped)setChartError('The chart could not initialize. Close and reopen it to try again.');});
    return()=>{stopped=true;instance?.remove();chart.current=null;candles.current=null;volume.current=null;shade.current=null;vwapLine.current=null;};
  },[]);
  useEffect(()=>{
    if(!ready||!candles.current||!volume.current||!shade.current||!chart.current)return;
    const mapped=bars.map(bar=>({...bar,time:interval==='1D'?easternParts(bar.time).date:bar.time as UTCTimestamp}));
    displayBars.current=new Map(mapped.map((bar,i)=>[bar.time,bars[i]]));setHover(null);
    candles.current.setData(mapped);
    volume.current.setData(mapped.map(bar=>({time:bar.time,value:bar.volume,color:bar.close>=bar.open?'#16876c66':'#d7576666'})));
    shade.current.setData(mapped.map((bar,i)=>({time:bar.time,value:1,color:interval==='1D'||!extended?'transparent':chartSession(bars[i].time)==='Pre-market'?'#e6efff':chartSession(bars[i].time)==='After-hours'?'#f3ecfa':'transparent'})));
    const minPrice=bars.length?Math.min(...bars.map(b=>b.low)):1,precision=minPrice<.0001?8:minPrice<.01?6:minPrice<1?4:2;
    const priceFormat={type:'custom' as const,formatter:chartAxisPrice,minMove:10**-precision};
    candles.current.applyOptions({priceFormat});vwapLine.current?.applyOptions({priceFormat});
    chart.current.timeScale().applyOptions({timeVisible:interval!=='1D'});
    const nextKey=ticker+':'+interval+':'+extended;
    if(bars.length&&viewKey.current!==nextKey){chart.current.timeScale().setVisibleLogicalRange({from:Math.max(0,bars.length-140),to:bars.length+4});viewKey.current=nextKey;}
  },[bars,ready,interval,extended,ticker]);
  function retry(){clientCache.delete(ticker+':'+kind);setRevision(v=>v+1);}
  return <><dialog ref={dialog} className="stock-chart-dialog" aria-labelledby="stock-chart-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}>
    <div className="stock-chart-shell">
      <div className="stock-chart-heading"><div><h2 id="stock-chart-title">{ticker} <span>Price chart</span></h2><p>{data?.source||'Market data'}{data?.adjusted?' · Split-adjusted':''}{data?.delayed?' · Delayed data':''}</p></div><button type="button" className="stock-chart-close" aria-label="Close chart" onClick={onClose} autoFocus>×</button></div>
      <div className="stock-chart-controls"><div className="stock-chart-intervals" role="group" aria-label="Candle interval">{CHART_INTERVALS.map(value=><button type="button" key={value} aria-pressed={interval===value} onClick={()=>setPrefs(p=>({...p,interval:value}))}>{value==='1D'?'Daily':value}</button>)}</div><div className="stock-chart-actions"><label title={kind==='day'?'Extended hours are available on intraday charts':'Include premarket and after-hours'}><input type="checkbox" checked={extended} disabled={kind==='day'} onChange={e=>setPrefs(p=>({...p,extended:e.target.checked}))}/>Extended hours</label><button type="button" onClick={()=>chart.current?.timeScale().fitContent()} disabled={!bars.length}>Fit</button><button type="button" onClick={retry} disabled={loading}>Refresh</button></div></div>
      <div className="chart-overlay-controls" role="group" aria-label="Chart overlays">
        <button type="button" className="chart-vwap-toggle" aria-pressed={showVWAP} title={vwapDescription} onClick={()=>setPrefs(p=>({...p,vwap:!p.vwap}))}>VWAP {showVWAP?'On':'Off'}</button>
        <button type="button" aria-pressed={showOfferings} onClick={()=>setShowOfferings(v=>!v)}>Show offerings{showOfferings&&offers.loaded?' ('+offers.events.length+')':''}</button>
        <button type="button" aria-pressed={showNews} onClick={()=>setShowNews(v=>!v)}>Show news{showNews&&news.loaded?' ('+news.events.length+')':''}</button>
        <button type="button" aria-pressed={showDilution} onClick={()=>setShowDilution(v=>!v)}>Show dilution{showDilution?' ('+levels.length+')':''}</button>
        {showDilution&&levels.length>0&&<button type="button" className="chart-overlay-secondary" aria-pressed={fitLevels} onClick={()=>setFitLevels(v=>!v)}>{fitLevels?'Fit candles':'Fit dilution levels'}</button>}
        {(showOfferings||showNews)&&<button type="button" className="chart-overlay-secondary" aria-haspopup="dialog" onClick={()=>setDetails(eventDetails(events.map(event=>positioned.find(item=>item.event.id===event.id)||{event,time:event.day,note:'No candle available in the displayed session/history; source date is unchanged.'})))}>Event list</button>}
      <button type="button" className="chart-overlay-secondary chart-mobile-levels" aria-haspopup="dialog" hidden={!showDilution||!levels.length} onClick={()=>setDetails(levelDetails(levels))}>Level details</button>
      </div>
      {(showOfferings||showNews||showDilution)&&<div className={"chart-overlay-status"+((showOfferings&&(offers.loading||offers.hasMore||offers.error)||showNews&&(news.loading||news.hasMore||news.error))?" has-feedback":"")}>
        {showOfferings&&<span>{offers.loading?<span className="chart-overlay-feedback">Loading offerings…</span>:offers.loaded?<span className="chart-overlay-record-count">{offers.events.length} offering records loaded</span>:null}{offers.hasMore&&<button type="button" disabled={offers.loading} onClick={offers.loadMore}>Load more offerings</button>}{offers.error&&<><span role="alert">{offers.error}</span><button type="button" disabled={offers.loading} onClick={offers.retry}>Retry offerings</button></>}</span>}
        {showNews&&<span>{news.loading?<span className="chart-overlay-feedback">Loading news & filings…</span>:news.loaded?<span className="chart-overlay-record-count">{news.events.length} news/filing records loaded</span>:null}{news.hasMore&&<button type="button" disabled={news.loading} onClick={news.loadMore}>Load more news</button>}{news.error&&<><span role="alert">{news.error}</span><button type="button" disabled={news.loading} onClick={news.retry}>Retry news</button></>}</span>}
        {showNews&&<span className="chart-tag-legend"><i style={{background:EVENT_COLORS.red}}/>Negative <i style={{background:EVENT_COLORS.yellow}}/>Neutral / unclear <i style={{background:EVENT_COLORS.green}}/>Positive · Tag-based; negative tags take priority.</span>}
        {showDilution&&<details className="chart-level-details"><summary>{levels.length?`${levels.length} dilution levels · Same instruments and colors as the dilution panels`:'No numeric dilution levels in the current instrument filter'}</summary>{levels.map((level,i)=><div key={i} style={{color:level.color}}><button type="button" aria-haspopup="dialog" style={{color:level.color}} onClick={()=>setDetails(levelDetails([level]))}>{level.label} ${price(level.price)}</button><span>{level.details.join('; ')}</span></div>)}<p>Floor replaces conversion when lower. Use Fit dilution levels to include prices outside the current scale.</p></details>}
        {(showOfferings||showNews)&&<span className="chart-event-help">Tap O for offering terms; N = news, F = filing. {unplaced>0?`${unplaced} loaded event(s) have no matching visible-session candle; see Event list. `:''}{(offers.skipped+news.skipped)>0?`${offers.skipped+news.skipped} record(s) omitted because their dates are unavailable. `:''}{showOfferings?'Offering labels use reported share price and amount; dates are filing dates. Historical terms may differ from split-adjusted candles.':''}</span>}
      </div>}
      <div className="stock-chart-legend" aria-live="off">{selected?<><strong>${price(selected.close)}</strong><span>O {price(selected.open)}</span><span>H {price(selected.high)}</span><span>L {price(selected.low)}</span><span>C {price(selected.close)}</span><span>Vol {new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(selected.volume)}</span>{showVWAP&&<span className="chart-vwap-value" style={{color:VWAP_COLOR}} title={vwapDescription+(selectedVWAP?.estimated?' Estimated with (high + low + close) / 3 for bars without provider VWAP.':'')}>{interval==='1D'?'Daily VWAP':'VWAP'} {selectedVWAP?.estimated?'≈ ':''}{selectedVWAP?.value===undefined?'—':price(selectedVWAP.value)}</span>}<small>{interval==='1D'?easternParts(selected.time).date:dateTime.format(new Date(selected.time*1000))+' ET · '+chartSession(selected.time)}</small></>:<span>{loading?'Loading candles…':'No candle selected'}</span>}</div>
      <div className="stock-chart-stage"><div ref={container} className="stock-chart-canvas" aria-label={`${ticker} candlestick and volume chart`} role="img"/>{ready&&chart.current&&bars.length>0&&<ChartEventLayer chart={chart.current} events={positioned} onSelect={items=>setDetails(eventDetails(items))}/>}{(loading||chartError||(!bars.length))&&<div className="stock-chart-state" role="status">{chartError|| (loading?<><span className="spinner"/>Loading {ticker} chart…</>:error?<><p>{error}</p><button type="button" onClick={retry}>Try again</button></>:<><strong>No bars in this view</strong><p>Try extended hours or another interval. Some tickers have sparse trading data.</p></>)}</div>}</div>
      {error&&bars.length>0&&<div className="stock-chart-warning" role="alert">{error} Showing the last loaded chart.</div>}
      <div className="stock-chart-footer"><div>{kind==='minute'?<><span className="session-key pre"/>Pre-market <span className="session-key post"/>After-hours <span>· Times in New York (ET)</span></>:<span>Daily bars · Provider daily session</span>}<p>{kind==='minute'?'14 days of history · Regular filter: 9:30 am–4 pm ET; extended: 4 am–8 pm ET.':'2 years of daily history.'} Drag to pan; scroll or pinch to zoom.</p></div><div className="stock-chart-credit">{data&&<span>Retrieved {clock.format(new Date(data.fetchedAt))} ET</span>}<span>Refreshes {kind==='day'?'every 5 minutes':'every minute'} while open · Feed delay depends on plan</span><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Charts by TradingView</a></div></div>
    </div>
  </dialog>{details&&<ChartDetails ticker={ticker} stockPrice={stockPrice} entries={details} onClose={()=>setDetails(null)} emptyMessage={"No events loaded for this chart history."+(offers.hasMore||news.hasMore?" Use Load more to check older records.":"")}/>}</>;
}
