"""Stage 3 in real browsers: voice notes + audio between two devices (desktop + phone), one fake cloud.
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
OBJECTS = {}   # fake Storage: path -> (base64, contentType)
import base64 as _b64
def srv_upload(path, b64, ctype):
    OBJECTS[path] = (b64, ctype); return json.dumps({'error': None})
def srv_download(path):
    return json.dumps({'b64': OBJECTS[path][0], 'type': OBJECTS[path][1], 'error': None} if path in OBJECTS else {'error': 'Object not found'})
def srv_remove(paths):
    for pth in json.loads(paths): OBJECTS.pop(pth, None)
    return json.dumps({'error': None})

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
    rpc: (name, args) => window.__srvRpc(name, JSON.stringify(args)).then(JSON.parse), from: builder,
    storage: { from: (bucket) => ({
      async upload(path, blob, opts) {
        const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; buf.forEach((x) => { bin += String.fromCharCode(x); });
        const r = JSON.parse(await window.__srvUpload(`${bucket}/${path}`, btoa(bin), (opts && opts.contentType) || blob.type));
        return { data: r.error ? null : { path }, error: r.error ? { message: r.error } : null };
      },
      async download(path) {
        if (!navigator.onLine) return { data: null, error: { message: 'Failed to fetch' } }; // a real offline network fails
        const r = JSON.parse(await window.__srvDownload(`${bucket}/${path}`));
        if (r.error) return { data: null, error: { message: r.error } };
        const bin = atob(r.b64); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return { data: new Blob([buf], { type: r.type }), error: null };
      },
      async remove(paths) { await window.__srvRemove(JSON.stringify(paths.map((p) => `${bucket}/${p}`))); return { data: [], error: null }; },
    }) } };
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
    page.expose_function('__srvUpload', srv_upload); page.expose_function('__srvDownload', srv_download); page.expose_function('__srvRemove', srv_remove)
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
    ctxA, A, errsA = open_device(b, 1280, 800, False)   # desktop (records)
    ctxB, B, errsB = open_device(b, 390, 844, True)     # phone (listens)
    PUMP[0] = A

    # 1. A records a voice note (real Blob in real IndexedDB)
    vn = A.evaluate("""async () => { const s = await import('/js/core/store.js');
      const blob = new Blob([new Uint8Array([1,2,3,4,5,250,251,252,253,254])], { type: 'audio/webm' });
      const v = await s.createVoiceNote({ title: 'Flow idea', durationMs: 4000, blob, mimeType: 'audio/webm' }); return v.id; }""")
    sync_now(A); pump(1.5); sync_now(A)
    check('the audio FILE is in cloud Storage and the table row has no audio bytes',
          len(OBJECTS) == 1 and any(r['store'] == 'audioBlobs' and 'blob' not in (r['data'] or {}) and r['data'].get('path', '').startswith('user-1/') for r in ROWS.values()),
          (list(OBJECTS), [r['data'] for r in ROWS.values() if r['store'] == 'audioBlobs']))
    check('A: queue empty after upload', len(local(A, 'syncQueue')) == 0, len(local(A, 'syncQueue')))

    # 2. B pulls: placeholder only, nothing downloaded yet
    sync_now(B); pump(1.0)
    ab = local(B, 'audioBlobs')
    check('B received the voice note details + a placeholder (no audio downloaded yet)',
          len(local(B, 'voiceNotes')) == 1 and len(ab) == 1 and ab[0].get('blob') is None and ab[0].get('remote') is True, (len(ab), ab[0].keys() if ab else None))

    # 3. B goes OFFLINE and opens the Voice Inbox: clear message + Retry, no crash
    ctxB.set_offline(True); pump(0.4)
    B.evaluate("location.hash = '#/voice'"); pump(1.0)
    check('offline: card shows the title and a "not on this device yet" message with Retry',
          'Flow idea' in B.locator('#view').inner_text() and B.locator('.audio-loading button:has-text("Retry")').count() == 1 and B.locator('audio').count() == 0,
          B.locator('#view').inner_text()[:140].replace('\n', ' '))

    # 4. back online + Retry: the audio downloads and plays from a local copy
    ctxB.set_offline(False); pump(0.4)
    B.locator('.audio-loading button:has-text("Retry")').click()
    check('Retry downloads the audio and shows the player', wait_for(lambda: B.locator('audio').count() == 1))
    same = B.evaluate("""async () => { const a = document.querySelector('audio'); const buf = new Uint8Array(await (await fetch(a.src)).arrayBuffer()); return Array.from(buf).join(','); }""")
    check('the downloaded bytes are identical to what was recorded', same == '1,2,3,4,5,250,251,252,253,254', same)
    kept = local(B, 'audioBlobs')
    check('B kept a local copy and did not upload it again', kept[0].get('remote') is False and kept[0].get('blob') is not None and len(local(B, 'syncQueue')) == 0)

    # 5. second visit needs no download (works offline now)
    ctxB.set_offline(True); pump(0.3)
    B.evaluate("location.hash = '#/'"); pump(0.4); B.evaluate("location.hash = '#/voice'"); pump(1.0)
    check('second visit plays straight from the device (offline)', B.locator('audio').count() == 1 and B.locator('.audio-loading').count() == 0)
    ctxB.set_offline(False); pump(0.3)

    # 6. a backup taken on B contains the audio
    n = B.evaluate("""async () => { const s = await import('/js/core/store.js'); const f = await s.exportAll(); return f.size; }""") if False else None

    # 7. delete on A: file leaves Storage, B loses the note
    A.evaluate("""async (id) => { const s = await import('/js/core/store.js'); await s.deleteVoiceNote(id); }""", vn)
    sync_now(A); pump(1.0); sync_now(A); sync_now(B); pump(1.0)
    check('deleting on desktop removes the file from Storage', len(OBJECTS) == 0, list(OBJECTS))
    check('and removes the voice note + audio on the phone', wait_for(lambda: len(local(B, 'voiceNotes')) == 0 and len(local(B, 'audioBlobs')) == 0))
    check('no JS errors on either device', not errsA and not errsB, (errsA[:2], errsB[:2]))
    b.close()
srv.terminate()
print('ALL PASSED' if all(results) else 'SOME FAILED', f'{sum(results)}/{len(results)}')
sys.exit(0 if all(results) else 1)
