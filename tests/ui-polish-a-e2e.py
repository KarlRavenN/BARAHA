"""UI polish A in a real browser: Back button behaviour, typeable font size (4-32), exit-focus icon.
Supabase is stubbed (no network, no login). Run: python tests/ui-polish-a-e2e.py"""
import subprocess, time, sys, os, socket, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def free_port():
    k = socket.socket(); k.bind(('127.0.0.1', 0)); p = k.getsockname()[1]; k.close(); return p
PORT = free_port()
srv = subprocess.Popen(['node', 'serve.mjs', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
URL = f'http://127.0.0.1:{PORT}/'
STUB = """
export function createClient() {
  const user = { id: 'user-A', email: 'a@test.dev', user_metadata: { display_name: 'Tester' } };
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
    results.append(bool(ok)); print(('PASS' if ok else 'FAIL'), name, extra)

def hash_of(page): return page.evaluate('location.hash')
def go(page, h, wait=700):
    page.evaluate('h => { location.hash = h; }', h); page.wait_for_timeout(wait)
def size_px(page): return page.evaluate("parseFloat(getComputedStyle(document.querySelector('.editor')).fontSize)")
def size_val(page): return page.input_value('.size-input')

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
        seed = page.evaluate("""async () => {
          const store = await import('/js/core/store.js');
          const { battle, rounds } = await store.createBattle({ title: 'Back Test', opponentName: 'Z' });
          return { id: battle.id, r1: rounds[0].id, r2: rounds[1].id };
        }""")
        W1 = f"#/battle/{seed['id']}/{seed['r1']}"; W2 = f"#/battle/{seed['id']}/{seed['r2']}"

        # ---------- A1: back button ----------
        go(page, '#/'); page.reload(); page.wait_for_timeout(1500)
        check('Wall on a fresh load: no back button (no previous page)', page.locator('.back-btn').count() == 0)

        go(page, '#/line-checker')
        check('Line Checker header has the back button', page.locator('.page-head .back-btn').count() == 1)
        icon = page.evaluate("(() => { const i = document.querySelector('.back-btn img'); return { w: i.naturalWidth, src: i.getAttribute('src'), label: i.closest('button').getAttribute('aria-label') }; })()")
        check('uses the spray-paint icon (back-48.png), loads, aria-label=Back', icon['w'] > 0 and icon['src'].endswith('assets/icons/back-48.png') and icon['label'] == 'Back', str(icon))
        page.click('.back-btn'); page.wait_for_timeout(600)
        check('Wall > Line Checker > back = Wall', hash_of(page) in ('#/', ''), hash_of(page))
        check('Wall now shows the back button (a previous page exists)', page.locator('.back-btn').count() == 1)
        page.click('.back-btn'); page.wait_for_timeout(600)
        check('back again = Line Checker (swap)', hash_of(page) == '#/line-checker', hash_of(page))

        go(page, '#/settings'); go(page, '#/line-checker')
        page.click('.back-btn'); page.wait_for_timeout(600)
        check('Settings > Line Checker > back = Settings', hash_of(page) == '#/settings', hash_of(page))

        go(page, '#/line-checker'); page.reload(); page.wait_for_timeout(1500)
        page.click('.back-btn'); page.wait_for_timeout(600)
        check('previous page survives a refresh', hash_of(page) == '#/settings', hash_of(page))

        go(page, '#/settings'); go(page, '#/battles', 900)   # redirect route
        page.click('.back-btn'); page.wait_for_timeout(600)
        check('redirects do not count as pages', hash_of(page) == '#/settings', hash_of(page))

        fresh = ctx.new_page(); fresh.goto(URL + '#/line-checker'); fresh.wait_for_timeout(2000)
        fresh.click('.back-btn'); fresh.wait_for_timeout(600)
        check('new tab with no history falls back to the parent (The Wall)', hash_of(fresh) in ('#/', ''), hash_of(fresh))
        fresh.close()

        for name, hh in [('Opponent Research', '#/opponents'), ('Line Checker', '#/line-checker'), ('Global Search', '#/search'),
                         ('Voice Inbox', '#/voice'), ('Settings', '#/settings'), ('workspace', W1)]:
            go(page, hh, 900)
            n = page.locator('#view .back-btn').count()
            check(f'{name}: exactly one back button in the header', n == 1, f'count={n}')

        go(page, '#/'); go(page, W1); go(page, W2)
        page.click('.back-btn'); page.wait_for_timeout(700)
        check('round tabs are not pages: workspace > back = Wall', hash_of(page) in ('#/', ''), hash_of(page))
        page.click('.back-btn'); page.wait_for_timeout(700)
        check('back again restores the full route incl. the round', hash_of(page) == W2, hash_of(page))

        # ---------- A2: font size ----------
        go(page, W1, 1200)
        page.wait_for_selector('.size-input')
        check('size field starts at 16 with no reset button', size_val(page) == '16' and not page.is_visible('.size-reset-btn'))
        def type_size(txt):
            page.click('.size-input'); page.keyboard.press('Control+A'); page.keyboard.type(txt); page.keyboard.press('Enter'); page.wait_for_timeout(150)
        type_size('7');   check('typing 7 + Enter applies 7px', size_px(page) == 7 and size_val(page) == '7', f'{size_px(page)}')
        check('reset button appears when size is not 16', page.is_visible('.size-reset-btn'))
        type_size('99');  check('99 snaps to 32', size_px(page) == 32 and size_val(page) == '32')
        type_size('1');   check('1 snaps to 4', size_px(page) == 4 and size_val(page) == '4')
        type_size('0');   check('0 snaps to 4', size_px(page) == 4)
        type_size('9');   page.click('.size-input'); page.keyboard.press('Control+A'); page.keyboard.press('Backspace'); page.keyboard.press('Enter'); page.wait_for_timeout(150)
        check('empty input reverts to the previous value', size_val(page) == '9' and size_px(page) == 9)
        page.click('.size-input'); page.keyboard.press('Control+A'); page.keyboard.type('abc'); page.keyboard.press('Enter'); page.wait_for_timeout(150)
        check('non-numeric input reverts (letters are not accepted)', size_val(page) == '9' and size_px(page) == 9)
        page.click('.size-input'); page.keyboard.press('ArrowUp'); page.keyboard.press('ArrowUp'); page.keyboard.press('ArrowDown')
        check('ArrowUp / ArrowDown change by 1', size_val(page) == '10' and size_px(page) == 10, size_val(page))
        page.keyboard.press('Control+A'); page.keyboard.type('25'); page.keyboard.press('Escape'); page.wait_for_timeout(150)
        check('Esc cancels the typed number', size_val(page) == '10' and size_px(page) == 10)
        type_size('4')
        check('minus is disabled at 4', page.is_disabled('.size-step-btn >> nth=0'))

        plus = page.locator('.size-step-btn').nth(1); box = plus.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); page.mouse.down(); page.wait_for_timeout(1100); page.mouse.up()
        held = size_px(page); page.wait_for_timeout(400)
        check('holding + repeats after a short delay', held >= 9, f'size after 1.1s hold = {held}')
        check('releasing stops the repeat', size_px(page) == held)
        page.click('.size-reset-btn'); page.wait_for_timeout(150)
        check('reset returns to 16 and hides itself', size_px(page) == 16 and not page.is_visible('.size-reset-btn'))

        page.click('.editor'); page.keyboard.type('hello world'); page.keyboard.press('Control+A')
        page.locator('.size-step-btn').nth(1).click(); page.wait_for_timeout(150)
        sel = page.evaluate("window.getSelection().toString()")
        check('clicking + does not steal the text selection', 'hello world' in sel and size_px(page) == 17, repr(sel))

        type_size('12'); page.wait_for_timeout(300); page.reload(); page.wait_for_selector('.size-input'); page.wait_for_timeout(1200)
        check('size is saved and restored after a reload', size_val(page) == '12' and size_px(page) == 12, size_val(page))
        type_size('16')

        # ---------- focus mode exit icon (desktop) ----------
        page.click('.ws-focus-btn'); page.wait_for_timeout(400)
        check('focus mode on', page.evaluate("document.getElementById('app').classList.contains('focus')"))
        fe = page.evaluate("(() => { const b = document.querySelector('.focus-exit'); const i = b.querySelector('img'); const l = b.querySelector('.focus-exit-label'); return { img: i && i.naturalWidth > 0, label: l && getComputedStyle(l).display !== 'none' ? l.textContent : null }; })()")
        check('desktop: exit icon + "Exit focus" label', fe['img'] and fe['label'] == 'Exit focus', str(fe))
        page.click('.size-input'); page.keyboard.type('9'); page.keyboard.press('Escape'); page.wait_for_timeout(200)
        check('Esc inside the size field cancels it and does NOT leave focus mode', page.evaluate("document.getElementById('app').classList.contains('focus')"))
        h0 = hash_of(page)
        page.click('.focus-exit'); page.wait_for_timeout(300)
        check('exit icon only leaves focus mode (no navigation)', not page.evaluate("document.getElementById('app').classList.contains('focus')") and hash_of(page) == h0)
        page.click('.ws-focus-btn'); page.wait_for_timeout(300); page.keyboard.press('Escape'); page.wait_for_timeout(300)
        check('Esc still leaves focus mode', not page.evaluate("document.getElementById('app').classList.contains('focus')"))

        # ---------- phones ----------
        for w in (390, 360):
            page.set_viewport_size({'width': w, 'height': 800}); page.wait_for_timeout(300)
            go(page, '#/line-checker', 800)
            bb = page.locator('.back-btn').bounding_box()
            check(f'{w}px: back button tap target >= 40px', bb['width'] >= 40 and bb['height'] >= 40, f"{bb['width']}x{bb['height']}")
            go(page, W1, 1200)
            type_size('20')   # reset button visible -> widest toolbar
            tops = page.evaluate("""(() => { const bar = document.querySelector('.editor-bar');
              const els = [...bar.querySelectorAll('button, .toolbar-size-control, .hl-trigger')].filter(e => e.offsetParent !== null && !e.closest('.toolbar-size-control') || e.classList.contains('toolbar-size-control'));
              const t = els.map(e => Math.round(e.getBoundingClientRect().top)); return { n: els.length, spread: Math.max(...t) - Math.min(...t), scroll: bar.scrollWidth > bar.clientWidth + 1 }; })()""")
            check(f'{w}px: tools stay on ONE row (size != 16)', tops['spread'] <= 4, str(tops))
            page.click('.ws-focus-btn'); page.wait_for_timeout(400)
            fe = page.evaluate("(() => { const b = document.querySelector('.focus-exit'); const r = b.getBoundingClientRect(); const l = b.querySelector('.focus-exit-label'); return { w: r.width, h: r.height, label: getComputedStyle(l).display }; })()")
            check(f'{w}px: exit focus is icon only and >= 40px', fe['label'] == 'none' and fe['w'] >= 40 and fe['h'] >= 40, str(fe))
            page.click('.focus-exit'); page.wait_for_timeout(300)
            type_size('16')
        page.set_viewport_size({'width': 1280, 'height': 800})

        # old text buttons are gone from the inline editors
        for f in ('drafts', 'schemes'):
            src = open(os.path.join(ROOT, 'js', 'modules', f'{f}.js'), encoding='utf-8').read()
            check(f'{f}.js: old text back button removed', 'inline-back-btn' not in src and "'← " not in src)

        bad = [e for e in errors if 'supabase' not in e.lower()]
        check('no JS errors in the console', not bad, str(bad[:3]))
        b.close()

try:
    run()
finally:
    srv.terminate()
print('\nALL PASSED' if all(results) else '\nSOME FAILED'); sys.exit(0 if all(results) else 1)
