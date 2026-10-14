export function validSavedLabels(value:unknown,options:readonly string[]):string[]{
  if(!Array.isArray(value))return [];
  const selected=new Set(value.filter((item):item is string=>typeof item==='string').map(item=>item.toLowerCase()));
  return options.filter(option=>selected.has(option.toLowerCase()));
}
export function readSavedLabels(storage:Pick<Storage,'getItem'>,key:string,options:readonly string[]){return validSavedLabels(JSON.parse(storage.getItem(key)||'[]'),options);}
export function writeSavedLabels(storage:Pick<Storage,'setItem'>,key:string,values:string[],options:readonly string[]){const clean=validSavedLabels(values,options);storage.setItem(key,JSON.stringify(clean));return clean;}
