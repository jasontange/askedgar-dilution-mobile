export function finiteNumber(value:unknown):number|null {
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!value.trim())return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}
export function priceSignal(priceValue:unknown,stockPriceValue:unknown,remainingValue:unknown,protectionValue:unknown){
  const price=finiteNumber(priceValue),stockPrice=finiteNumber(stockPriceValue),remaining=finiteNumber(remainingValue);
  if(remaining===0)return {className:'price-neutral',description:'No shares remaining; price color is disabled.'};
  if(price===null||price<0||stockPrice===null||stockPrice<=0)return {className:'price-neutral',description:'Price comparison unavailable.'};
  const ratio=price/stockPrice;
  const tolerance=Number.EPSILON*Math.max(1,Math.abs(ratio))*4;
  if(ratio<=1+tolerance)return {className:'price-green',description:'At or below the screener stock price (1× or less).'};
  if(/variable\s+rate/i.test(String(protectionValue??'')))return {className:'price-yellow',description:'Variable Rate price protection; above the screener stock price.'};
  if(ratio>=4-tolerance)return {className:'price-red',description:'At least 4× the screener stock price.'};
  return {className:'price-yellow',description:'Above 1× and below 4× the screener stock price.'};
}
