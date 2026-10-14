import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// Exercise the actual migration and SQL with the same async interface as D1.
export function testCacheDb(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(path.join('drizzle',file),'utf8'));
  return {sqlite,prepare(sql){
    const statement=(values=[])=>({
      bind:(...bound)=>statement(bound),
      async first(){const row=sqlite.prepare(sql).get(...values);return row?{...row}:null;},
      async run(){return {success:true,meta:{changes:sqlite.prepare(sql).run(...values).changes}};},
    });
    return statement();
  }};
}
