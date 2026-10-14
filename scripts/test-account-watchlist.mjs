import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Run production SQL against SQLite, preserving D1's prepared-statement API.
const root = process.cwd();
const target = path.join(root, '.sites-runtime/account-watchlist-tests');
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, 'package.json'), '{"type":"commonjs"}');
class D1SQLite {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); }
  prepare(sql) {
    const database = this.sqlite;
    const make = (values = []) => ({
      bind: (...bound) => make(bound),
      async first(column) {
        const row = database.prepare(sql).get(...values);
        return row ? (column ? row[column] : { ...row }) : null;
      },
      async all() {
        return { success: true, results: database.prepare(sql).all(...values).map(row => ({ ...row })), meta: {} };
      },
      async run() {
        const result = database.prepare(sql).run(...values);
        return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    });
    return make();
  }
  async exec(sql) { this.sqlite.exec(sql); return { count: 1, duration: 0 }; }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

function compile(source) {
  const destination = path.join(target, source.replace(/\.tsx?$/, '.js'));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  let code = ts.transpileModule(fs.readFileSync(path.join(root, source), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  code = code.replaceAll('require("cloudflare:workers")', '({ env: globalThis.__watchlistTestEnv })');
  fs.writeFileSync(destination, code);
}
const db = new D1SQLite();
for (const migration of fs.readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) {
  await db.exec(fs.readFileSync(path.join('drizzle', migration), 'utf8'));
}
globalThis.__watchlistTestEnv = { DB: db };
globalThis.__watchlistTestHeaders = new Headers();
for (const source of ['lib/watchlist.ts', 'lib/account-watchlist.ts', 'app/chatgpt-auth.ts', 'app/api/watchlist/route.ts']) compile(source);
const authPath = path.join(target, 'app/chatgpt-auth.js');
fs.writeFileSync(authPath, fs.readFileSync(authPath, 'utf8')
  .replaceAll('require("next/headers")', '({ headers: async () => globalThis.__watchlistTestHeaders })')
  .replaceAll('require("next/navigation")', '({ redirect: () => { throw new Error("Unexpected redirect"); } })'));
const require = createRequire(path.join(target, 'test.cjs'));
const backend = require('./lib/account-watchlist.js');
const route = require('./app/api/watchlist/route.js');
let checks = 0;
function login(id, email = id ? `${id}@example.test` : null) {
  globalThis.__watchlistTestHeaders = new Headers();
  if (id) globalThis.__watchlistTestHeaders.set('oai-authenticated-user-id', id);
  if (email) globalThis.__watchlistTestHeaders.set('oai-authenticated-user-email', email);
}
const origin = 'https://watchlist.example.test';
function request(body, options = {}) {
  const headers = new Headers({ Origin: origin, 'Content-Type': 'application/json', ...options.headers });
  if (options.noOrigin) headers.delete('Origin');
  return new Request(`${origin}/api/watchlist${options.query || ''}`, {
    method: 'POST', headers, body: options.raw ?? JSON.stringify(body),
  });
}
async function response(promise, status, code) {
  const result = await promise;
  assert.equal(result.status, status);
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  const data = await result.json();
  if (code) assert.equal(data.code, code);
  checks++;
  return data;
}
function mutation(action, revision, ticker = 'AAPL', accountId = 'userA') {
  return { action, revision, accountId, ...(action === 'import' ? { tickers: ticker } : { ticker }) };
}

// Browser-only clones never access account storage, even with identity headers.
login('userA');
globalThis.__watchlistTestEnv.WATCHLIST_MODE='browser';
assert.equal((await response(route.GET(),401,'device_only')).signInUrl,'');
await response(route.POST(request(mutation('add',0))),401,'device_only');
assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM watchlists').get().n,0);
delete globalThis.__watchlistTestEnv.WATCHLIST_MODE;

// Identity is established by the server-side platform helper, never payload fields.
login(null);
await response(route.GET(), 401, 'unauthenticated');
await response(route.POST(request(mutation('add', 0))), 401, 'unauthenticated');
login('userA', null);
await response(route.GET(), 401, 'unauthenticated');
login(null, 'userA@example.test');
await response(route.GET(), 401, 'unauthenticated');
login('userA');
assert.deepEqual((await response(route.GET(), 200)).tickers, []);
for (const options of [
  { noOrigin: true },
  { headers: { Origin: 'https://attacker.example.test' } },
  { headers: { Origin: 'null' } },
  { headers: { Origin: `${origin}.attacker.test` } },
  { headers: { 'Sec-Fetch-Site': 'cross-site' } },
]) await response(route.POST(request(mutation('add', 0), options)), 403, 'origin');
await response(route.POST(request(mutation('add', 0), { headers: { 'Content-Type': 'text/plain' } })), 415, 'invalid');
await response(route.POST(request(mutation('add', 0), { raw: '{ broken' })), 400, 'invalid');
await response(route.POST(request(mutation('add', 0), { raw: ' '.repeat(8193) })), 413, 'invalid');
await response(route.POST(request(mutation('add', 0), { headers: { 'Content-Length': '8193' } })), 413, 'invalid');

const malformed = [null, [], {}, 'add',
  { ...mutation('add', 0), userId: 'userB' },
  { ...mutation('add', 0), action: 'replace' },
  { ...mutation('add', 0), action: ['add'] },
  { ...mutation('add', 0), revision: '0' },
  { ...mutation('add', 0), revision: -1 },
  { ...mutation('add', 0), revision: 0.5 },
  { ...mutation('add', 0), revision: Number.MAX_SAFE_INTEGER + 1 },
  { ...mutation('add', 0), accountId: '' },
  { ...mutation('add', 0), accountId: 'x'.repeat(513) },
  mutation('add', 0, ''), mutation('add', 0, 1), mutation('add', 0, '<script>'),
  mutation('add', 0, 'AAPL,MSFT'), mutation('add', 0, 'A'.repeat(21)),
  mutation('import', 0, ['AAPL', 5]), mutation('import', 0, ['AAPL', '!bad']),
  mutation('import', 0, 'AAPL'), mutation('import', 0, Array(51).fill('AAPL')),
  { ...mutation('remove', 0), tickers: ['AAPL'] },
];
for (const body of malformed) {
  try { await response(route.POST(request(body)), 400, 'invalid'); }
  catch (error) { error.message += `\nInvalid payload: ${JSON.stringify(body)}`; throw error; }
}
assert.deepEqual((await response(route.GET(), 200)).tickers, []);

let a = await response(route.POST(request(mutation('add', 0, ' $aapl '), { query: '?userId=userB' })), 200);
assert.deepEqual(a.tickers, ['AAPL']);
assert.equal(a.accountId, 'userA');
assert.equal(a.revision, 1);
assert.ok(Number.isFinite(Date.parse(a.updatedAt)));
login('userB');
let b = await response(route.GET(), 200);
assert.equal(b.accountId, 'userB');
assert.deepEqual(b.tickers, []);
await response(route.POST(request(mutation('remove', a.revision, 'AAPL', 'userA'))), 409, 'account_changed');
b = await response(route.POST(request(mutation('add', 0, 'MSFT', 'userB'))), 200);
assert.deepEqual(b.tickers, ['MSFT']);
login('userA');
assert.deepEqual((await response(route.GET(), 200)).tickers, ['AAPL']);
await response(route.POST(request(mutation('add', 0, 'DVLT'))), 409, 'conflict');
a = await response(route.POST(request(mutation('import', a.revision, ['AAPL', ' $dvlt ', 'DVLT', 'BRK.B']))), 200);
assert.deepEqual(a.tickers, ['AAPL', 'DVLT', 'BRK.B']);
const importState = [...a.tickers];
a = await response(route.POST(request(mutation('import', a.revision, ['DVLT', 'AAPL']))), 200);
assert.deepEqual(a.tickers, importState, 'Re-import must not duplicate symbols');
a = await response(route.POST(request(mutation('remove', a.revision, 'dvlt'))), 200);
assert.deepEqual(a.tickers, ['AAPL', 'BRK.B']);
a = await response(route.POST(request(mutation('import', a.revision, Array.from({ length: 48 }, (_, i) => `T${i}`)))), 200);
assert.equal(a.tickers.length, 50);
const fullRevision = a.revision;
await response(route.POST(request(mutation('add', a.revision, 'EXTRA'))), 409, 'limit');
await response(route.POST(request(mutation('import', a.revision, ['EXTRA', 'AAPL']))), 409, 'limit');
a = await response(route.GET(), 200);
assert.equal(a.revision, fullRevision);
assert.equal(a.tickers.length, 50);
a = await response(route.POST(request(mutation('add', a.revision, 'AAPL'))), 200);
assert.equal(a.tickers.length, 50);
login('userB');
assert.deepEqual((await response(route.GET(), 200)).tickers, ['MSFT']);

// Force both callers to read revision 0, exercising the database compare-and-swap.
const concurrent = await Promise.allSettled([
  backend.changeWatchlist(db, 'racingUser', mutation('add', 0, 'AAPL', 'racingUser')),
  backend.changeWatchlist(db, 'racingUser', mutation('add', 0, 'MSFT', 'racingUser')),
]);
assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
const rejected = concurrent.find(result => result.status === 'rejected');
assert.equal(rejected.reason.code, 'conflict');
assert.equal((await backend.readWatchlist(db, 'racingUser')).revision, 1);
checks++;

// Fail closed on missing bindings, corrupted records, and database faults.
globalThis.__watchlistTestEnv.DB = null;
await response(route.GET(), 503, 'unavailable');
await response(route.POST(request(mutation('add', b.revision, 'DVLT', 'userB'))), 503, 'unavailable');
globalThis.__watchlistTestEnv.DB = db;
await db.prepare('UPDATE watchlists SET tickers = ? WHERE user_id = ?').bind('["<script>"]', 'userB').run();
await response(route.GET(), 503, 'unavailable');
await response(route.POST(request(mutation('add', b.revision, 'DVLT', 'userB'))), 503, 'unavailable');
assert.deepEqual((await backend.readWatchlist(db, 'userA')).tickers, a.tickers);
db.sqlite.close();
console.log(`PASS: ${checks} account API/backend checks using production migrations and real SQLite; server identity, isolation, anonymous rejection, CSRF, strict validation, import deduplication, 50-symbol limit, persistence, revision races, and fail-closed storage errors.`);

// Exercise component state transitions without network, a DOM, or child feed rendering.
// The hook harness runs the production component; real JSX objects retain event handlers.
const slots = [];
let cursor = 0, effects = [], tree, scheduled = false, uiChecks = 0;
let Watchlist;
const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const queueRender = () => {
  if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; render(); }); }
};
globalThis.__watchlistHooks = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; queueRender(); }];
  },
  useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
  useCallback(callback, deps) {
    const index = cursor++;
    if (!equalDeps(slots[index]?.deps, deps)) slots[index] = { callback, deps };
    return slots[index].callback;
  },
  useEffect(effect, deps) {
    const index = cursor++;
    if (!equalDeps(slots[index]?.deps, deps)) {
      const previous = slots[index];
      slots[index] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
    }
  },
};
function render() {
  cursor = 0;
  tree = Watchlist({ onTicker() {} });
  const pending = effects; effects = [];
  for (const effect of pending) effect();
}
function nodes(node = tree) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object') return [];
  return [node, ...nodes(node.props?.children ?? null)];
}
function label(node) {
  if (Array.isArray(node)) return node.map(label).join('');
  return node && typeof node === 'object' ? label(node.props?.children) : String(node ?? '');
}
function button(text) { const found = nodes().find(node => node.type === 'button' && label(node) === text); assert.ok(found, `Missing button: ${text}`); return found; }
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const pendingFetches = [], storageWrites = [], listeners = new Map();
const localList = ['DVLT', 'AAPL'];
const oldGlobals = { fetch: globalThis.fetch, window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };
globalThis.window = {
  addEventListener(name, handler) { listeners.set(name, handler); },
  removeEventListener(name) { listeners.delete(name); },
};
globalThis.document = { visibilityState: 'visible' };
globalThis.localStorage = { getItem() { return JSON.stringify(localList); }, setItem(key, value) { storageWrites.push([key, value]); } };
globalThis.fetch = (url, options) => new Promise(resolve => pendingFetches.push({ url, options, resolve }));
compile('app/watchlist.tsx');
compile('app/label-picker.tsx');
compile('app/use-saved-labels.ts');
compile('lib/saved-labels.ts');
compile('lib/company-news.ts');
const componentPath = path.join(target, 'app/watchlist.js');
fs.writeFileSync(componentPath, fs.readFileSync(componentPath, 'utf8')
  .replaceAll('require("react")', 'globalThis.__watchlistHooks')
  .replaceAll('require("./company-news")', '({ NewsList: () => null })')
  .replaceAll('require("./news-summary")', '({ default: () => null })'));
