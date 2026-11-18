"""Stage 2 in real browsers: two devices (desktop + phone) signed in as the SAME account, one fake cloud.
Supabase auth + database are stubbed (the cloud is a Python dict that follows supabase/001_sync_records.sql).
Run:  python tests/sync-two-devices-e2e.py"""
import subprocess, time, json, os, socket, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def free_port():
    k = socket.socket(); k.bind(('127.0.0.1', 0)); p = k.getsockname()[1]; k.close(); return p
PORT = free_port()
srv = subprocess.Popen(['node', 'serve.mjs', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
URL = f'http://127.0.0.1:{PORT}/'

# ---------- fake cloud (same rules as the SQL) ----------
ROWS = {}
TICK = [1_900_000_000_000]
def ms(v):
    from datetime import datetime
    return datetime.fromisoformat(v.replace('Z', '+00:00')).timestamp() * 1000
def fmt(t):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(t / 1000, timezone.utc).isoformat(timespec='milliseconds')
def srv_rpc(name, args):
    for r in json.loads(args)['records']:
        key = ('user-1', r['store'], r['id']); cur = ROWS.get(key)
        if cur and not (ms(r['updated_at']) > ms(cur['updated_at'])): continue
        TICK[0] += 1
        ROWS[key] = dict(user_id='user-1', store=r['store'], id=r['id'], data=r['data'], updated_at=r['updated_at'], deleted=bool(r.get('deleted')), device_id=r.get('device_id'), server_updated_at=fmt(TICK[0]))
    return json.dumps({'error': None})
def srv_select(spec):
    f = json.loads(spec); rows = list(ROWS.values())
    for kind, c, v in f['filters']:
        rows = [r for r in rows if (r[c] == v if kind == 'eq' else ms(r[c]) >= ms(v))]
    rows.sort(key=lambda r: (ms(r['server_updated_at']), r['store'], r['id']))
    if f['range']: rows = rows[f['range'][0]: f['range'][1] + 1]
    return json.dumps({'data': rows, 'error': None})

STUB = """
export function createClient() {
  const user = { id: 'user-1', email: 'karl@test.dev', user_metadata: { display_name: 'Karl R' } };
  const builder = (table) => { const f = { table, filters: [], orders: [], range: null };
    const b = { select() { return b; }, eq(c, v) { f.filters.push(['eq', c, v]); return b; }, gte(c, v) { f.filters.push(['gte', c, v]); return b; },
      order(c) { f.orders.push(c); return b; }, range(a, z) { f.range = [a, z]; return b; },
      then(res, rej) { return window.__srvSelect(JSON.stringify(f)).then(JSON.parse).then(res, rej); } };
    return b; };
  return { auth: { getSession: async () => ({ data: { session: { user } } }), getUser: async () => ({ data: { user } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    rpc: (name, args) => window.__srvRpc(name, JSON.stringify(args)).then(JSON.parse), from: builder };
}
"""
results = []
def check(name, ok, extra=''):
    results.append(bool(ok)); print(('PASS' if ok else 'FAIL'), name, extra)
PUMP = [None]
def pump(seconds):
    # time.sleep would block the callbacks that play the cloud; Playwright's own wait serves them
    (PUMP[0].wait_for_timeout(seconds * 1000) if PUMP[0] else time.sleep(seconds))

def wait_for(fn, timeout=12, step=0.25):
    end = time.time() + timeout
    while time.time() < end:
        try:
            v = fn()
            if v: return v
        except Exception: pass
        pump(step)
    return False

def open_device(b, w, h, mobile):
    ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.expose_function('__srvRpc', srv_rpc); page.expose_function('__srvSelect', srv_select)
    ctx.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=STUB))
    ctx.route('**/fonts.g*/**', lambda r: r.abort())
    page.goto(URL); page.wait_for_selector('#view', timeout=10000)
    wait_for(lambda: page.evaluate('!!window.__barahaSyncStatus'))
    return ctx, page, errs

def sync_now(page):
    page.evaluate("window.dispatchEvent(new CustomEvent('baraha:sync-now'))")
    pump(0.8)

