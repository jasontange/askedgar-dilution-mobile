import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,constants} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {localD1Bindings} from './local-bindings.mjs';

// No network account, login, remote database, or deployment is used here.
export function setupLocal(root=fileURLToPath(new URL('../',import.meta.url))) {
  const manifest=JSON.parse(readFileSync(path.join(root,'.openai/hosting.json'),'utf8'));
  if(!manifest.d1)throw new Error('Local setup expects a D1 binding in .openai/hosting.json.');
  const envPath=path.join(root,'.env');
  if(!existsSync(envPath))copyFileSync(path.join(root,'.env.example'),envPath,constants.COPYFILE_EXCL);
  const runtime=path.join(root,'.sites-runtime');mkdirSync(runtime,{recursive:true});
  const configPath=path.join(runtime,'local-database.json');
  writeFileSync(configPath,JSON.stringify({
    name:'askedgar-local-setup',compatibility_date:'2026-05-15',
    d1_databases:localD1Bindings(manifest.d1).map(binding=>({...binding,migrations_dir:path.join(root,'drizzle')})),
  },null,2));
  const result=spawnSync(process.execPath,[
    path.join(root,'node_modules/wrangler/bin/wrangler.js'),
    'd1','migrations','apply',manifest.d1,'--local','--config',configPath,
    '--persist-to',path.join(root,'.wrangler/state'),
  ],{cwd:root,stdio:'inherit',env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_LOG_PATH:path.join(runtime,'wrangler/logs'),WRANGLER_REGISTRY_PATH:path.join(runtime,'wrangler/dev-registry')}});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error('Local database setup failed. Resolve the error above and run npm run setup again.');
  console.log('Local cache ready. Set ASKEDGAR_API_KEY in .env, then run npm run dev.');
  console.log('Device watchlists need no login. Existing .env and database records were preserved.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)setupLocal();
