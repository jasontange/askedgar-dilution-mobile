export type CachedValue<T>={value:T;fetchedAt:number;expiresAt:number};
type Stored={body:string|null;fetched_at:number;expires_at:number;lease_until:number};
const LEASE_MS=40000;
const WAIT_MS=28000;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

// D1 is shared across requests, workers, devices, and deployments. A conditional
// lease prevents simultaneous cache misses from spending multiple upstream calls.
export async function cachedValue<T>(db:D1Database,key:string,ttl:number,load:()=>Promise<T>):Promise<CachedValue<T>>{
  const deadline=Date.now()+WAIT_MS;
  const token=crypto.randomUUID();
  let attempt=0;
  while(true){
    const now=Date.now();
    const row=await db.prepare('SELECT body, fetched_at, expires_at, lease_until FROM api_response_cache WHERE key = ?').bind(key).first<Stored>();
    if(row?.body!==null&&row?.body!==undefined&&Math.min(row.expires_at,row.fetched_at+ttl)>now){
      try{return {value:JSON.parse(row.body) as T,fetchedAt:row.fetched_at,expiresAt:Math.min(row.expires_at,row.fetched_at+ttl)};}
      catch{
        // Discard only the corrupt version, never a concurrent successful refresh.
        await db.prepare('UPDATE api_response_cache SET body = NULL, expires_at = 0 WHERE key = ? AND body = ?').bind(key,row.body).run();
      }
    }
    const lease=row&&row.lease_until>now?null:await db.prepare(`INSERT INTO api_response_cache (key, lease_token, lease_until) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET lease_token = excluded.lease_token, lease_until = excluded.lease_until
      WHERE api_response_cache.lease_until <= ? AND (api_response_cache.expires_at <= ? OR api_response_cache.fetched_at + ? <= ?)
      RETURNING key`).bind(key,token,now+LEASE_MS,now,now,ttl,now).first();
    if(lease){
      let saved=false;
      try{
        const value=await load(),fetchedAt=Date.now(),expiresAt=fetchedAt+ttl;
        const body=JSON.stringify(value);
        await db.prepare(`UPDATE api_response_cache SET body = ?, fetched_at = ?, expires_at = ?, lease_token = NULL, lease_until = 0
          WHERE key = ? AND lease_token = ?`).bind(body,fetchedAt,expiresAt,key,token).run();
        saved=true;
        // Bounded opportunistic cleanup; active leases and recent expired pages stay intact.
        try{await db.prepare(`DELETE FROM api_response_cache WHERE key IN
          (SELECT key FROM api_response_cache WHERE expires_at < ? AND lease_until <= ? ORDER BY expires_at LIMIT 100)`)
          .bind(fetchedAt-86400000,fetchedAt).run();}catch{/* Cleanup must not discard a successful response. */}
        return {value,fetchedAt,expiresAt};
      }finally{
        // Failed requests are never cached as successful data. Release for an explicit retry.
        if(!saved)await db.prepare('UPDATE api_response_cache SET lease_token = NULL, lease_until = 0 WHERE key = ? AND lease_token = ?').bind(key,token).run();
      }
    }
    if(Date.now()>=deadline)throw new Error('This data is being refreshed. Please try again shortly.');
    await delay(Math.min(150*2**attempt++,1000));
  }
}