def local(page, store):
    return page.evaluate("""async (store) => { const idb = await new Promise((r, j) => { const q = indexedDB.open('baraha-user-1'); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
      const rows = await new Promise((r) => { const q = idb.transaction(store).objectStore(store).getAll(); q.onsuccess = () => r(q.result); }); idb.close(); return rows; }""", store)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctxA, A, errsA = open_device(b, 1280, 800, False)   # desktop
    ctxB, B, errsB = open_device(b, 390, 844, True)     # phone
    PUMP[0] = A
    check('both devices start with sync running', A.evaluate('window.__barahaSyncStatus.state') in ('idle', 'syncing') and B.evaluate('window.__barahaSyncStatus.state') in ('idle', 'syncing'), (A.evaluate('window.__barahaSyncStatus.state')))

    # 1. battle created on the desktop appears on the phone
    bid = A.evaluate("""async () => { const s = await import('/js/core/store.js'); const r = await s.createBattle({ title: 'YORAVEN VS BAT', opponentName: 'Bat' }); return r.battle.id; }""")
    sync_now(A); sync_now(B)
    check('battle created on desktop shows up on the phone (The Wall refreshed by itself)', wait_for(lambda: 'YORAVEN VS BAT' in B.locator('#view').inner_text().upper()))

    # 2. typing on desktop -> phone sees the text
    A.goto(URL + '#/battle/' + bid); A.wait_for_selector(".editor[contenteditable='true']"); pump(0.5)
    A.click('.editor'); A.keyboard.type('Ang yabang mo pre, wala kang bars'); pump(1.2)
    sync_now(A)
    B.goto(URL + '#/battle/' + bid); B.wait_for_selector(".editor[contenteditable='true']"); sync_now(B)
    B.goto(URL + '#/battle/' + bid)  # re-open to read the pulled text
    B.wait_for_selector(".editor[contenteditable='true']")
    check('text typed on desktop appears on the phone', wait_for(lambda: 'wala kang bars' in B.locator('.editor').inner_text()))

    # 3. both queues are empty after syncing (no echo loops)
    pump(3.2); sync_now(A); sync_now(B)
    qa = local(A, 'syncQueue'); qb = local(B, 'syncQueue')
    check('queues are empty on both devices (nothing re-uploaded)', len(qa) == 0 and len(qb) == 0, (len(qa), len(qb)))

    # 4. offline conflict: both edit the same round while offline
    for page in (A, B):
        page.goto(URL + '#/battle/' + bid); page.reload(); page.wait_for_selector(".editor[contenteditable='true']"); pump(0.6)
    ctxA.set_offline(True); ctxB.set_offline(True); pump(0.5)
    for page, text, delay in ((A, 'DESKTOP offline edit', 0), (B, 'PHONE offline edit', 1.5)):
        page.click('.editor'); page.keyboard.press('Control+A'); page.keyboard.type(text); pump(1.3 + delay)
    check('while offline the status says offline and edits are kept', A.evaluate('window.__barahaSyncStatus.state') == 'offline' and A.evaluate('window.__barahaSyncStatus.pending') >= 1, A.evaluate('window.__barahaSyncStatus'))
    ctxA.set_offline(False); ctxB.set_offline(False); pump(0.4)
    for _ in range(3):
        sync_now(A); sync_now(B)
    pump(1.0)
    ta = [r['text'] for r in local(A, 'finalMaterials')]; tb = [r['text'] for r in local(B, 'finalMaterials')]
    check('both devices end with the SAME round text (the newer edit)', ta == tb and len(ta) == 1, (ta, tb))
    ca = [d for d in local(A, 'drafts') if 'conflict' in (d.get('tags') or [])]; cb = [d for d in local(B, 'drafts') if 'conflict' in (d.get('tags') or [])]
    check('the older text was kept as ONE conflict copy on both devices', len(ca) == 1 and len(cb) == 1 and ca[0]['id'] == cb[0]['id'], (len(ca), len(cb)))
    lost = ca[0]['content'] if ca else None
    check('the conflict copy holds the text that lost', lost in ('DESKTOP offline edit', 'PHONE offline edit') and lost not in ta, lost)

    # 5. deleting on one device removes it on the other
    A.evaluate("""async (bid) => { const s = await import('/js/core/store.js'); await s.deleteBattle(bid); }""", bid)
    sync_now(A); sync_now(B)
    check('deleting the battle on desktop removes it on the phone', wait_for(lambda: len(local(B, 'battles')) == 0))

    # 6. account menu shows the sync state
    A.goto(URL + '#/'); A.wait_for_selector('.account-menu-trigger'); A.click('.account-menu-trigger')
    txt = A.locator('.account-dropdown-sync').inner_text()
    check('account menu shows sync status', 'Sync' in txt, txt.replace('\n', ' | '))
    check('no JS errors on either device', not errsA and not errsB, (errsA[:2], errsB[:2]))
    b.close()
srv.terminate()
print('ALL PASSED' if all(results) else 'SOME FAILED', f'{sum(results)}/{len(results)}')
sys.exit(0 if all(results) else 1)
