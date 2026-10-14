export const CHART_INTERVALS = ['1m', '5m', '15m', '1h', '1D'] as const;
export type ChartInterval = typeof CHART_INTERVALS[number];
export type ChartBar = {time:number;open:number;high:number;low:number;close:number;volume:number;vwap?:number};
export type ChartData = {source?:string;adjusted?:boolean;ticker:string;bars:ChartBar[];kind:'minute'|'day';fetchedAt:string;delayed:boolean;from:string;to:string};
export const chartInterval = (value:unknown):value is ChartInterval => CHART_INTERVALS.includes(value as ChartInterval);
const eastern = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function easternParts(time:number){
  const parts=Object.fromEntries(eastern.formatToParts(new Date(time*1000)).map(p=>[p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,minute:Number(parts.hour)*60+Number(parts.minute)};
}
export function chartSession(time:number){const minute=easternParts(time).minute;return minute<570?'Pre-market':minute>=960?'After-hours':'Regular';}
export function normalizeChartBars(input:unknown):ChartBar[]{
  if(!Array.isArray(input))return [];
  const bars=new Map<number,ChartBar>();
  for(const row of input){
    if(!row||typeof row!=='object')continue;
    const {t,o,h,l,c,v,vw}=row;
    if(![t,o,h,l,c,v].every(n=>typeof n==='number'&&Number.isFinite(n))||t<=0||Math.min(o,h,l,c)<0||v<0||h<Math.max(o,c,l)||l>Math.min(o,c,h))continue;
    const time=Math.floor(t/1000);bars.set(time,{time,open:o,high:h,low:l,close:c,volume:v,...(typeof vw==='number'&&Number.isFinite(vw)&&vw>=0?{vwap:vw}:{})});
  }
  return [...bars.values()].sort((a,b)=>a.time-b.time);
}
function intradayBucket(time:number,interval:Exclude<ChartInterval,'1D'>,extended:boolean){
  const {date,minute}=easternParts(time);
  if(minute<240||minute>=1200||(!extended&&(minute<570||minute>=960)))return null;
  const size=interval==='1h'?60:Number(interval.slice(0,-1));
  const anchor=minute<570?240:minute<960?570:960;
  const bucket=anchor+Math.floor((minute-anchor)/size)*size;
  return {day:date,time:time-(minute-bucket)*60};
}
// Aggregate only after session filtering, keeping pre/post-market out of regular candles.
// Hourly candles anchor at 09:30 in regular mode; session boundaries never mix.
export function aggregateChartBars(bars:ChartBar[],interval:ChartInterval,extended:boolean):ChartBar[]{
  if(interval==='1D')return bars;
  const grouped=new Map<number,ChartBar>();
  for(const bar of bars){
    const bucket=intradayBucket(bar.time,interval,extended);if(!bucket)continue;
    const found=grouped.get(bucket.time);
    if(found){
      if(found.volume===0){if(bar.vwap!==undefined)found.vwap=bar.vwap;else delete found.vwap;}
      else if(bar.volume>0){if(found.vwap!==undefined&&bar.vwap!==undefined)found.vwap=(found.vwap*found.volume+bar.vwap*bar.volume)/(found.volume+bar.volume);else delete found.vwap;}
      found.high=Math.max(found.high,bar.high);found.low=Math.min(found.low,bar.low);found.close=bar.close;found.volume+=bar.volume;
    }
    else grouped.set(bucket.time,{...bar,time:bucket.time});
  }
  return [...grouped.values()].sort((a,b)=>a.time-b.time);
}

export type ChartVWAPPoint={time:number;value?:number;estimated:boolean};
// Compute from the minute feed before resampling. Each displayed candle gets
// the session VWAP at its last available minute, rather than its own bar VWAP.
export function chartVWAP(bars:ChartBar[],interval:ChartInterval,extended:boolean):ChartVWAPPoint[]{
  const price=(bar:ChartBar)=>bar.vwap??(bar.high+bar.low+bar.close)/3;
  if(interval==='1D')return bars.map(bar=>({time:bar.time,...(bar.volume>0?{value:price(bar)}:{}),estimated:bar.volume>0&&bar.vwap===undefined}));
  const points=new Map<number,ChartVWAPPoint>();
  let day='',notional=0,volume=0,estimated=false;
  for(const bar of bars){
    const bucket=intradayBucket(bar.time,interval,extended);if(!bucket)continue;
    if(bucket.day!==day){day=bucket.day;notional=0;volume=0;estimated=false;}
    if(bar.volume>0){notional+=price(bar)*bar.volume;volume+=bar.volume;estimated||=bar.vwap===undefined;}
    points.set(bucket.time,{time:bucket.time,...(volume>0?{value:notional/volume}:{}),estimated});
  }
  return [...points.values()];
}

const axisPrices=[2,4,6,8].map(maximumFractionDigits=>new Intl.NumberFormat('en-US',{maximumFractionDigits}));
export function chartAxisPrice(value:number):string{
  if(!Number.isFinite(value))return '—';
  if(value!==0&&Math.abs(value)<1e-8)return value.toExponential(2).replace(/\.?(0+)(?=e)/,'');
  // The chart sizes its axis using synthetic crosshair prices ending in .111111… .
  // Trimming zeros alone still reserves space for eight digits on ordinary stocks.
  const magnitude=Math.abs(value),formatter=axisPrices[magnitude>=1?0:magnitude>=.01?1:magnitude>=.0001?2:3];
  return formatter.format(Object.is(value,-0)?0:value);
}
