export type StockChartProps={ticker:string;exchange?:string;dilutionRows:Record<string,unknown>[];stockPrice:number|null};

// Only map known US exchange labels; do not guess NASDAQ for every ticker.
export function tradingViewSymbol(ticker:string,exchange?:string){
  const symbol=ticker.trim().toUpperCase();
  const name=exchange?.trim().toUpperCase()||'';
  const prefix=name.startsWith('NASDAQ')?'NASDAQ':
    ['AMEX','NYSE AMERICAN','NYSEAMERICAN','NYSE MKT'].includes(name)?'AMEX':
    ['NYSE ARCA','NYSEARCA','ARCA'].includes(name)?'AMEX':
    ['NYSE','NEW YORK STOCK EXCHANGE'].includes(name)?'NYSE':
    ['OTC','OTCQB','OTCQX','OTC PINK','PINK'].includes(name)?'OTC':null;
  return prefix?`${prefix}:${symbol}`:symbol;
}

export function embeddedChartOptions(symbol:string){
  return {
    // Extended sessions are visible only on intraday intervals. This property
    // is accepted by TradingView's embed-widget-advanced-chart.js loader.
    autosize:true,symbol,interval:'5',extended_hours:true,timezone:'America/New_York',theme:'light',style:'1',locale:'en',
    allow_symbol_change:false,calendar:false,details:false,hotlist:false,
    hide_side_toolbar:true,hide_top_toolbar:false,hide_legend:false,hide_volume:false,
    save_image:true,withdateranges:true,backgroundColor:'#ffffff',
    gridColor:'rgba(46, 46, 46, 0.06)',watchlist:[],compareSymbols:[],studies:[],
  };
}
