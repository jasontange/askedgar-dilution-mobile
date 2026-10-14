'use client';
import {lazy,Suspense} from 'react';
import {siteConfig} from '../lib/site-config';
import type {StockChartProps} from '../lib/chart-config';
import EmbeddedStockChart from './embedded-stock-chart';

// Preserved as executable code, loaded only when custom mode is explicitly enabled.
// Ask an agent: "Enable the custom TradingView chart following docs/charts.md."
const CustomStockChart=lazy(()=>import('./custom-stock-chart'));
export default function StockChartButton(props:StockChartProps){
  if(siteConfig.chart.mode==='custom')return <Suspense fallback={<span role="status">Loading chart…</span>}><CustomStockChart {...props}/></Suspense>;
  return <EmbeddedStockChart {...props}/>;
}
