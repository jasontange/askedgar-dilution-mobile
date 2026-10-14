// Request another page only after the last currently loaded record.
export async function nextDetail<T>(rows:T[],index:number,hasMore:boolean,loadMore?:()=>Promise<T[]|undefined>):Promise<T|undefined>{
  if(index<0||index>=rows.length)return;
  if(index<rows.length-1)return rows[index+1];
  if(hasMore&&loadMore)return (await loadMore())?.[0];
}
