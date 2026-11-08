export type DilutionChange = {date:string;text:string};
type Row = Record<string,unknown>;

/** The provider uses **YYYY-MM-DD as a delimiter, not paired Markdown. */
export function parseDilutionDetails(value:unknown):{terms:string;changes:DilutionChange[]} {
  const text=typeof value==='string'?value.trim():'';
  const markers=[...text.matchAll(/\*\*\s*(\d{4}-\d{2}-\d{2})(?!\d)(?:\*\*)?/g)].filter(match=>{
    const date=new Date(match[1]+'T12:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===match[1];
  });
  if(!markers.length)return {terms:text,changes:[]};
  const changes=markers.map((match,index)=>({date:match[1],text:text.slice(match.index!+match[0].length,markers[index+1]?.index??text.length).trim().replace(/^(?:[-–—:]\s+)+/,'')})).filter(change=>change.text);
  return {terms:text.slice(0,markers[0].index).trim(),changes:changes.sort((a,b)=>b.date.localeCompare(a.date))};
}

export function dilutionChanges(rows:Row[]) {
  return rows.flatMap((row,index)=>{
    const kind='warrants_amount' in row||'warrants_remaining' in row||'warrants_exercise_price' in row?'Warrant':'conversion_price' in row||'convertible_debt_remaining' in row||'underlying_shares_remaining' in row?'Convertible':null;
    if(!kind)return [];
    const name=typeof row.details==='string'&&row.details.trim()?row.details:'Unnamed '+kind.toLowerCase();
    return parseDilutionDetails(row.pp_clause).changes.map((change,changeIndex)=>({...change,name,kind,key:`${index}-${changeIndex}`}));
  }).sort((a,b)=>b.date.localeCompare(a.date));
}

export function changeDate(date:string) {
  return new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
}
