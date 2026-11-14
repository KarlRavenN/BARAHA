"""Stage 1 sync foundations, in a real browser (per-account DB, stamping, queue, migration v4, account isolation).
Supabase is stubbed, so no network or login is needed.  Run: python tests/sync-e2e.py"""
import subprocess, time, json, sys, os, socket
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def free_port():
    k = socket.socket(); k.bind(('127.0.0.1', 0)); p = k.getsockname()[1]; k.close(); return p
from playwright.sync_api import sync_playwright

PORT = free_port()
srv = subprocess.Popen(['node', 'serve.mjs', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
URL = f'http://127.0.0.1:{PORT}/'
current = {'id': 'user-A'}
STUB = """
export function createClient() {
  const user = { id: '%s', email: '%s@test.dev', user_metadata: { display_name: 'Tester' } };
  return { auth: {
    getSession: async () => ({ data: { session: { user } } }),
    getUser: async () => ({ data: { user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  } };
}
"""
results = []
def check(name, ok, extra=''):
    results.append(ok); print(('PASS' if ok else 'FAIL'), name, extra)

def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context()
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        ctx.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=STUB % (current['id'], current['id'])))
        ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        ctx.route('**/fonts.gstatic.com/**', lambda r: r.abort())

        # 1. boot as user A
        page.goto(URL)
        page.wait_for_function("indexedDB.databases().then(d => d.some(x => x.name === 'baraha-user-A'))", timeout=10000)
        page.wait_for_timeout(1500)
        names = page.evaluate("indexedDB.databases().then(d => d.map(x => x.name))")
        check('app boots (no blank page) as user A', page.locator('#view').inner_text().strip() != '' or page.locator('#view *').count() > 0)
        check('opens baraha-user-A and NOT the legacy shared db', 'baraha-user-A' in names and 'baraha' not in names, str(names))
        info = page.evaluate("""async () => {
          const { createIndexedDbBackend } = await import('/js/core/db.js');
          const b = await createIndexedDbBackend('user-A');
          return { deviceId: await b.sync.getMeta('deviceId'), pending: await b.sync.pendingCount() };
        }""")
        check('device id created once', bool(info['deviceId']), info['deviceId'])

        # 2. write through the real store in the browser -> queued
        r = page.evaluate("""async () => {
          const store = await import('/js/core/store.js');
          const { createIndexedDbBackend } = await import('/js/core/db.js');
          const { battle, rounds } = await store.createBattle({ title: 'Browser Test', opponentName: 'Z' });
          await store.saveFinalMaterial(rounds[0].id, battle.id, 'bars');
          const b = await createIndexedDbBackend('user-A');
          const q = await b.sync.getPending(1000);
          const rec = await b.get('battles', battle.id);
          return { n: q.length, hasBattle: q.some(e => e.qid === 'battles:' + battle.id), stamped: !!rec.modifiedAt, battleId: battle.id };
        }""")
        check('writes in real IndexedDB are stamped and queued', r['hasBattle'] and r['stamped'] and r['n'] >= 6, str(r))

        # 3. ack + conditional delete works in real IndexedDB
        ack = page.evaluate("""async () => {
          const { createIndexedDbBackend } = await import('/js/core/db.js');
          const b = await createIndexedDbBackend('user-A');
          const pending = await b.sync.getPending(1000);
          const keep = pending[0];
          await b.batch([{ op: 'put', store: 'rounds', value: { id: keep.id, battleId: 'x', name: 'changed' } }].filter(() => keep.store === 'rounds'));
          await b.sync.ack(pending);
          const left = await b.sync.getPending(1000);
          return { before: pending.length, left: left.length, keepStore: keep.store };
        }""")
        check('ack clears pushed entries (real IDB conditional delete)', ack['left'] <= 1 and ack['before'] >= 6, str(ack))

        # 4. upgrade path v3 -> v4 on an existing database
        up = page.evaluate("""async () => {
          await new Promise((res, rej) => { const q = indexedDB.open('baraha-upg', 3); q.onupgradeneeded = () => { const db = q.result; db.createObjectStore('battles', { keyPath: 'id' }); }; q.onsuccess = () => { q.result.close(); res(); }; q.onerror = () => rej(q.error); });
          return 'ok';
        }""")
        # upgrading needs all stores of v1-v3 to exist for the app; here we only verify the v4 step creates the sync stores
        v4 = page.evaluate("""async () => {
          const { MIGRATIONS } = await import('/js/core/db.js');
          return await new Promise((res, rej) => { const q = indexedDB.open('baraha-upg', 4); q.onupgradeneeded = (e) => { for (let v = e.oldVersion; v < e.newVersion; v++) MIGRATIONS[v](q.result, q.transaction); }; q.onsuccess = () => { const n = [...q.result.objectStoreNames]; q.result.close(); res(n); }; q.onerror = () => rej(q.error); });
        }""")
        check('migration v4 adds syncQueue + syncMeta to an existing db', 'syncQueue' in v4 and 'syncMeta' in v4, str(v4))

        # 4b. the Wall shows the battle after reload (UI still works on the new db)
        page.goto(URL + '#/'); page.wait_for_timeout(1200); page.reload(); page.wait_for_selector('#nav', timeout=8000); page.wait_for_timeout(800)
        check('The Wall renders the battle after reload', 'Browser Test' in page.content())

        # 5. switch account in the same browser -> isolated data
        current['id'] = 'user-B'
        page.reload(); page.wait_for_selector('#nav', timeout=8000); page.wait_for_timeout(800)
        names = page.evaluate("indexedDB.databases().then(d => d.map(x => x.name))")
        check('user B gets their own database', 'baraha-user-B' in names, str(names))
        check("user B does NOT see user A's battle", 'Browser Test' not in page.content())
        current['id'] = 'user-A'
        page.reload(); page.wait_for_selector('#nav', timeout=8000); page.wait_for_timeout(800)
        check("user A's battle is still there after switching back", 'Browser Test' in page.content())

        bad = [e for e in errors if 'supabase' not in e.lower()]
        check('no JS errors in the console', not bad, str(bad[:3]))
        b.close()

try:
    run()
finally:
    srv.terminate()
print('\nALL PASSED' if all(results) else '\nSOME FAILED'); sys.exit(0 if all(results) else 1)
