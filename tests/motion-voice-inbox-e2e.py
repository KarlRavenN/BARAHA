"""Motion polish + Voice Inbox in a real browser (fake microphone).
Supabase is stubbed (no network, no login). Run: python tests/motion-voice-inbox-e2e.py"""
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

def run():
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 800}, permissions=['microphone'])
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        ctx.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body=STUB))
        ctx.route('**/fonts.g*/**', lambda r: r.abort())
        page.goto(URL); page.wait_for_timeout(1200)

        # --- Voice Inbox: empty state
        page.evaluate("location.hash = '#/voice'"); page.wait_for_timeout(800)
        check('nav item exists', page.locator('#nav .nav-link', has_text='Voice Inbox').count() == 1)
        check('empty state text', page.locator('.empty-state-title', has_text='No voice recordings yet.').count() == 1)
        check('empty state button', page.locator('button', has_text='Record your first voice memo').count() == 1)

        # --- record via the empty-state button, then stop
        page.locator('button', has_text='Record your first voice memo').click(); page.wait_for_timeout(1800)
        check('recording started (Stop visible)', page.locator('.recorder-box button', has_text='Stop').is_visible())
        page.locator('.recorder-box button', has_text='Stop').click(); page.wait_for_timeout(1200)
        cards = page.locator('.voice-inbox-card')
        check('recording auto-appears in inbox', cards.count() == 1)
        check('duration shown', page.locator('.voice-inbox-card .tag').first.inner_text() != '')
        check('battle label shown', 'No battle' in cards.first.inner_text())

        # --- player
        cards.first.locator('.vp-play').click(); page.wait_for_timeout(600)
        check('play -> Pause label', cards.first.locator('.vp-play').inner_text() == 'Pause')
        cards.first.locator('.vp-play').click(); page.wait_for_timeout(200)
        check('pause -> Play label', cards.first.locator('.vp-play').inner_text() == 'Play')
        cards.first.locator('.vp-play').click(); page.wait_for_timeout(300)
        cards.first.locator('.vp-stop').click(); page.wait_for_timeout(200)
        check('stop resets', cards.first.locator('.vp-play').inner_text() == 'Play' and cards.first.locator('.vp-stop').is_disabled())

        # --- create a battle, record inside it, check it shows up in inbox with battle name
        bid = page.evaluate("""async () => { const s = await import('/js/core/store.js'); const {battle} = await s.createBattle({title:'Zed vs Alpha', opponentName:'Alpha'}); return battle.id; }""")
        page.evaluate("id => { location.hash = '#/battle/' + id + '/1/voice'; }", bid); page.wait_for_timeout(1000)
        page.evaluate("""async (id) => { const s = await import('/js/core/store.js'); await s.createVoiceNote({title:'Battle take', durationMs: 95000, battleId: id, blob: new Blob(['x'],{type:'audio/webm'}), mimeType:'audio/webm'}); }""", bid)
        page.evaluate("location.hash = '#/voice'"); page.wait_for_timeout(900)
        check('battle recording synced into inbox', page.locator('.voice-inbox-card', has_text='Battle take').count() == 1)
        check('associated battle name shown', page.locator('.voice-inbox-card', has_text='Zed vs Alpha').count() == 1)
        check('two recordings total', page.locator('.voice-inbox-card').count() == 2)

        # --- search
        page.fill('.voice-inbox-toolbar input[type=search]', 'zed'); page.wait_for_timeout(400)
        check('search by battle name', page.locator('.voice-inbox-card').count() == 1)
        page.fill('.voice-inbox-toolbar input[type=search]', 'battle take'); page.wait_for_timeout(400)
        check('search by recording name', page.locator('.voice-inbox-card').count() == 1)
        page.fill('.voice-inbox-toolbar input[type=search]', ''); page.wait_for_timeout(400)

        # --- sort
        def first_title(): return page.locator('.voice-inbox-card .cassette-title').first.inner_text()
        page.select_option('.voice-inbox-toolbar select', 'duration'); page.wait_for_timeout(400)
        check('sort Duration', first_title() == 'Battle take')
        page.select_option('.voice-inbox-toolbar select', 'oldest'); page.wait_for_timeout(400)
        check('sort Oldest', first_title().startswith('Voice memo'))
        page.select_option('.voice-inbox-toolbar select', 'newest'); page.wait_for_timeout(400)
        check('sort Newest', first_title() == 'Battle take')
        page.select_option('.voice-inbox-toolbar select', 'battle'); page.wait_for_timeout(400)
        check('sort Battle (battle first, none last)', first_title() == 'Battle take')

        # --- rename
        page.locator('.voice-inbox-card', has_text='Battle take').locator('button', has_text='Rename').click(); page.wait_for_timeout(400)
        page.fill('.modal input[aria-label=Name]', 'Renamed take'); page.locator('.modal button.primary').click(); page.wait_for_timeout(700)
        check('rename works', page.locator('.voice-inbox-card', has_text='Renamed take').count() == 1)
        check('modal closed after animation', page.locator('.scrim').count() == 0)

        # --- download
        with page.expect_download(timeout=4000) as dl:
            page.locator('.voice-inbox-card', has_text='Renamed take').locator('button', has_text='Download').click()
        check('download works', dl.value.suggested_filename.startswith('Renamed take'))

        # --- delete w/ confirmation also removes original
        page.locator('.voice-inbox-card', has_text='Renamed take').locator('button', has_text='Delete').click(); page.wait_for_timeout(400)
        check('confirm dialog shown', page.locator('.modal h2', has_text='Delete recording?').count() == 1)
        page.locator('.modal button', has_text='Cancel').click(); page.wait_for_timeout(400)
        check('cancel keeps recording', page.locator('.voice-inbox-card').count() == 2)
        page.locator('.voice-inbox-card', has_text='Renamed take').locator('button', has_text='Delete').click(); page.wait_for_timeout(400)
        page.locator('.modal button.primary').click(); page.wait_for_timeout(800)
        check('delete removes from inbox', page.locator('.voice-inbox-card').count() == 1)
        left = page.evaluate("""async () => { const s = await import('/js/core/store.js'); return (await s.getVoiceNotes()).length; }""")
        check('delete removed the original in the store', left == 1)

        # --- per-battle Voice Notes tab still works (recorder reused)
        page.evaluate("id => { location.hash = '#/battle/' + id + '/1/voice'; }", bid); page.wait_for_timeout(1000)
        check('battle voice tab has recorder', page.locator('.recorder-box').count() == 1)
        page.locator('.recorder-box button', has_text='Record Mic').click(); page.wait_for_timeout(1500)
        page.locator('.recorder-box button', has_text='Stop').click(); page.wait_for_timeout(1200)
        check('battle tab saved a take', page.locator('.voice-note-card').count() == 1)
        page.evaluate("location.hash = '#/voice'"); page.wait_for_timeout(900)
        check('battle-tab take appears in inbox with battle name', page.locator('.voice-inbox-card', has_text='Zed vs Alpha').count() == 1)

        # --- motion
        check('motion.css loaded', page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--m-base').trim()") == '200ms')
        page.evaluate("window.__t = (() => { const t = document.createElement('div'); document.getElementById('toasts').append(t); t.remove(); })()")
        page.evaluate("""async () => { const u = await import('/js/core/ui.js'); u.toast('hello'); }""")
        page.wait_for_timeout(60)
        anim = page.evaluate("getComputedStyle(document.querySelector('.toast')).animationName")
        check('toast has entry animation', anim == 'm-toast-in', anim)
        page.evaluate("location.hash = '#/'"); page.wait_for_timeout(100)
        check('page content animates, nav does not', page.evaluate("document.getElementById('view').classList.contains('page-enter') && getComputedStyle(document.getElementById('nav')).animationName === 'none'"))
        page.wait_for_timeout(900)
        check('page-enter class cleaned up', not page.evaluate("document.getElementById('view').classList.contains('page-enter')"))
        # reduced motion
        page.emulate_media(reduced_motion='reduce')
        page.evaluate("""async () => { const u = await import('/js/core/ui.js'); const el = document.createElement('div'); el.id='rm'; document.body.append(el); u.removeAnimated(el); }""")
        check('reduced motion removes instantly', page.locator('#rm').count() == 0)

        # --- mobile layout
        page.set_viewport_size({'width': 390, 'height': 800})
        page.evaluate("location.hash = '#/voice'"); page.wait_for_timeout(900)
        check('mobile: no horizontal scroll', page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
        page.screenshot(path='/tmp/voice-inbox-mobile.png')
        page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
        page.screenshot(path='/tmp/voice-inbox-desktop.png')

        check('no console errors', not errors, str(errors[:3]))
        b.close()

try:
    run()
finally:
    srv.terminate()
print(f'{sum(results)}/{len(results)} passed')
sys.exit(0 if all(results) else 1)
