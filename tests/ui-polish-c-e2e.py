"""UI polish C in a real browser: account menu, Profile page, Settings cleanup.
Supabase is stubbed (no network, no login). Run: python tests/ui-polish-c-e2e.py"""
import subprocess, time, sys, os, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def free_port():
    k = socket.socket(); k.bind(('127.0.0.1', 0)); p = k.getsockname()[1]; k.close(); return p
PORT = free_port()
srv = subprocess.Popen(['node', 'serve.mjs', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
URL = f'http://127.0.0.1:{PORT}/'

# Fake Supabase. The password is "oldpass123". Calls are logged on window.__authLog.
STUB = """
const user = { id: 'user-A', email: 'a@test.dev', user_metadata: { display_name: 'Tester' } };
let password = 'oldpass123';
const log = (globalThis.__authLog = globalThis.__authLog || []);
let listeners = [];
const fire = (ev) => listeners.forEach((l) => l(ev, { user }));
export function createClient() {
  return { auth: {
    getSession: async () => ({ data: { session: { user } } }),
    getUser: async () => ({ data: { user } }),
    onAuthStateChange: (cb) => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async (o) => { log.push(['signOut', o]); try { sessionStorage.setItem('__signedOut', '1'); } catch {} return { error: null }; },
    signInWithPassword: async ({ email, password: p }) => { log.push(['signIn', email]); return p === password ? { data: { user }, error: null } : { data: null, error: { message: 'Invalid login credentials' } }; },
    updateUser: async (patch) => {
      log.push(['updateUser', JSON.stringify(patch)]);
      if (patch.password) { if (patch.password === password) return { data: null, error: { message: 'New password should be different from the old password.' } }; password = patch.password; return { data: { user }, error: null }; }
      if (patch.data) { user.user_metadata = { ...user.user_metadata, ...patch.data }; setTimeout(() => fire('USER_UPDATED'), 0); }
      return { data: { user: { ...user } }, error: null };
    },
    resetPasswordForEmail: async (email) => { log.push(['reset', email]); return { error: null }; },
    verifyOtp: async ({ email, token, type }) => { log.push(['verifyOtp', token, type]); return token === '123456' ? { error: null } : { error: { message: 'Token has expired or is invalid' } }; },
  } };
}
"""
results = []
def check(name, ok, extra=''):
    results.append(bool(ok)); print(('PASS' if ok else 'FAIL'), name, extra)

def go(page, h, wait=700):
    page.evaluate('h => { location.hash = h; }', h); page.wait_for_timeout(wait)
def log(page): return page.evaluate('window.__authLog || []')
def msg(page): return page.locator('.profile-msg').all_inner_texts()
def set_status(page, st):
    page.evaluate("st => { window.__barahaSyncStatus = st; document.dispatchEvent(new CustomEvent('baraha:sync-status', { detail: st })); }", st)

def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        ctx.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=STUB))
        ctx.route('**/fonts.g*/**', lambda r: r.abort())
        page.goto(URL)
        page.wait_for_function("indexedDB.databases().then(d => d.some(x => x.name === 'baraha-user-A'))", timeout=10000)
        page.wait_for_timeout(1500)

        # ================= C1: account menu =================
        trig = page.locator('.account-menu-trigger')
        check('avatar AND name shown in the sidebar', trig.locator('.account-avatar').count() == 1 and trig.locator('.account-name').inner_text() == 'Tester')
        nav_labels = page.locator('.nav-label-text').all_inner_texts()
        check('Settings is no longer in the sidebar links', 'Settings' not in nav_labels, str(nav_labels))
        check('sync dot sits on the avatar', trig.locator('.account-avatar .sync-dot').count() == 1)
        for st, col in (('idle', 'rgb(63, 174, 99)'), ('syncing', 'rgb(217, 162, 27)'), ('offline', 'rgb(138, 138, 138)'), ('error', 'rgb(214, 69, 69)')):
            set_status(page, {'state': st, 'pending': 0, 'lastSyncedAt': None})
            c = page.evaluate("getComputedStyle(document.querySelector('.account-avatar .sync-dot')).backgroundColor")
            check(f'dot colour for "{st}"', c == col, c)
        set_status(page, {'state': 'idle', 'pending': 2, 'lastSyncedAt': new_iso(page)})
        check('tooltip describes sync status', 'Synced' in trig.get_attribute('title') and '2 waiting' in trig.get_attribute('title'), trig.get_attribute('title'))
        trig.click(); page.wait_for_selector('.account-dropdown')
        items = page.locator('.account-dropdown .account-dropdown-item, .account-dropdown .account-dropdown-signout').all_inner_texts()
        check('dropdown = Profile, Settings, Sign out', items == ['Profile', 'Settings', 'Sign out'], str(items))
        dd = page.locator('.account-dropdown').inner_text()
        check('dropdown shows name + email', 'Tester' in dd and 'a@test.dev' in dd)
        check('no "Sync now" / "Synced just now" in the dropdown', 'Sync now' not in dd and 'Synced' not in dd, dd)
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
        check('Esc closes the dropdown', page.locator('.account-dropdown').count() == 0)
        trig.click(); page.locator('.account-dropdown-item', has_text='Profile').click(); page.wait_for_timeout(600)
        check('Profile item opens #/profile', page.evaluate('location.hash') == '#/profile' and page.locator('h1', has_text='Profile').count() == 1)
        trig.click(); page.locator('.account-dropdown-item', has_text='Settings').click(); page.wait_for_timeout(600)
        check('Settings item opens #/settings', page.evaluate('location.hash') == '#/settings')

        # ================= C2: profile =================
        go(page, '#/profile')
        check('Profile has a back button', page.locator('.page-head .back-btn').count() == 1)
        email = page.locator('input[type=email]')
        check('email is read-only', email.get_attribute('readonly') is not None and email.input_value() == 'a@test.dev')
        name = page.locator('input[aria-label="Rapper name"]')
        check('name box shows current name', name.input_value() == 'Tester')
        name.fill('   '); page.get_by_role('button', name='Save name').click(); page.wait_for_timeout(200)
        check('empty name is refused (plain words)', 'Type a name' in msg(page)[0], str(msg(page)))
        name.fill('x' * 40)
        check('name is limited to 30 characters', len(name.input_value()) == 30)
        name.fill('  MC Karl  '); page.get_by_role('button', name='Save name').click(); page.wait_for_timeout(600)
        check('name saved (trimmed) via updateUser', ['updateUser', '{"data":{"display_name":"MC Karl"}}'] in log(page), str(log(page)))
        check('sidebar name updates immediately', page.locator('.account-name').inner_text() == 'MC Karl')
        check('avatar initials updated', page.locator('.account-avatar').first.inner_text().strip().startswith('MK'))
        check('still on the profile page after saving', page.evaluate('location.hash') == '#/profile')

        cur = page.locator('input[aria-label="Current password"]').first
        nw = page.locator('form:has(h3:text("Change password")) input[aria-label="New password"]')
        cf = page.locator('form:has(h3:text("Change password")) input[aria-label="Confirm new password"]')
        btn = page.get_by_role('button', name='Change password')
        cur.fill('wrong'); nw.fill('newpass123'); cf.fill('newpass123'); btn.click(); page.wait_for_timeout(500)
        check('wrong current password: plain error, password NOT changed', 'not right' in msg(page)[1] and not any(x[0] == 'updateUser' and 'password' in x[1] and 'display_name' not in x[1] for x in log(page)), str(msg(page)))
        cur.fill('oldpass123'); nw.fill('short'); cf.fill('short'); btn.click(); page.wait_for_timeout(300)
        check('short new password refused (8 characters rule)', 'at least 8' in msg(page)[1], str(msg(page)))
        nw.fill('newpass123'); cf.fill('different99'); btn.click(); page.wait_for_timeout(300)
        check('mismatched confirmation refused', 'do not match' in msg(page)[1], str(msg(page)))
        nw.fill('oldpass123'); cf.fill('oldpass123'); btn.click(); page.wait_for_timeout(500)
        check('same-as-old password gives a plain message', 'different' in msg(page)[1], str(msg(page)))
        nw.fill('newpass123'); cf.fill('newpass123'); btn.click(); page.wait_for_timeout(600)
        lg = log(page)
        check('current password verified BEFORE the change', [i for i, x in enumerate(lg) if x[0] == 'signIn'] and lg.index(['updateUser', '{"password":"newpass123"}']) > max(i for i, x in enumerate(lg) if x[0] == 'signIn'), str(lg))
        check('password changed message, fields cleared', 'Password changed' in msg(page)[1] and cur.input_value() == '' and nw.input_value() == '', str(msg(page)))
        page.locator('.pw-wrap button').first.click()
        check('Show/Hide toggles the field', cur.get_attribute('type') == 'text')

        # code by email
        page.get_by_role('button', name='Email me a code instead').click(); page.wait_for_timeout(400)
        check('code email requested through the existing reset flow', ['reset', 'a@test.dev'] in log(page))
        code = page.locator('input[aria-label="6-digit code"]')
        check('code form appears', code.is_visible())
        cform = page.locator('form:has(input[aria-label="6-digit code"])')
        code.fill('000000'); cform.locator('input[aria-label="New password"]').fill('another123'); cform.locator('input[aria-label="Confirm new password"]').fill('another123')
        cform.get_by_role('button', name='Set new password').click(); page.wait_for_timeout(400)
        check('wrong code: plain error', 'wrong or expired' in msg(page)[2], str(msg(page)))
        code.fill('123456'); cform.get_by_role('button', name='Set new password').click(); page.wait_for_timeout(600)
        check('right code sets the new password', ['verifyOtp', '123456', 'recovery'] in log(page) and ['updateUser', '{"password":"another123"}'] in log(page), str(log(page)[-4:]))

        # wipe flow
        wipe = page.get_by_role('button', name="Sign out and remove this device's data")
        set_status(page, {'state': 'idle', 'pending': 3, 'lastSyncedAt': None})
        wipe.click(); page.wait_for_selector('.modal')
        txt = page.locator('.modal').inner_text()
        check('unsynced changes warning offers to sync first', '3 changes' in txt and 'Sync now' in txt, txt[:120])
        page.locator('.modal button', has_text='Cancel').click(); page.wait_for_timeout(200)
        check('cancel keeps everything (no flag, no sign out)', page.evaluate("localStorage.getItem('baraha.wipeDb')") is None and not any(x[0] == 'signOut' for x in log(page)))
        set_status(page, {'state': 'idle', 'pending': 0, 'lastSyncedAt': None})
        wipe.click(); page.wait_for_selector('.modal')
        check('strong confirmation asks to type REMOVE', 'REMOVE' in page.locator('.modal').inner_text())
        page.locator('.modal input').fill('nope'); page.locator('.modal button.primary').click(); page.wait_for_timeout(300)
        check('wrong word: nothing removed', page.evaluate("localStorage.getItem('baraha.wipeDb')") is None and not any(x[0] == 'signOut' for x in log(page)))
        page.evaluate("""async () => { const store = await import('/js/core/store.js'); await store.createBattle({ title: 'Wipe Me', opponentName: 'Z' }); }""")
        before = page.evaluate("import('/js/core/store.js').then(s => s.listBattles ? s.listBattles() : s.getBattles()).then(a => a.length)")
        wipe.click(); page.wait_for_selector('.modal'); page.locator('.modal input').fill('remove')
        with page.expect_navigation(wait_until='load', timeout=15000):
            page.locator('.modal button.primary').click()
        page.wait_for_function("indexedDB.databases().then(d => d.some(x => x.name === 'baraha-user-A'))", timeout=10000)
        page.wait_for_timeout(2000)
        after = page.evaluate("import('/js/core/store.js').then(s => s.listBattles ? s.listBattles() : s.getBattles()).then(a => a.length)")
        check('REMOVE: signed out (signOut was called) and page reloaded', page.evaluate("sessionStorage.getItem('__signedOut')") == '1')
        check('REMOVE: this device\'s local data is gone', before >= 1 and after == 0, f'{before} -> {after}')
        check('REMOVE: one-time flag consumed', page.evaluate("localStorage.getItem('baraha.wipeDb')") is None)
        page.wait_for_timeout(500)

        # ================= C3: settings =================
        go(page, '#/settings', 1000)
        body = page.locator('.page').inner_text()
        for gone_text in ('Appearance', 'Editor & Shortcuts', 'About BARAHA', 'Underground Hip-Hop Studio'):
            check(f'removed: {gone_text}', gone_text not in body)
        titles = page.locator('.section-title').all_inner_texts()
        titles = [t.title() for t in titles]
        check('plain section titles, no numbering', titles == ['Rhyme Engine', 'Storage', 'Cloud Sync', 'Backup And Restore'], str(titles))
        sw = page.locator('#englishRhymesSwitch')
        check('English switch is role=switch, off by default', sw.get_attribute('role') == 'switch' and not sw.is_checked())
        geo = page.evaluate("""() => { const t = document.querySelector('.switch .track').getBoundingClientRect(); const l = document.querySelector('label[for=englishRhymesSwitch]').getBoundingClientRect();
          return { tw: t.width, th: t.height, ty: t.top + t.height / 2, ly: l.top + l.height / 2, lh: l.height, tx: t.left, lx: l.left }; }""")
        check('switch is a themed pill, 46x26', abs(geo['tw'] - 46) < 2 and abs(geo['th'] - 26) < 2, str(geo))
        check('switch sits in the same row as its label (beside, not above)', geo['tx'] > geo['lx'] and abs(geo['ty'] - geo['ly']) < geo['lh'], str(geo))
        off = page.evaluate("getComputedStyle(document.querySelector('.switch .track')).backgroundColor")
        page.locator('.switch').click(); page.wait_for_timeout(300)
        on = page.evaluate("getComputedStyle(document.querySelector('.switch .track')).backgroundColor")
        check('switch turns red when on, same setting key', sw.is_checked() and off != on and page.evaluate("import('/js/core/store.js').then(s => s.getEnglishRhymesEnabled())") is True, f'{off} -> {on}')
        page.keyboard.press('Tab'); page.locator('#englishRhymesSwitch').focus(); page.keyboard.press('Space'); page.wait_for_timeout(250)
        check('switch works with the keyboard', not sw.is_checked())
        check('storage line shows persistent storage state', 'persistent storage:' in page.locator('.card', has_text='Local Browser Database').inner_text())
        page.evaluate("navigator.storage.persist = async () => false")
        page.get_by_role('button', name='Request persistent storage').click(); page.wait_for_timeout(400)
        check('persist button reports the real (denied) result', 'did not grant' in page.locator('.toast').last.inner_text(), page.locator('.toast').last.inner_text())
        page.evaluate("navigator.storage.persist = async () => true")
        page.get_by_role('button', name='Request persistent storage').click(); page.wait_for_timeout(400)
        check('persist button reports the real (granted) result', 'granted' in page.locator('.toast').last.inner_text() and 'not' not in page.locator('.toast').last.inner_text().lower().replace('granted', ''), page.locator('.toast').last.inner_text())
        check('Backup and Restore buttons still there', all(page.get_by_role('button', name=n).count() == 1 for n in ('Export Full Backup (ZIP + Audio)', 'Export JSON Only', 'Restore from Backup (ZIP or JSON)…')))

        set_status(page, {'state': 'idle', 'pending': 4, 'lastSyncedAt': new_iso(page)})
        cs = page.locator('.sync-grid').inner_text()
        check('Cloud sync shows status, last synced, pending', 'Synced' in cs and 'just now' in cs and '4' in cs, cs)
        page.evaluate("window.addEventListener('baraha:sync-now', (e) => { window.__syncAsked = true; e.detail.promise = Promise.resolve(); })")
        page.get_by_role('button', name='Sync now').click(); page.wait_for_timeout(300)
        check('Sync now button asks the engine to sync', page.evaluate('window.__syncAsked') is True)
        set_status(page, {'state': 'offline', 'pending': 1, 'lastSyncedAt': None})
        check('Cloud sync updates live (offline)', 'Offline' in page.locator('.sync-grid').inner_text())

        page.locator('.help-btn').click(); page.wait_for_selector('.modal')
        sc = page.locator('.modal').inner_text()
        check('"?" popup lists shortcuts incl. Ctrl+click multi-select', all(k in sc for k in ('Ctrl + /', 'Ctrl + H', 'Ctrl + Shift + R', 'Alt + F', 'Ctrl + F', 'Ctrl + Z', 'Ctrl + click')), sc)
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        check('Esc closes the shortcuts popup', page.locator('.modal').count() == 0)
        page.locator('.help-btn').click(); page.locator('.modal button', has_text='Close').click(); page.wait_for_timeout(200)
        check('Close button closes it', page.locator('.modal').count() == 0)

        # ================= phones =================
        for w in (360, 390, 412):
            page.set_viewport_size({'width': w, 'height': 800})
            for route in ('#/settings', '#/profile'):
                go(page, route, 700)
                ov = page.evaluate("document.documentElement.scrollWidth - innerWidth")
                check(f'{w}px {route}: no sideways scroll', ov <= 1, str(ov))
            go(page, '#/settings', 600)
            sw_ok = page.evaluate("(() => { const t = document.querySelector('.switch').getBoundingClientRect(); return t.right <= innerWidth && t.width >= 44; })()")
            check(f'{w}px: switch fully visible', sw_ok)
            page.click('.mobile-nav-burger-btn'); page.wait_for_timeout(300)
            check(f'{w}px: drawer shows avatar + name', page.locator('#nav .account-name').is_visible())
            page.locator('#nav .account-menu-trigger').click(); page.wait_for_timeout(200)
            fits = page.evaluate("(() => { const r = document.querySelector('.account-dropdown').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; })()")
            check(f'{w}px: account dropdown fits on screen', fits)
            page.locator('.account-dropdown-item', has_text='Profile').click(); page.wait_for_timeout(500)
            check(f'{w}px: Profile reachable from the phone menu', page.evaluate('location.hash') == '#/profile')
        page.set_viewport_size({'width': 1280, 'height': 800})

        bad = [e for e in errors if 'supabase' not in e.lower()]
        check('no JS errors in the console', not bad, str(bad[:3]))
        b.close()

def new_iso(page): return page.evaluate('new Date().toISOString()')

try:
    run()
finally:
    srv.terminate()
print('\nALL PASSED' if all(results) else '\nSOME FAILED'); sys.exit(0 if all(results) else 1)
