"""UI polish B in a real browser: right-click menu (Cut/Copy/Paste, highlight section) and Ctrl multi-select.
Supabase is stubbed (no network, no login). Run: python tests/ui-polish-b-e2e.py"""
import subprocess, time, sys, os, socket
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

LINES = ['alpha bravo charlie', 'delta echo foxtrot', 'golf hotel india']
PLAIN = '\n'.join(LINES)

def go(page, h, wait=900):
    page.evaluate('h => { location.hash = h; }', h); page.wait_for_timeout(wait)

def word_box(page, word, nth=0):
    return page.evaluate("""([word, nth]) => {
      const root = document.querySelector('.editor');
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let seen = 0, n;
      while ((n = w.nextNode())) {
        let i = -1;
        while ((i = n.textContent.indexOf(word, i + 1)) !== -1) {
          if (seen++ === nth) {
            const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + word.length);
            const b = r.getBoundingClientRect();
            return { l: b.left, r: b.right, y: b.top + b.height / 2, cx: (b.left + b.right) / 2 };
          }
        }
      }
      return null; }""", [word, nth])

def drag_word(page, word, ctrl=False, nth=0):
    b = word_box(page, word, nth)
    if ctrl: page.keyboard.down('Control')
    page.mouse.move(b['l'] + 1, b['y']); page.mouse.down(); page.mouse.move(b['cx'], b['y'], steps=4)
    page.mouse.move(b['r'] - 1, b['y'], steps=4); page.mouse.up()
    if ctrl: page.keyboard.up('Control')

def right_click(page, word, nth=0):
    b = word_box(page, word, nth)
    page.mouse.click(b['cx'], b['y'], button='right'); page.wait_for_timeout(200)

def marks(page):
    return page.evaluate("[...document.querySelectorAll('.editor mark')].map(m => [m.textContent, (m.getAttribute('data-color') || '').toLowerCase(), m.style.color])")
def plain(page):
    return page.evaluate("document.querySelector('.editor').innerText.replace(/[\\uFEFF\\u200B]/g, '').replace(/\\n$/, '')")
def menu_items(page): return page.evaluate("[...document.querySelectorAll('.baraha-editor-menu .context-item')].map(b => b.querySelector('.context-label')?.textContent || b.textContent.trim())")
def menu_header(page): return page.evaluate("document.querySelector('.baraha-editor-menu .context-header')?.textContent || ''")
def menu_click(page, text):
    page.locator('.baraha-editor-menu .context-item', has_text=text).first.click(); page.wait_for_timeout(250)
def set_text(page, lines):
    page.click('.editor'); page.keyboard.press('Control+A'); page.keyboard.press('Delete')
    for i, ln in enumerate(lines):
        page.keyboard.type(ln)
        if i < len(lines) - 1: page.keyboard.press('Enter')
    page.wait_for_timeout(300)
def hl_sizes(page): return page.evaluate("CSS.highlights.has('baraha-multi') ? [...CSS.highlights.get('baraha-multi')].length : 0")
def sel_text(page): return page.evaluate('window.getSelection().toString()')
def menu_open(page): return page.locator('.baraha-editor-menu').count() == 1
def clip(page): return page.evaluate('navigator.clipboard.readText()')