Watchlist = require('./app/watchlist.js').default;
const uiAccount = (id, tickers, revision = 0) => ({ accountId: id, displayName: id, tickers, revision, updatedAt: null, signOutUrl: '/signout-with-chatgpt' });
async function finishFetch(status, body) {
  const pending = pendingFetches.shift(); assert.ok(pending, 'Expected pending account request');
  pending.resolve(Response.json(body, { status })); await flush(); return pending;
}
render(); await flush();
assert.ok(label(tree).includes('Checking your account'));
assert.ok(!label(tree).includes('DVLT'), 'Device symbols must not appear before account status resolves'); uiChecks++;
await finishFetch(200, uiAccount('userA', ['MSFT']));
assert.ok(label(tree).includes('Signed in as userA'));
assert.ok(label(tree).includes('2 device tickers are not in your account'));
assert.ok(label(tree).includes('1/50 tickers'));
assert.equal(storageWrites.length, 0); uiChecks++;
button('Import device list').props.onClick(); await flush();
assert.deepEqual(JSON.parse(pendingFetches[0].options.body), { action: 'import', revision: 0, accountId: 'userA', tickers: localList });
await finishFetch(200, uiAccount('userA', ['MSFT', ...localList], 1));
assert.ok(label(tree).includes('3/50 tickers'));
assert.equal(storageWrites.length, 0, 'Import must retain local storage unchanged'); uiChecks++;

