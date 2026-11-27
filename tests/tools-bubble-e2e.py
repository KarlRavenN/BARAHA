"""Sign-up labels + email validation, wrench bubble (drag, edge tuck, tap), swipe-down sheet.
Supabase stubbed (no network, no login). Run: python tests/tools-bubble-e2e.py"""
import subprocess, time, sys, os, socket
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
k = socket.socket(); k.bind(('127.0.0.1', 0)); PORT = k.getsockname()[1]; k.close()
srv = subprocess.Popen(['node', 'serve.mjs', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
URL = f'http://127.0.0.1:{PORT}/'
STUB_AUTH = """
export function createClient() {
  const user = { id: 'user-A', email: 'a@test.dev', user_metadata: { display_name: 'Tester' } };
  return { auth: {
    getSession: async () => ({ data: { session: { user } } }),
    getUser: async () => ({ data: { user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
    signInWithPassword: async () => ({ error: null }),
  } };
}
"""
STUB_ANON = STUB_AUTH.replace("getSession: async () => ({ data: { session: { user } } })", "getSession: async () => ({ data: { session: null } })")
res = []
def chk(n, ok, x=''):
    res.append(bool(ok)); print('PASS' if ok else 'FAIL', n, x)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # ---- sign-up screen (signed out) ----
        ctx = b.new_context(viewport={'width': 390, 'height': 800}); pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        ctx.route('**/fonts.g*/**', lambda r: r.abort())
        ctx.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=STUB_ANON))
        pg.goto(URL); pg.wait_for_timeout(1500)
        pg.get_by_text('Create one').click(); pg.wait_for_timeout(400)
        labels = pg.locator('.auth-field label').all_text_contents()
        chk('labels read "Enter Rap Name:" and "Enter Email address:"', 'Enter Rap Name:' in labels and 'Enter Email address:' in labels, str(labels))
        chk('no FlipTop example placeholder', pg.locator('#display_name').get_attribute('placeholder') in (None, ''))
        pg.fill('#display_name', 'Karl'); pg.fill('#email', 'karl@gmial.com'); pg.locator('#email').blur(); pg.wait_for_timeout(150)
        hint = pg.locator('.auth-email-hint').inner_text()
        chk('typo gets "Did you mean gmail.com?"', 'gmail.com' in hint and 'Did you mean' in hint, hint)
        pg.get_by_text('Use this').click(); chk('"Use this" fixes the address', pg.input_value('#email') == 'karl@gmail.com')
        pg.fill('#email', 'karl@example-company.xyz'); pg.locator('#email').blur(); pg.fill('#password', 'longenough1'); pg.locator('form button[type=submit]').click(); pg.wait_for_timeout(300)
        chk('unknown provider blocks sign-up with a message', pg.locator('.auth-error, [role=alert]').count() > 0 and pg.locator('.auth-form').count() == 1 and 'not a supported email provider' in pg.content())
        pg.fill('#email', 'karl@yahoo.com'); pg.locator('form button[type=submit]').click(); pg.wait_for_timeout(500)
        chk('common provider goes on to the code screen', 'Check your email' in pg.content())
        ctx.close()

        # ---- phone: wrench bubble + sheet (signed in, battle open) ----
        ctx = b.new_context(viewport={'width': 390, 'height': 800}); pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        ctx.route('**/fonts.g*/**', lambda r: r.abort())
        ctx.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=STUB_AUTH))
        pg.goto(URL)
        pg.wait_for_function("indexedDB.databases().then(d => d.some(x => x.name === 'baraha-user-A'))", timeout=10000); pg.wait_for_timeout(1200)
        rid = pg.evaluate("""async()=>{const st=await import('/js/core/store.js');const {battle,rounds}=await st.createBattle({title:'Bubble Test',opponentName:'Z'});return {b:battle.id,r:rounds[0].id};}""")
        pg.evaluate(f"location.hash='#/battle/{rid['b']}/{rid['r']}'"); pg.wait_for_timeout(1500)
        bub = pg.locator('.workspace-reopen-pill.tools-bubble')
        chk('phone shows the wrench bubble (no text)', bub.is_visible() and bub.locator('img.tools-bubble-icon').count() == 1)
        chk('bubble is see-through (opacity < 1)', float(pg.evaluate("getComputedStyle(document.querySelector('.tools-bubble')).opacity")) < 0.9)
        # drag to the right edge, past it -> tucked with 25% visible
        bb = bub.bounding_box(); x0, y0 = bb['x'] + bb['width']/2, bb['y'] + bb['height']/2
        pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x0+40, y0, steps=4); pg.mouse.move(x0+420, y0, steps=10); pg.mouse.up(); pg.wait_for_timeout(400)
        chk('dragged past the right edge: tucked', 'is-tucked' in (bub.get_attribute('class') or ''))
        vis = pg.evaluate("(()=>{const r=document.querySelector('.tools-bubble').getBoundingClientRect();return Math.round(Math.min(r.right,innerWidth)-Math.max(r.left,0));})()")
        chk('tucked bubble shows about 25% (13px of 52)', 10 <= vis <= 16, f'{vis}px visible')
        bub.click(force=True); pg.wait_for_timeout(400)
        chk('tapping the sliver brings it back out (sheet stays closed)', 'is-tucked' not in (bub.get_attribute('class') or '') and pg.evaluate("document.querySelector('.workspace-supporting').classList.contains('is-collapsed')"))
        # drag normally to the middle, release -> snaps to nearer edge untucked
        bb = bub.bounding_box(); x0, y0 = bb['x'] + bb['width']/2, bb['y'] + bb['height']/2
        pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x0-200, y0, steps=8); pg.mouse.up(); pg.wait_for_timeout(400)
        left = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.tools-bubble')).left)")
        chk('released near the left edge: snapped left, fully visible', 0 <= left <= 12 and 'is-tucked' not in (bub.get_attribute('class') or ''), f'left={left}')
        pg.reload(); pg.wait_for_timeout(1500)
        left2 = pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.tools-bubble')).left)")
        chk('bubble position is remembered after reload', abs(left2 - left) < 2, f'{left2}')
        # plain tap opens the sheet
        pg.locator('.tools-bubble').click(); pg.wait_for_timeout(400)
        chk('plain tap opens the Tools sheet', not pg.evaluate("document.querySelector('.workspace-supporting').classList.contains('is-collapsed')"))
        chk('sheet close button uses the spray back arrow', pg.locator('.supporting-back-btn img').count() == 1 and pg.evaluate("document.querySelector('.supporting-back-btn img').naturalWidth") > 0)
        # swipe down a little -> stays open
        hb = pg.locator('.supporting-head').bounding_box(); sx, sy = hb['x'] + hb['width']/2, hb['y'] + hb['height']/2
        pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(sx, sy+30, steps=3)
        moving = pg.evaluate("document.querySelector('.workspace-supporting').style.transform")
        chk('dragging the head moves the sheet (even from a tab)', 'translateY' in moving, moving)
        pg.mouse.up(); pg.wait_for_timeout(400)
        chk('small swipe springs back (stays open)', not pg.evaluate("document.querySelector('.workspace-supporting').classList.contains('is-collapsed')"))
        # swipe down far -> closes with animation
        pg.mouse.move(sx, sy); pg.mouse.down(); pg.mouse.move(sx, sy+60, steps=3); pg.mouse.move(sx, sy+260, steps=8); pg.mouse.up(); pg.wait_for_timeout(600)
        chk('big swipe down closes the sheet', pg.evaluate("document.querySelector('.workspace-supporting').classList.contains('is-collapsed')"))
        chk('bubble is back after closing', bub.is_visible())
        chk('no JS errors', not errs, str(errs[:2]))
        b.close()
finally:
    srv.terminate()
print('ALL PASSED' if all(res) else 'SOME FAILED'); sys.exit(0 if all(res) else 1)