def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL.rstrip('/'))
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
          const { battle, rounds } = await store.createBattle({ title: 'Menu Test', opponentName: 'Z' });
          return { id: battle.id, r1: rounds[0].id };
        }""")
        W1 = f"#/battle/{seed['id']}/{seed['r1']}"
        go(page, W1, 1500); page.wait_for_selector('.editor[contenteditable="true"]')
        set_text(page, LINES)
        check('test text typed', plain(page) == PLAIN, repr(plain(page)))

        # ================= B1: right-click menu =================
        drag_word(page, 'bravo')
        check('drag selects "bravo"', sel_text(page) == 'bravo', repr(sel_text(page)))
        right_click(page, 'bravo')
        check('custom menu opens', menu_open(page))
        items = menu_items(page)
        check('top of the menu is Cut, Copy, Paste', items[:3] == ['Cut', 'Copy', 'Paste'], str(items))
        check('"Add to Scheme Angle" and "Search Phrase in Workspace" are gone', not any('Scheme Angle' in i or 'Search Phrase' in i for i in items), str(items))
        check('rhyme actions kept', any(i.startswith('Find Rhymes') for i in items) and 'Save Selection to Rhyme Bank' in items and any('Similar Lines' in i for i in items), str(items))
        check('highlight section: Last used, More colors, Remove highlight', 'Last used' in items and 'More colors…' in items and any('Remove highlight' in i for i in items), str(items))
        check('old 6-colour "Highlight Color:" row is gone', page.locator('.context-highlight-box').count() == 0)
        check('opening the menu keeps the selection', sel_text(page) == 'bravo', repr(sel_text(page)))
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
        check('Esc closes the menu', not menu_open(page))
        right_click(page, 'bravo'); page.mouse.click(5, 400); page.wait_for_timeout(150)
        check('outside click closes the menu', not menu_open(page))

        # Last used: one click applies, selection kept, undo/redo
        right_click(page, 'bravo')
        chip = page.evaluate("getComputedStyle(document.querySelector('.context-hl-last .context-chip')).backgroundColor")
        bar = page.evaluate("getComputedStyle(document.querySelector('.hl-color-bar')).backgroundColor")
        check('menu "Last used" colour = toolbar highlight colour (same state)', chip == bar, f'{chip} vs {bar}')
        menu_click(page, 'Last used')
        m = marks(page)
        check('Last used applies the colour in one click', m == [['bravo', '#a60000', 'rgb(255, 255, 255)']], str(m))
        check('selection kept after highlighting', sel_text(page) == 'bravo', repr(sel_text(page)))
        check('highlighting did not change the text', plain(page) == PLAIN)
        page.keyboard.press('Control+z'); page.wait_for_timeout(200)
        check('Ctrl+Z undoes the highlight (one step)', marks(page) == [] and plain(page) == PLAIN, str(marks(page)))
        check('selection back on "bravo" after undo', sel_text(page) == 'bravo', repr(sel_text(page)))
        page.keyboard.press('Control+y'); page.wait_for_timeout(200)
        check('Ctrl+Y redoes it', [x[0] for x in marks(page)] == ['bravo'])
        page.keyboard.press('Control+z'); page.wait_for_timeout(200)

        # Toolbar colour pick feeds the menu (shared state) + contrast rule
        page.click('.hl-trigger'); page.wait_for_selector('.hl-popover')
        page.locator('.hl-popover .hl-grid-full .hl-swatch[title="#ffff00"]').click(); page.wait_for_timeout(200)
        check('toolbar pick (yellow) applied to the selection', marks(page) == [['bravo', '#ffff00', 'rgb(17, 17, 17)']], str(marks(page)))
        right_click(page, 'bravo')
        chip = page.evaluate("getComputedStyle(document.querySelector('.context-hl-last .context-chip')).backgroundColor")
        check('menu Last used follows the toolbar pick (yellow)', chip == 'rgb(255, 255, 0)', chip)
        rec = page.evaluate("[...document.querySelectorAll('.context-palette-row .context-swatch')].map(s => s.style.backgroundColor)")
        check('menu shows the recent colours', 'rgb(255, 255, 0)' in rec, str(rec))
        menu_click(page, 'Remove highlight')
        check('Remove highlight works', marks(page) == [] and sel_text(page) == 'bravo' and plain(page) == PLAIN)

        # More colours -> palette next to the menu
        right_click(page, 'bravo')
        mr = page.evaluate("(() => { const r = document.querySelector('.baraha-editor-menu').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top }; })()")
        menu_click(page, 'More colors')
        pop = page.locator('.hl-popover')
        check('More colors opens the full palette', pop.count() == 1 and pop.locator('.hl-grid-full').count() == 1)
        pr = pop.bounding_box()
        check('palette is placed next to the menu (desktop popover)', abs(pr['x'] - (mr['r'] + 6)) < 3 or abs(pr['x'] + pr['width'] - (mr['l'] - 6)) < 3, f"{pr} {mr}")
        pop.locator('.hl-grid-full .hl-swatch[title="#4a86e8"]').click(); page.wait_for_timeout(250)
        check('palette colour applied, selection kept', marks(page) == [['bravo', '#4a86e8', 'rgb(255, 255, 255)']] and sel_text(page) == 'bravo', str(marks(page)))
        page.keyboard.press('Control+z'); page.wait_for_timeout(150)

        # Menu stays on screen
        page.set_viewport_size({'width': 1100, 'height': 520}); page.wait_for_timeout(400)
        right_click(page, 'alpha')
        rr = page.evaluate("(() => { const m = document.querySelector('.baraha-editor-menu'); if (!m) return null; const r = m.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; })()")
        check('menu stays inside a short window (taller than the window, scrolls)', rr and rr['l'] >= 0 and rr['t'] >= 0 and rr['r'] <= rr['w'] and rr['b'] <= rr['h'], str(rr))
        page.keyboard.press('Escape')
        page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)

        # No selection: menu still opens, Cut/Copy disabled, Paste available
        page.click('.editor'); page.keyboard.press('Control+End')
        eb = page.locator('.editor').bounding_box()
        page.mouse.click(eb['x'] + 200, eb['y'] + eb['height'] - 30, button='right'); page.wait_for_timeout(200)
        dis = page.evaluate("[...document.querySelectorAll('.baraha-editor-menu .context-item')].map(b => [b.querySelector('.context-label').textContent, b.disabled])")
        check('no selection: Cut/Copy disabled, Paste enabled', dis[:3] == [['Cut', True], ['Copy', True], ['Paste', False]] and len(dis) == 3, str(dis))
        page.keyboard.press('Escape')

        # Copy / Cut / Paste through the menu
        drag_word(page, 'charlie'); right_click(page, 'charlie'); menu_click(page, 'Copy')
        check('menu Copy puts the text on the clipboard, selection kept', clip(page) == 'charlie' and sel_text(page) == 'charlie', repr(clip(page)))
        drag_word(page, 'foxtrot'); right_click(page, 'foxtrot'); menu_click(page, 'Cut')
        check('menu Cut copies and removes', clip(page) == 'foxtrot' and 'foxtrot' not in plain(page), repr(plain(page)))
        page.keyboard.press('Control+z'); page.wait_for_timeout(200)
        check('Ctrl+Z undoes the cut', plain(page) == PLAIN, repr(plain(page)))
        page.evaluate("navigator.clipboard.writeText('<b>x</b> zulu')")
        page.click('.editor'); page.keyboard.press('Control+End')
        eb = page.locator('.editor').bounding_box()
        page.mouse.click(eb['x'] + 300, eb['y'] + eb['height'] - 30, button='right'); page.wait_for_timeout(200)
        menu_click(page, 'Paste')
        check('menu Paste inserts as PLAIN text (no markup)', plain(page).endswith('<b>x</b> zulu') and page.locator('.editor b').count() == 0, repr(plain(page)))
        page.keyboard.press('Control+z'); page.wait_for_timeout(200)
        check('Ctrl+Z undoes the paste', plain(page) == PLAIN, repr(plain(page)))
        page.evaluate("() => { navigator.clipboard.readText = () => Promise.reject(new DOMException('no', 'NotAllowedError')); }")
        right_click(page, 'golf'); menu_click(page, 'Paste')
        toast = page.evaluate("document.getElementById('toasts').textContent")
        check('denied clipboard shows a "use Ctrl+V" toast', 'Ctrl+V' in toast, toast)
        check('text untouched by the denied paste', plain(page) == PLAIN)

        # ================= B2: Ctrl multi-select =================
        page.reload(); page.wait_for_selector('.editor[contenteditable="true"]'); page.wait_for_timeout(900)
        check('text reloaded intact', plain(page) == PLAIN, repr(plain(page)))
        drag_word(page, 'alpha'); drag_word(page, 'echo', ctrl=True); drag_word(page, 'india', ctrl=True)
        check('three selections: two extras drawn with CSS.highlights', hl_sizes(page) == 2, str(hl_sizes(page)))
        check('the browser keeps the last piece as its own selection', sel_text(page) == 'india', repr(sel_text(page)))
        check('saved HTML has no selection artefacts', 'baraha-multi' not in page.evaluate("document.querySelector('.editor').innerHTML") and plain(page) == PLAIN)
        right_click(page, 'echo')
        check('right-click on an extra piece opens the menu with the count', menu_open(page) and menu_header(page) == '3 selections', menu_header(page))
        items = menu_items(page)
        check('multi menu hides single-word "Find Rhymes", offers "Save 3 Selections..."', not any(i.startswith('Find Rhymes') for i in items) and any('Save 3 Selections' in i for i in items), str(items))
        menu_click(page, 'Last used')
        m = marks(page)
        check('Last used highlights ALL three pieces', [x[0] for x in m] == ['alpha', 'echo', 'india'], str(m))
        check('text unchanged after the multi highlight', plain(page) == PLAIN)
        check('all three pieces still selected after highlighting', hl_sizes(page) == 2 and sel_text(page) == 'india')
        page.keyboard.press('Control+z'); page.wait_for_timeout(250)
        check('ONE Ctrl+Z removes all three highlights', marks(page) == [] and plain(page) == PLAIN, str(marks(page)))
        check('undo brings the three selections back', hl_sizes(page) == 2 and sel_text(page) == 'india', f'{hl_sizes(page)} {sel_text(page)!r}')
        page.keyboard.press('Control+y'); page.wait_for_timeout(250)
        check('Ctrl+Y puts all three back', [x[0] for x in marks(page)] == ['alpha', 'echo', 'india'])
        page.keyboard.press('Control+z'); page.wait_for_timeout(250)

        # toolbar button applies to all
        drag_word(page, 'alpha'); drag_word(page, 'echo', ctrl=True); drag_word(page, 'india', ctrl=True)
        page.click('.hl-trigger'); page.wait_for_selector('.hl-popover')
        page.locator('.hl-popover .hl-grid-full .hl-swatch[title="#ff9900"]').click(); page.wait_for_timeout(250)
        check('toolbar highlight button applies to all pieces', [(x[0], x[1]) for x in marks(page)] == [('alpha', '#ff9900'), ('echo', '#ff9900'), ('india', '#ff9900')], str(marks(page)))
        # Remove from all, via menu
        right_click(page, 'alpha'); menu_click(page, 'Remove highlight')
        check('Remove highlight clears all pieces', marks(page) == [] and plain(page) == PLAIN, str(marks(page)))
        # Ctrl+H on all
        page.keyboard.press('Control+h'); page.wait_for_timeout(250)
        check('Ctrl+H highlights all pieces', [x[0] for x in marks(page)] == ['alpha', 'echo', 'india'], str(marks(page)))
        page.keyboard.press('Control+z'); page.wait_for_timeout(200)

        # copy
        page.evaluate("navigator.clipboard.writeText('old')")
        page.keyboard.press('Control+c'); page.wait_for_timeout(250)
        check('Ctrl+C copies all pieces joined by newlines, in document order', clip(page) == 'alpha\necho\nindia', repr(clip(page)))
        check('copy keeps the selections', hl_sizes(page) == 2)
        # menu copy (order check: select out of order)
        page.mouse.click(5, 400); page.wait_for_timeout(100)
        drag_word(page, 'india'); drag_word(page, 'alpha', ctrl=True)
        right_click(page, 'india'); menu_click(page, 'Copy')
        check('menu Copy joins in DOCUMENT order even when selected out of order', clip(page) == 'alpha\nindia', repr(clip(page)))
        page.keyboard.press('Escape')

        # cut
        page.mouse.click(5, 400); drag_word(page, 'alpha'); drag_word(page, 'echo', ctrl=True); drag_word(page, 'india', ctrl=True)
        page.keyboard.press('Control+x'); page.wait_for_timeout(300)
        check('Ctrl+X cuts all pieces', clip(page) == 'alpha\necho\nindia' and plain(page) == ' bravo charlie\ndelta  foxtrot\ngolf hotel ', repr(plain(page)))
        check('cut leaves no stale selections', hl_sizes(page) == 0)
        page.keyboard.press('Control+z'); page.wait_for_timeout(250)
        check('ONE Ctrl+Z restores all three cut pieces', plain(page) == PLAIN, repr(plain(page)))
        # delete
        page.mouse.click(5, 400); drag_word(page, 'bravo'); drag_word(page, 'foxtrot', ctrl=True)
        page.keyboard.press('Delete'); page.wait_for_timeout(300)
        check('Delete removes all pieces', plain(page) == 'alpha  charlie\ndelta echo \ngolf hotel india', repr(plain(page)))
        page.keyboard.press('Control+z'); page.wait_for_timeout(250)
        check('ONE Ctrl+Z restores the deleted pieces', plain(page) == PLAIN, repr(plain(page)))
        # delete via menu with highlighted text (marks get cleaned)
        page.mouse.click(5, 400); drag_word(page, 'alpha'); page.keyboard.press('Control+h'); page.wait_for_timeout(200)
        drag_word(page, 'alpha'); drag_word(page, 'golf', ctrl=True)
        page.keyboard.press('Backspace'); page.wait_for_timeout(300)
        check('Backspace deletes all pieces and leaves no empty <mark>', plain(page) == ' bravo charlie\ndelta echo foxtrot\n hotel india' and page.locator('.editor mark').count() == 0, repr(plain(page)))
        page.keyboard.press('Control+z'); page.wait_for_timeout(250); page.keyboard.press('Control+z'); page.wait_for_timeout(250)
        check('undo steps return to the original text', plain(page) == PLAIN and marks(page) == [], f'{plain(page)!r} {marks(page)}')

        # ways to clear
        drag_word(page, 'alpha'); drag_word(page, 'echo', ctrl=True)
        check('2 selections active', hl_sizes(page) == 1)
        page.mouse.click(5, 400); page.wait_for_timeout(100)
        b0 = word_box(page, 'delta'); page.mouse.click(b0['cx'], b0['y']); page.wait_for_timeout(150)
        check('a normal click clears the extra selections', hl_sizes(page) == 0)
        drag_word(page, 'alpha'); drag_word(page, 'echo', ctrl=True); page.keyboard.press('Escape'); page.wait_for_timeout(150)
        check('Esc clears the extra selections', hl_sizes(page) == 0)
        drag_word(page, 'alpha'); drag_word(page, 'echo', ctrl=True); page.keyboard.type('Z'); page.wait_for_timeout(200)
        check('typing a character clears them (and only the last piece is replaced)', hl_sizes(page) == 0 and plain(page).startswith('alpha bravo charlie\ndelta Z foxtrot'), repr(plain(page)))
        page.keyboard.press('Control+z'); page.wait_for_timeout(250)
        check('typing over one piece is undoable', plain(page) == PLAIN, repr(plain(page)))
        # Esc with extras must not leave focus mode
        page.click('.ws-focus-btn'); page.wait_for_timeout(400)
        drag_word(page, 'alpha'); drag_word(page, 'echo', ctrl=True); page.keyboard.press('Escape'); page.wait_for_timeout(200)
        check('Esc clears selections first and does NOT leave focus mode', hl_sizes(page) == 0 and page.evaluate("document.getElementById('app').classList.contains('focus')"))
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        check('a second Esc leaves focus mode', not page.evaluate("document.getElementById('app').classList.contains('focus')"))
        # selecting words overlapping an earlier piece must merge, not double
        drag_word(page, 'alpha'); drag_word(page, 'alpha', ctrl=True); drag_word(page, 'hotel', ctrl=True)
        right_click(page, 'hotel')
        check('re-selecting the same piece does not count twice', menu_header(page) == '2 selections', menu_header(page))
        page.keyboard.press('Escape')

        # normal typing undo still works as before
        page.mouse.click(5, 400); page.click('.editor'); page.keyboard.press('Control+End'); page.keyboard.type(' typing test')
        page.wait_for_timeout(1200); page.keyboard.type(' more')
        page.keyboard.press('Control+z'); page.wait_for_timeout(200)
        check('typing is undone in steps (pause = new step)', plain(page).endswith('india typing test'), repr(plain(page)))
        page.keyboard.press('Control+z'); page.wait_for_timeout(200)
        check('second undo removes the first typing burst', plain(page) == PLAIN, repr(plain(page)))
        page.click('.toolbar-redo-btn'); page.wait_for_timeout(200)
        check('toolbar Redo button works', plain(page).endswith('india typing test'))
        page.click('.toolbar-undo-btn'); page.wait_for_timeout(200)
        check('toolbar Undo button works', plain(page) == PLAIN)

        # saved text: highlights persist, selections do not
        drag_word(page, 'bravo'); drag_word(page, 'hotel', ctrl=True); page.keyboard.press('Control+h'); page.wait_for_timeout(1500)
        page.reload(); page.wait_for_selector('.editor[contenteditable="true"]'); page.wait_for_timeout(900)
        check('highlights are saved and reload correctly', [x[0] for x in marks(page)] == ['bravo', 'hotel'] and plain(page) == PLAIN, str(marks(page)))
        check('no selection artefacts after reload', hl_sizes(page) == 0)

        # ================= fallback overlay (no CSS Custom Highlight API) =================
        fb = ctx.new_page()
        fb.add_init_script("delete window.Highlight;")
        fb.on('pageerror', lambda e: errors.append('fallback: ' + str(e)))
        fb.goto(URL + W1); fb.wait_for_selector('.editor[contenteditable="true"]'); fb.wait_for_timeout(900)
        drag_word(fb, 'alpha'); drag_word(fb, 'echo', ctrl=True); drag_word(fb, 'india', ctrl=True)
        boxes = fb.evaluate("[...document.querySelectorAll('.multi-select-box')].length")
        check('fallback: overlay boxes drawn when CSS.highlights is unsupported', boxes >= 2, str(boxes))
        bb = fb.evaluate("(() => { const bx = document.querySelector('.multi-select-box').getBoundingClientRect(); return [bx.left, bx.top, bx.width, bx.height]; })()")
        wb = word_box(fb, 'alpha')
        check('fallback: first box sits on "alpha"', abs(bb[0] - wb['l']) < 3 and abs((bb[1] + bb[3] / 2) - wb['y']) < 4, f'{bb} {wb}')
        right_click(fb, 'echo'); menu_click(fb, 'Remove highlight')
        fb.keyboard.press('Escape'); fb.wait_for_timeout(150)
        check('fallback: overlay removed when selections clear', fb.evaluate("document.querySelectorAll('.multi-select-box').length") == 0)
        fb.close()

        # ================= phones: menu fits, no multi-select button =================
        for w in (360, 390, 412):
            page.set_viewport_size({'width': w, 'height': 780}); page.wait_for_timeout(300)
            page.evaluate("(() => { const e = document.querySelector('.editor'); e.focus(); const r = document.createRange(); r.selectNodeContents(e); getSelection().removeAllRanges(); getSelection().addRange(r); })()")
            page.evaluate("() => document.querySelector('.editor').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: innerWidth - 8, clientY: innerHeight - 8 }))"); page.wait_for_timeout(250)
            rr = page.evaluate("(() => { const m = document.querySelector('.baraha-editor-menu'); const r = m.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, minItem: Math.min(...[...m.querySelectorAll('.context-item')].map(i => i.getBoundingClientRect().height)) }; })()")
            check(f'{w}px: menu fits on screen', rr['l'] >= 0 and rr['t'] >= 0 and rr['r'] <= rr['w'] and rr['b'] <= rr['h'], str(rr))
            menu_click(page, 'More colors')
            sheet = page.evaluate("document.querySelector('.hl-popover')?.classList.contains('is-sheet')")
            check(f'{w}px: "More colors" opens the bottom sheet', sheet is True)
            page.keyboard.press('Escape'); page.wait_for_timeout(200)
            check(f'{w}px: no "add another selection" button', page.locator('text=/add another selection/i').count() == 0)
        page.set_viewport_size({'width': 1280, 'height': 800})

        # Drafts / Schemes editors use the same menu code
        for f in ('drafts', 'schemes'):
            src = open(os.path.join(ROOT, 'js', 'modules', f'{f}.js'), encoding='utf-8').read()
            check(f'{f}.js uses the shared editor menu, old swatch list removed', 'showEditorMenu' in src and 'openContextMenu' not in src)
        te = open(os.path.join(ROOT, 'js', 'components', 'text-editor.js'), encoding='utf-8').read()
        check('dead code removed: no schemeFormDialog / "Search Phrase" in text-editor.js', 'schemeFormDialog' not in te and 'Search Phrase' not in te and 'Scheme Angle' not in te)

        bad = [e for e in errors if 'supabase' not in e.lower()]
        check('no JS errors in the console', not bad, str(bad[:3]))
        b.close()

try:
    run()
finally:
    srv.terminate()
print('\nALL PASSED' if all(results) else '\nSOME FAILED'); sys.exit(0 if all(results) else 1)