// Comma-separated account additions are one atomic mutation; invalid lists do not write.
async function submitTickers(value){
  nodes().find(node=>node.props?.id==='watch-ticker').props.onChange({target:{value}});await flush();
  void nodes().find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await flush();
}
await submitTickers(' $tsla, NVDA, tsla, MSFT ');
assert.equal(pendingFetches.length,1);
assert.deepEqual(JSON.parse(pendingFetches[0].options.body),{action:'import',revision:1,accountId:'userA',tickers:['TSLA','NVDA']});
await finishFetch(200,uiAccount('userA',['MSFT',...localList,'TSLA','NVDA'],2));
assert.equal(nodes().find(node=>node.props?.id==='watch-ticker').props.value,'');
assert.ok(label(tree).includes('2 tickers added to your account watchlist.'));
await submitTickers('AMD, !bad');assert.equal(pendingFetches.length,0);assert.ok(label(tree).includes('Nothing was added.'));
assert.equal(storageWrites.length,0);uiChecks++;

// Two reloads resolve out of order. Prior-account response must be ignored.
button('Sync now').props.onClick(); await flush();
assert.ok(!label(tree).includes('MSFT'), 'Account symbols hidden while rechecking identity');
listeners.get('focus')(); await flush();
assert.equal(pendingFetches[0].options.signal.aborted, true);
await finishFetch(200, uiAccount('userA', ['SECRET']));
assert.ok(!label(tree).includes('SECRET')); uiChecks++;
await finishFetch(200, uiAccount('userB', ['GOOG']));
assert.ok(label(tree).includes('Signed in as userB'));
assert.ok(!label(tree).includes('MSFT'));
assert.equal(storageWrites.length, 0); uiChecks++;

// Session expiry during an account mutation shows the unchanged separate device list.
nodes().find(node => node.props?.['aria-label'] === 'Remove GOOG from watchlist').props.onClick(); await flush();
await finishFetch(401, { error: 'Session ended', signInUrl: '/signin-with-chatgpt' });
assert.ok(label(tree).includes('Device watchlist'));
assert.ok(label(tree).includes('2/50 tickers'));
assert.ok(!label(tree).includes('GOOG'));
assert.equal(storageWrites.length, 0); uiChecks++;
// Device CSV additions persist once, deduplicate, and refuse overflow without truncation.
await submitTickers('aapl, AMD, $nvda, AMD');
assert.equal(storageWrites.length,1);
assert.deepEqual(JSON.parse(storageWrites[0][1]),['DVLT','AAPL','AMD','NVDA']);
await submitTickers(Array.from({length:47},(_,i)=>'T'+i).join(','));
assert.equal(storageWrites.length,1);assert.ok(label(tree).includes('Nothing was added.'));
storageWrites.length=0;uiChecks++;
listeners.get('focus')(); await flush();
await finishFetch(200, uiAccount('userB', ['GOOG'], 4));
nodes().find(node => node.props?.['aria-label'] === 'Remove GOOG from watchlist').props.onClick(); await flush();
await finishFetch(503, { error: 'Save uncertain' });
assert.ok(label(tree).includes('Account connection unavailable'));
assert.ok(!label(tree).includes('GOOG'));
assert.equal(storageWrites.length, 0, 'Uncertain account save must never fall back to device writes'); uiChecks++;
// Focus during a save must wait for the mutation to settle before rechecking identity.
button('Reload account').props.onClick(); await flush();
await finishFetch(200, uiAccount('userB', ['GOOG'], 4));
nodes().find(node => node.props?.['aria-label'] === 'Remove GOOG from watchlist').props.onClick(); await flush();
listeners.get('focus')(); await flush();
assert.equal(pendingFetches.length, 1, 'Focus must not launch a GET while POST is in flight');
assert.equal(pendingFetches[0].options.signal.aborted, false, 'Focus must not abandon mutation confirmation');
await finishFetch(200, uiAccount('userB', [], 5));
assert.equal(pendingFetches.length, 1, 'Deferred account refresh should run after save settles');
assert.ok(!pendingFetches[0].options.method, 'Deferred request should be a GET');
await finishFetch(200, uiAccount('userB', [], 5));
assert.ok(label(tree).includes('0/50 tickers'));
assert.equal(storageWrites.length, 0); uiChecks++;
for (const slot of slots) slot?.cleanup?.();
Object.assign(globalThis, oldGlobals);
console.log(`PASS: ${uiChecks} production-component state checks: explicit import, local retention, account switching, stale-response cancellation, expired sessions, and uncertain-save isolation.`);
