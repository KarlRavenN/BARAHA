"""End-to-end browser test for BARAHA Phase 5 (Text Highlighting, Local Rhyme Engine Repair & Writing Enhancements).
Requires: python3 + playwright + Chrome/Chromium binary.
Run:  python tests/e2e.py   (starts its own server on port 5198)
"""
import os, subprocess, sys, time, json, shutil, socket
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)
from playwright.sync_api import sync_playwright

def get_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port

PORT = get_free_port()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = f"http://127.0.0.1:{PORT}/"
results = []

def find_chrome():
    if "CHROME_PATH" in os.environ and os.path.exists(os.environ["CHROME_PATH"]):
        return os.environ["CHROME_PATH"]
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def editor_ready(page, round_no=None, kind="Final material"):
    """Wait for the editor of the given round to be mounted and loaded."""
    if round_no is None:
        page.wait_for_selector(".editor:not([aria-disabled='true'])")
    else:
        page.wait_for_selector(f".editor[aria-label='{kind}, round {round_no}']:not([aria-disabled='true'])")

def get_editor_text(page):
    return page.evaluate("() => document.querySelector('.editor') ? document.querySelector('.editor').innerText.replace(/\\r/g, '').trim() : ''")

def get_editor_html(page):
    return page.evaluate("() => document.querySelector('.editor') ? document.querySelector('.editor').innerHTML : ''")

def check(name, cond, detail=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""), flush=True)

srv_cmd = ["node", "serve.mjs", str(PORT)] if shutil.which("node") else [sys.executable, "serve.py", str(PORT)]
srv = subprocess.Popen(srv_cmd, cwd=ROOT, stdout=subprocess.DEVNULL)
time.sleep(1.5)
try:
    chrome_bin = find_chrome()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=chrome_bin, args=["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        ctx = b.new_context(accept_downloads=True, permissions=["microphone"])
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(URL)
        page.wait_for_selector("text=Dashboard")
        check("app boots, dashboard renders", page.locator("h1").inner_text() == "Dashboard")

        # create battle via dashboard quick-create
        page.click("text=New battle")
        page.fill(".modal input >> nth=0", "Test Battle")
        page.fill(".modal input >> nth=1", "Rival")
        page.click("button:has-text('Create battle')")
        page.wait_for_selector(".editor:not([aria-disabled='true'])")
        check("creating a battle opens workspace round 1", "/1/final" in page.url or "/1" in page.url)
        check("three round tabs", page.locator(".workspace-round-tabs .tab").count() == 3)

        # verify Studio layout
        check("workspace split container present", page.locator(".workspace-split").is_visible())
        check("Workspace A (Final Material) present", page.locator(".workspace-main").is_visible())
        check("Workspace B (Supporting Workspace) present", page.locator(".workspace-supporting").is_visible())
        check("Resizable divider present", page.locator("#workspaceDivider").is_visible())
        check("Round Notes completely removed from workspace tabs", page.locator("text=Round Notes").count() == 0)

        # type Taglish with odd spacing; autosave; verify state wording
        raw = "  Ang yabang mo pre,, wla ka namang bars!!  \n\n\tsakin ka mag-aral...  "
        page.click(".editor")
        page.locator(".editor").fill(raw)
        check("shows unsaved state right after typing", "Unsaved" in page.locator(".save-state").inner_text() or "Saving" in page.locator(".save-state").inner_text())
        page.wait_for_function("document.querySelector('.save-state').textContent==='Saved'", timeout=5000)
        check("autosave reaches Saved", True)
        check("counts shown", "words" in page.locator(".editor-foot").inner_text())

        # write different text in round 2 and switch quickly (flush on leave)
        page.click("a.tab:has-text('Round 2')")
        editor_ready(page, 2)
        check("round 2 starts empty", get_editor_text(page) == "")
        page.locator(".editor").fill("round two text")
        page.click("a.tab:has-text('Round 1')")   # switch immediately, before debounce fires
        editor_ready(page, 1)
        check("round 1 text preserved byte-for-byte", get_editor_text(page) == raw.strip())
        page.click("a.tab:has-text('Round 2')")
        editor_ready(page, 2)
        check("round 2 text flushed on quick switch", get_editor_text(page) == "round two text")

        # persistence across reload (real IndexedDB)
        page.reload()
        page.wait_for_selector(".editor:not([aria-disabled='true'])")
        check("data survives reload", get_editor_text(page) == "round two text")
        page.click("a.tab:has-text('Round 1')")
        editor_ready(page, 1)
        check("round 1 survives reload", get_editor_text(page) == raw.strip())

        # no autocorrect attrs
        ed = page.locator(".editor")
        check("editor disables spellcheck/autocorrect", ed.get_attribute("spellcheck") == "false" and ed.get_attribute("autocorrect") == "off")

        # focus mode
        page.keyboard.press("Alt+f")
        check("focus mode hides nav", not page.locator("#nav").is_visible())
        page.keyboard.press("Escape")
        check("Escape exits focus mode", page.locator("#nav").is_visible())

        # Phase 4 Simplified Supporting Tools: 3 tabs (Drafts, Schemes, Voice Notes) - Rhyme Bank docked under editor
        check("supporting workspace has 3 tabs", page.locator(".supporting-tab").count() == 3)
        page.click(".supporting-tab:has-text('Drafts')")
        page.wait_for_selector("button:has-text('New Draft')")
        check("Drafts tab mounted inside Workspace B", page.locator("button:has-text('New Draft')").is_visible())
        check("Final Material remains mounted alongside Drafts", page.locator(".editor").is_visible())

        # Create Draft Idea INLINE (NO MODAL)
        page.click("button:has-text('New Draft')")
        page.wait_for_selector(".inline-editor")
        check("New Draft opens inline editor directly in panel (no modal)", page.locator(".inline-editor").is_visible() and page.locator(".modal").count() == 0)
        check("Inline draft editor has Category & Status dropdowns at top", page.locator(".inline-meta-bar select").count() == 2)
        check("Status dropdown has only 2 options: In Progress and Done", page.locator("select[aria-label='Draft status'] option").count() == 2)

        page.fill("input[aria-label='Draft title']", "Card Angle Setup")
        page.fill("[aria-label='Draft content']", "Bawat bara ko alas sa lamesa\nPangalawang linya na dapat hindi sumama sa preview")
        check("manual Save Draft button removed (autosave-first)", page.locator("button:has-text('Create Draft'), button:has-text('Save Draft')").count() == 0)
        check("redundant actions removed from draft (Append, Insert, Link)", page.locator("button:has-text('Append to Final'), button:has-text('Insert Cursor'), button:has-text('Link Scheme')").count() == 0)
        page.wait_for_timeout(900)
        page.click("button:has-text('Drafts')")
        page.wait_for_selector(".draft-card")
        check("draft saved via autosave and returned to simplified draft card", page.locator(".draft-card").first.is_visible())

        # Verify simplified draft card structure: title, 1-line preview, status dropdown ONLY
        draft_card = page.locator(".draft-card").first
        check("draft card has title", "Card Angle Setup" in draft_card.locator(".draft-card-title").inner_text())
        check("draft card preview shows ONLY first line", "Bawat bara ko alas sa lamesa" in draft_card.locator(".draft-card-preview").inner_text() and "Pangalawang linya" not in draft_card.locator(".draft-card-preview").inner_text())
        check("draft card has independent status select", draft_card.locator(".draft-status-select").is_visible())
        check("no clutter buttons on card (no Edit, Append, Delete, Link buttons)", draft_card.locator("button").count() == 0)

        # Independent status change on card without opening editor
        draft_card.locator(".draft-status-select").select_option("Done")
        page.wait_for_timeout(300)
        check("changing status stays on list and does not open editor", page.locator(".draft-card").first.is_visible() and page.locator(".inline-editor").count() == 0)

        # Click draft card to open inline editor
        draft_card.click()
        page.wait_for_selector(".inline-editor")
        check("clicking card opens inline editor", page.locator(".inline-editor").is_visible())
        check("status inside editor reflects Done", page.locator("select[aria-label='Draft status']").input_value() == "Done")
        check("Append to Final button is removed from editor", page.locator("button:has-text('Append to Final')").count() == 0)

        # Test Back button returns to list
        page.click("button:has-text('Drafts')")
        page.wait_for_selector(".draft-card")
        check("Back button returns to Drafts list", page.locator(".draft-card").first.is_visible())

        # Phase 4 Simplified Schemes Tab: Inline editor, cleaner cards, no status field, flow recording
        page.click(".supporting-tab:has-text('Schemes')")
        page.wait_for_selector("button:has-text('New Scheme')")
        check("Schemes tab active without unmounting editor", page.locator(".editor").is_visible())

        # Click New Scheme -> Opens inline editor (NO MODAL)
        page.click("button:has-text('New Scheme')")
        page.wait_for_selector(".inline-editor")
        check("New Scheme opens inline editor (no modal)", page.locator(".inline-editor").is_visible() and page.locator(".modal").count() == 0)
        check("Scheme has NO status field in normal workflow", page.locator("select[aria-label='Scheme status']").count() == 0)

        page.fill("input[aria-label='Scheme title']", "Playing Card Scheme")
        page.fill("input[aria-label='Scheme topic']", "Casino")
        page.fill("input[aria-label='Scheme angle']", "Point of attack with aces")
        page.fill("[aria-label='Draft sequence bars']", "Isang bala, isang kahon ng baraha")
        check("manual Save Scheme button removed (autosave-first)", page.locator("button:has-text('Create Scheme'), button:has-text('Save Scheme')").count() == 0)
        check("redundant actions removed from scheme (Append, Insert)", page.locator("button:has-text('Append to Final'), button:has-text('Insert Cursor')").count() == 0)
        page.wait_for_timeout(900)
        page.click("button:has-text('Schemes')")
        page.wait_for_selector(".scheme-card")
        check("scheme saved via autosave and returned to list", page.locator(".scheme-card").first.is_visible())

        # Verify simplified scheme card: title, preview, NO status dropdown
        scheme_card = page.locator(".scheme-card").first
        check("scheme card displays title", "Playing Card Scheme" in scheme_card.locator(".scheme-card-title").inner_text())
        check("scheme card displays preview", "Angle: Point of attack" in scheme_card.locator(".scheme-card-preview").inner_text())
        check("scheme card has NO status field", scheme_card.locator("select").count() == 0)

        # Click scheme card -> opens inline scheme editor
        scheme_card.click()
        page.wait_for_selector(".inline-editor")
        check("clicking scheme card opens inline editor", page.locator(".inline-editor").is_visible())

        # Verify Scheme Voice / Flow Recording section
        check("Scheme has Voice / Flow Recording section", page.locator(".scheme-voice-section").is_visible())
        check("Recording mic button present in scheme", page.locator(".scheme-voice-section button:has-text('Record Mic')").is_visible())
        check("Recording timer present", page.locator(".scheme-voice-section .record-timer").inner_text() == "00:00")

        # Test live recording inside scheme
        page.click(".scheme-voice-section button:has-text('Record Mic')")
        page.wait_for_selector(".scheme-voice-section button:has-text('Stop Take')")
        check("recording started inside scheme", page.locator(".scheme-voice-section button:has-text('Stop Take')").is_visible())
        page.wait_for_timeout(1200) # record for >1s
        page.click(".scheme-voice-section button:has-text('Stop Take')")
        page.wait_for_selector(".scheme-recording-row")
        check("recording saved and listed inside scheme", page.locator(".scheme-recording-row").count() >= 1)
        check("audio player element rendered for scheme take", page.locator(".scheme-recording-row audio").is_visible())

        # Test Back button from scheme editor
        page.click("button:has-text('Schemes')")
        page.wait_for_selector(".scheme-card")
        check("Back button returns to Schemes list", page.locator(".scheme-card").first.is_visible())

        # Test Voice Notes Tab in Supporting Workspace
        page.click(".supporting-tab:has-text('Voice Notes')")
        page.wait_for_selector(".recorder-box")
        check("voice notes recorder mounted in drawer", page.locator(".record-timer").inner_text() == "00:00")

        # Test Rhyme Bank Docked Under Final Material Editor
        check("rhyme bank present under editor", page.locator(".compact-rhyme-host").is_visible())
        page.click(".compact-rhyme-host .rhyme-toggle-btn") # expand compact bar if collapsed
        page.wait_for_selector(".compact-rhyme-host input[aria-label='Rhyme search']")
        page.fill(".compact-rhyme-host input[aria-label='Rhyme search']", "flow")
        page.wait_for_selector(".compact-rhyme-host .rhyme-pill")
        pill_text = page.locator(".compact-rhyme-host .rhyme-pill").first.inner_text()
        page.locator(".compact-rhyme-host .rhyme-pill").first.click()
        check("clicking pill in rhyme bar inserts into editor", pill_text in get_editor_text(page))

        # Test Supporting Panel Collapse and Reopen
        page.click(".supporting-collapse-btn")
        page.wait_for_timeout(300)
        check("supporting panel collapsed", not page.locator(".workspace-supporting").is_visible())
        check("reopen pill is visible when collapsed", page.locator(".workspace-reopen-pill").is_visible())
        page.click(".workspace-reopen-pill")
        page.wait_for_timeout(300)
        check("supporting panel reopened via pill", page.locator(".workspace-supporting").is_visible())

        # Test Draggable Divider and Width Preservation Across Round Switching
        initial_panel_w = page.locator(".workspace-supporting").bounding_box()["width"]
        divider_box = page.locator("#workspaceDivider").bounding_box()
        page.mouse.move(divider_box["x"] + 5, divider_box["y"] + 50)
        page.mouse.down()
        page.mouse.move(divider_box["x"] - 60, divider_box["y"] + 50)
        page.mouse.up()
        page.wait_for_timeout(300)
        resized_panel_w = page.locator(".workspace-supporting").bounding_box()["width"]
        check("divider drag resized supporting panel", resized_panel_w > initial_panel_w + 30)

        # Switch to Round 2 and verify panel width is preserved (does NOT reset)
        page.click("a.tab:has-text('Round 2')")
        editor_ready(page, 2)
        page.wait_for_timeout(200)
        round2_panel_w = page.locator(".workspace-supporting").bounding_box()["width"]
        check("supporting panel width preserved across round navigation", abs(round2_panel_w - resized_panel_w) < 5)

        # Return to Round 1
        page.click("a.tab:has-text('Round 1')")
        editor_ready(page, 1)

        # Verify Editor Left-Alignment & Typing after backspacing single letter
        check("editor text is left-aligned", page.locator(".editor").evaluate("el => getComputedStyle(el).textAlign") == "left")
        page.locator(".editor").click()
        page.keyboard.type("Z")
        page.keyboard.press("Backspace")
        page.keyboard.type("Testing writing after single letter removed\n")
        page.wait_for_timeout(200)
        check("typing works after putting and removing a letter", "Testing writing after single letter removed" in get_editor_text(page))

        # dashboard reflects material
        page.click("a.nav-link:has-text('Dashboard')")
        page.wait_for_selector("text=Recently edited material")
        body = page.inner_text("#view")
        check("dashboard shows recent battle + material", "Test Battle" in body and "Ang yabang" in body)

        # second battle, archive/restore/search/delete isolation
        page.click("a.nav-link:has-text('Battles')")
        page.wait_for_selector("h1:has-text('Battles')")
        page.click("button:has-text('New battle')")
        page.fill(".modal input >> nth=0", "Other Battle")
        page.click("button:has-text('Create battle')")
        page.wait_for_selector(".editor:not([aria-disabled='true'])")
        page.locator(".editor").fill("other battle text")
        page.wait_for_function("document.querySelector('.save-state') && document.querySelector('.save-state').textContent.startsWith('Saved')", timeout=5000)
        page.click("a.nav-link:has-text('Battles')")
        page.wait_for_selector(".item")
        check("two battles listed", page.locator(".item").count() == 2)
        page.fill("input[type=search]", "rival")
        check("search filters by opponent", page.locator(".item").count() == 1)
        page.fill("input[type=search]", "")
        page.locator(".item", has_text="Other Battle").locator("button:has-text('Archive')").click()
        page.wait_for_timeout(300)
        check("archived battle hidden from Active", page.locator(".item").count() == 1)
        page.select_option("select[aria-label='Filter battles']", "archived")
        check("archived filter shows it", page.locator(".item").count() == 1 and "Other Battle" in page.inner_text(".list"))
        page.locator(".item button:has-text('Restore')").click()
        page.wait_for_timeout(300)
        page.select_option("select[aria-label='Filter battles']", "all")
        check("restored", page.locator(".item").count() == 2)

        # backup export
        page.click("a.nav-link:has-text('Settings')")
        page.wait_for_selector("text=Backup and restore")
        with page.expect_download() as dl:
            page.click("button:has-text('Export JSON Only')")
        path = dl.value.path()
        backup = json.load(open(path, encoding="utf-8"))
        check("backup contains 2 battles / 6 rounds", len(backup["data"]["battles"]) == 2 and len(backup["data"]["rounds"]) == 6)
        check("backup contains raw final material", any("Ang yabang mo pre" in m["text"] for m in backup["data"]["finalMaterials"]))

        # Full ZIP backup with audio (including scheme recording)
        with page.expect_download() as dl_zip:
            page.click("button:has-text('Export Full Backup (ZIP + Audio)')")
        zip_path = dl_zip.value.path()
        import zipfile
        with zipfile.ZipFile(zip_path, "r") as zf:
            check("ZIP backup contains backup.json", "backup.json" in zf.namelist())
            audio_files = [f for f in zf.namelist() if f.startswith("audio/")]
            check("ZIP backup preserves audio recordings", len(audio_files) >= 1)

        # delete one battle only (after confirm), other intact
        page.click("a.nav-link:has-text('Battles')")
        page.wait_for_selector(".item")
        page.locator(".item", has_text="Other Battle").locator("button:has-text('Delete')").click()
        page.click("button:has-text('Delete permanently')")
        page.wait_for_timeout(400)
        check("delete removes only that battle", page.locator(".item").count() == 1 and "Test Battle" in page.inner_text(".list"))

        # restore from backup (replace, no duplicates)
        page.click("a.nav-link:has-text('Settings')")
        page.wait_for_selector("text=Backup and restore")
        page.set_input_files("input[type=file]", path)
        page.click("button:has-text('Replace my data')")
        page.wait_for_timeout(1200)
        page.click("a.nav-link:has-text('Battles')")
        page.wait_for_selector(".item")
        check("restore brings back 2 battles without duplicates", page.locator(".item").count() == 2)

        # Opponent Research
        page.click("a.nav-link:has-text('Opponent Research')")
        page.wait_for_selector("h1:has-text('Opponent Research')")
        page.click("button:has-text('+ Add Opponent')")
        page.wait_for_selector(".modal input[aria-label='Opponent name']")
        page.fill(".modal input[aria-label='Opponent name']", "Batas")
        page.click(".modal button:has-text('Create Profile')")
        page.wait_for_selector("h2:has-text('Batas')")
        check("opponent profile created", page.locator("h2").inner_text() == "Batas")

        # Line Checker
        page.click("a.nav-link:has-text('Line Checker')")
        page.wait_for_selector("h1:has-text('Line Checker')")
        page.fill("textarea[aria-label='Lines to check']", "Random line that is completely original")
        page.click("button:has-text('Scan Bars Against Database')")
        page.wait_for_selector("text=No Searchable Reference Material")
        check("line checker honestly reports 0 reference material available", True)

        # Add reference line to database
        page.click("button:has-text('Reference Database')")
        page.wait_for_selector("button:has-text('+ Add Reference Bar')")
        page.click("button:has-text('+ Add Reference Bar')")
        page.wait_for_selector(".modal textarea")
        page.fill(".modal textarea", "Bawat bara ko alas sa lamesa")
        page.fill(".modal input >> nth=0", "Loonie")
        page.click(".modal button:has-text('Save Reference')")
        page.wait_for_timeout(400)

        # Scan matching line
        page.click("button:has-text('Scan Lines')")
        page.fill("textarea[aria-label='Lines to check']", "Bawat bara ko alas sa lamesa")
        page.click("button:has-text('Scan Bars Against Database')")
        page.wait_for_selector(".match-card")
        check("line checker detects Exact Match from reference DB", "Exact Match" in page.inner_text(".match-card"))

        # Global Search
        page.click("a.nav-link:has-text('Global Search')")
        page.wait_for_selector("input[aria-label='Global search']")
        page.fill("input[aria-label='Global search']", "Batas")
        page.wait_for_selector(".search-result-item")
        check("global search finds Opponent profile", "Batas" in page.inner_text(".search-result-item"))

        # Plain text battle export
        page.click("a.nav-link:has-text('Battles')")
        page.wait_for_selector(".item")
        page.locator(".item a.grow").first.click()
        editor_ready(page)
        with page.expect_download() as dl_txt:
            page.click("button:has-text('Export Script (.txt)')")
        txt_path = dl_txt.value.path()
        txt_content = open(txt_path, encoding="utf-8").read()
        check("plain text export contains battle material", "BARAHA BATTLE MATERIAL" in txt_content)
        check("plain text export has NO html tags", "<mark" not in txt_content and "</div>" not in txt_content)

        # invalid restore rejected
        bad = os.path.join(os.path.dirname(path), "bad.json")
        open(bad, "w").write('{"format":"nope"}')
        page.click("a.nav-link:has-text('Settings')")
        page.wait_for_selector("text=Backup and restore")
        page.set_input_files("input[type=file]", bad)
        page.wait_for_selector(".toast.error")
        check("invalid backup rejected with error toast", True)

        # honest save state: force real IndexedDB writes to fail and confirm UI says so (never "Saved")
        page.click("a.nav-link:has-text('Battles')")
        page.wait_for_selector(".item")
        page.locator(".item a.grow").first.click()
        editor_ready(page)
        page.evaluate("window.__origPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(){ throw new Error('injected failure'); }; undefined")
        page.locator(".editor").fill("this will not persist")
        page.wait_for_function("document.querySelector('.save-state').textContent.startsWith('Save failed')", timeout=5000)
        check("failed write shows 'Save failed', not 'Saved'", True)
        check("text stays in editor after failed save", get_editor_text(page) == "this will not persist")
        page.evaluate("IDBObjectStore.prototype.put = window.__origPut; undefined")
        page.locator(".editor").type(" recovered")
        page.wait_for_function("document.querySelector('.save-state') && document.querySelector('.save-state').textContent.startsWith('Saved')", timeout=5000)
        check("recovers and saves once storage works again", True)

        # offline: after load, app works with network disabled
        ctx.set_offline(True)
        page.click("a.nav-link:has-text('Battles')")
        page.wait_for_selector(".item")
        check("works offline after load", page.locator(".item").count() == 2)
        ctx.set_offline(False)

        # ========================================================
        # PHASE 5 WRITING ENHANCEMENTS TESTS
        # ========================================================

        # 1. Text Highlighting in Final Material Editor
        page.locator(".item a.grow").first.click()
        editor_ready(page)
        page.locator(".editor").fill("Bawat salita ko ay may talim at bala sa kalaban")
        page.wait_for_function("document.querySelector('.save-state').textContent==='Saved'", timeout=5000)

        # Select word "salita" using DOM selection
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const node = ed.firstChild;
            const range = document.createRange();
            range.setStart(node, 6); // 'salita'
            range.setEnd(node, 12);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }""")

        # Trigger contextmenu event to open BARAHA custom context menu
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const rect = ed.getBoundingClientRect();
            const evt = new MouseEvent('contextmenu', {
                clientX: rect.left + 50,
                clientY: rect.top + 30,
                bubbles: true,
                cancelable: true
            });
            ed.dispatchEvent(evt);
        }""")
        page.wait_for_selector(".baraha-context-menu")
        check("right-click opens custom context menu with selection header", "salita" in page.locator(".context-header").inner_text())
        check("context menu has 6 highlight color swatches", page.locator(".context-swatch").count() == 6)

        # Click Red swatch
        page.locator(".context-swatch").first.click()
        page.wait_for_timeout(300)
        check("selection receives red highlight mark", "mark" in get_editor_html(page) and "baraha-highlight" in get_editor_html(page))

        # Apply second color to "bala" via Toolbar Swatch
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const textNodes = [];
            const walk = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
            let n;
            while (n = walk.nextNode()) textNodes.push(n);
            const targetNode = textNodes.find(tn => tn.textContent.includes('bala'));
            if (targetNode) {
                const idx = targetNode.textContent.indexOf('bala');
                const range = document.createRange();
                range.setStart(targetNode, idx);
                range.setEnd(targetNode, idx + 4);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }""")
        page.locator(".toolbar-swatch >> nth=4").click()
        page.wait_for_timeout(300)
        check("multi-color highlights exist in same editor", get_editor_html(page).count("<mark") >= 2)

        # Wait for autosave and reload to verify persistence
        page.wait_for_function("document.querySelector('.save-state').textContent==='Saved'", timeout=5000)
        page.reload()
        editor_ready(page)
        check("highlights persist across browser reload", "<mark" in get_editor_html(page) and "salita" in get_editor_html(page))

        # Switch rounds and verify highlight remains intact on return
        page.click("a.tab:has-text('Round 2')")
        editor_ready(page, 2)
        page.click("a.tab:has-text('Round 1')")
        editor_ready(page, 1)
        check("highlights persist across round navigation", "<mark" in get_editor_html(page) and "salita" in get_editor_html(page))

        # Highlighting Restriction Test: Text outside writing area cannot be highlighted
        page.evaluate("""() => {
            const navLink = document.querySelector('#nav a');
            if (navLink) {
                const range = document.createRange();
                range.selectNodeContents(navLink);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }""")
        page.locator(".toolbar-swatch >> nth=0").click()
        page.wait_for_timeout(300)
        check("highlighting outside textbox blocked with toast feedback", page.locator(".toast:has-text('inside the writing area')").is_visible())
        check("nav link has zero marks", page.locator("#nav mark").count() == 0)

        # 2. Fix Local Rhyme Bank Saving, Duplicates & Scope (This Battle vs General)
        page.wait_for_selector(".compact-rhyme-host input[aria-label='Rhyme search']")
        page.click(".compact-rhyme-host input[aria-label='Rhyme search']")
        page.fill(".compact-rhyme-host input[aria-label='Rhyme search']", "makata")
        page.wait_for_selector(".compact-rhyme-host .rhyme-pill-item")

        # Quick save rhyme using the '+' button on first result pill
        save_btn = page.locator(".compact-rhyme-host .rhyme-pill-save-btn").first
        save_btn.click()
        page.wait_for_selector(".toast")
        check("rhyme quick-saved directly from search pill", page.locator(".toast:has-text('Saved')").is_visible())

        # Clear search filter and switch to Saved Rhymes tab
        page.fill(".compact-rhyme-host input[aria-label='Rhyme search']", "")
        page.click(".compact-rhyme-host .rhyme-bank-bar button:has-text('Saved Rhymes')")
        page.wait_for_selector(".compact-rhyme-host .saved-rhyme-row")
        saved_count = page.locator(".compact-rhyme-host .saved-rhyme-row").count()
        check("saved rhyme appears in Saved Rhymes tab", saved_count >= 1)

        # Verify Scope Badges & Toggle between This Battle and General
        check("scope badge displayed on saved rhyme", page.locator(".compact-rhyme-host .rhyme-scope-badge").is_visible())
        first_pill_name = page.locator(".compact-rhyme-host .saved-rhyme-row .rhyme-pill").first.inner_text().strip()
        make_gen_btn = page.locator(".compact-rhyme-host .saved-rhyme-row button:has-text('Make General')").first
        if make_gen_btn.is_visible():
            make_gen_btn.click()
            page.wait_for_selector(".toast")
            check("moved rhyme to general library", page.locator(".toast:has-text('General Library')").is_visible())

        # Verify General Library filter tab
        page.click(".compact-rhyme-host button.scope-filter-btn:has-text('General Library')")
        page.wait_for_timeout(200)
        check("general filter displays general rhymes", page.locator(".compact-rhyme-host .saved-rhyme-row").count() >= 1)
        page.click(".compact-rhyme-host button.scope-filter-btn:has-text('All')")
        page.wait_for_timeout(200)

        # Try to save the exact same rhyme again: duplicate prevention
        page.click(".compact-rhyme-host .rhyme-bank-bar button:has-text('Local Rhymes')")
        page.fill(".compact-rhyme-host input[aria-label='Rhyme search']", "makata")
        page.wait_for_selector(".compact-rhyme-host .rhyme-pill-item")
        target_save_btn = page.locator(f".compact-rhyme-host .rhyme-pill-item:has-text('{first_pill_name}') .rhyme-pill-save-btn").first
        if target_save_btn.is_visible():
            target_save_btn.click()
            page.wait_for_selector(".toast")
            check("accidental duplicate rhyme prevented with feedback", page.locator(".toast:has-text('already in your saved rhymes')").is_visible())

        # Clear search filter and view Saved Rhymes to delete
        page.fill(".compact-rhyme-host input[aria-label='Rhyme search']", "")
        page.click(".compact-rhyme-host .rhyme-bank-bar button:has-text('Saved Rhymes')")
        page.wait_for_selector(".compact-rhyme-host .saved-rhyme-row")
        current_saved_count = page.locator(".compact-rhyme-host .saved-rhyme-row").count()
        page.locator(".compact-rhyme-host .saved-rhyme-row button[title='Delete saved rhyme'], .compact-rhyme-host .saved-rhyme-row button:has-text('✕')").first.click()
        page.wait_for_timeout(300)
        check("saved rhyme deleted successfully", page.locator(".compact-rhyme-host .saved-rhyme-row").count() == current_saved_count - 1)

        # 3. Substantially Improved Rhyme Engine
        page.click(".compact-rhyme-host .rhyme-bank-bar button:has-text('Local Rhymes')")
        page.fill(".compact-rhyme-host input[aria-label='Rhyme search']", "makata")
        page.wait_for_timeout(400)
        check("engine separates Exact Rhymes", page.locator(".compact-rhyme-host .rhyme-group-title:has-text('Exact Rhymes')").is_visible())
        check("engine separates Multi-Syllable Rhymes", page.locator(".compact-rhyme-host .rhyme-group-title:has-text('Multi-Syllable Rhymes')").is_visible())
        check("engine separates Word Associations", page.locator(".compact-rhyme-host .rhyme-group-title:has-text('Word Associations')").is_visible())

        # English / Hip-Hop Phonetic Rhyme test
        page.fill(".compact-rhyme-host input[aria-label='Rhyme search']", "flow")
        page.wait_for_timeout(400)
        exact_flow = page.locator(".compact-rhyme-host .rhyme-group:has(.rhyme-group-title:has-text('Exact Rhymes')) .rhyme-pill").all_inner_texts()
        check("phonetic coda match detects flow / glow / blow / slow", any(w in exact_flow for w in ['glow', 'blow', 'slow', 'pro']))

        # 4. Custom Pronunciation Dictionary tab removed from Rhyme Bank (Phase 6 Part 5)
        check("Custom Words tab completely removed from Rhyme Bank", page.locator(".compact-rhyme-host button:has-text('Custom Words')").count() == 0)

        # 5. Simplified Add Rhyme Dialog (Phase 6 Part 4)
        page.click(".compact-rhyme-host .rhyme-bank-bar button:has-text('Saved Rhymes')")
        page.wait_for_selector(".compact-rhyme-host button:has-text('+ Add Rhyme')")
        page.click(".compact-rhyme-host button:has-text('+ Add Rhyme')")
        page.wait_for_selector(".modal")
        check("Add Rhyme dialog has Word input", page.locator(".modal input[aria-label='Rhyme text']").is_visible())
        check("Add Rhyme dialog has Destination select", page.locator(".modal select[aria-label='Storage Scope']").is_visible())
        check("Add Rhyme dialog has Collection input", page.locator(".modal input[aria-label='Rhyme collection']").is_visible())
        check("Add Rhyme dialog removed Rhyme Type input", page.locator(".modal select[aria-label='Rhyme type'], .modal input[aria-label='Rhyme type']").count() == 0)
        check("Add Rhyme dialog removed Notes input", page.locator(".modal textarea[aria-label='Notes / Context'], .modal input[aria-label='Notes / Context']").count() == 0)
        page.fill(".modal input[aria-label='Rhyme text']", "asero")
        page.fill(".modal input[aria-label='Rhyme collection']", "Heavy Metals")
        page.click(".modal button:has-text('Save Rhyme')")
        page.wait_for_selector(".toast")
        check("rhyme saved via simplified dialog", page.locator(".toast:has-text('Rhyme saved')").is_visible())

        # 6. Grouped Collections in Saved Rhymes (Phase 6 Part 6)
        page.wait_for_selector(".compact-rhyme-host .rhyme-collection-card")
        check("saved rhymes grouped by collection card", page.locator(".compact-rhyme-host .rhyme-collection-card").count() >= 1)
        check("collection card has title and count", page.locator(".compact-rhyme-host .rhyme-col-title:has-text('Heavy Metals')").is_visible())
        col_header = page.locator(".compact-rhyme-host .rhyme-collection-card:has-text('Heavy Metals') .rhyme-col-header")
        col_header.click()
        page.wait_for_timeout(200)
        check("clicking collection card toggles collapse", page.locator(".compact-rhyme-host .rhyme-collection-card:has-text('Heavy Metals')").first.get_attribute("class") and "is-collapsed" in page.locator(".compact-rhyme-host .rhyme-collection-card:has-text('Heavy Metals')").first.get_attribute("class"))
        col_header.click()
        page.wait_for_timeout(200)

        # 7. Draggable Rhyme Panel Resizer (Phase 6 Part 7)
        check("rhyme panel vertical resizer handle present", page.locator(".compact-rhyme-host .rhyme-panel-resizer").is_visible())
        resizer_box = page.locator(".compact-rhyme-host .rhyme-panel-resizer").bounding_box()
        cx = resizer_box["x"] + resizer_box["width"] / 2
        cy = resizer_box["y"] + resizer_box["height"] / 2
        page.mouse.move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx, cy - 80, steps=8)
        page.mouse.up()
        page.wait_for_timeout(300)
        check("rhyme panel height updated and persisted", page.evaluate("() => Number(localStorage.getItem('baraha_rhyme_panel_height')) > 150"))

        # 8. Highlight Boundary Caret Escape (Space key does not inherit highlight) (Phase 6 Part 1)
        page.locator(".editor").click()
        page.locator(".editor").fill("")
        page.keyboard.type("gun")
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const node = ed.firstChild;
            const range = document.createRange();
            range.setStart(node, 0);
            range.setEnd(node, 3);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }""")
        page.locator(".toolbar-swatch >> nth=1").click()
        page.wait_for_timeout(300)
        check("gun is highlighted", "<mark" in get_editor_html(page) and "gun" in get_editor_html(page))
        page.keyboard.press("Space")
        page.keyboard.type("today")
        page.wait_for_timeout(300)
        mark_text = page.evaluate("() => document.querySelector('.editor mark') ? document.querySelector('.editor mark').textContent : ''")
        full_text = get_editor_text(page)
        check("pressing Space after highlight does NOT inherit mark", mark_text == "gun", f"mark_text='{mark_text}'")
        check("subsequent typing is placed outside highlight", "gun today" in full_text)

        # 8b. Cross-line highlight stress tests (Phase 7 — Highlight Bug Fix)
        # Set up a multi-line editor
        page.locator(".editor").click()
        page.locator(".editor").fill("")
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            ed.innerHTML = 'line one<br>line two<br>line three';
        }""")
        page.wait_for_timeout(200)

        # Test: Highlight across two lines — select "one" through "line two"
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const textNodes = [];
            const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
            let n; while ((n = walker.nextNode())) textNodes.push(n);
            // textNodes[0] = "line one", textNodes[1] = "line two", textNodes[2] = "line three"
            const range = document.createRange();
            range.setStart(textNodes[0], 5); // start at "one"
            range.setEnd(textNodes[1], 8);   // end at end of "line two"
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }""")
        page.locator(".toolbar-swatch >> nth=0").click()  # Red highlight
        page.wait_for_timeout(400)
        html_after = get_editor_html(page)
        text_after = get_editor_text(page)
        # Should still have all three lines visible as text
        check("cross-line HL: all lines preserved in text",
              "line" in text_after and "one" in text_after and "two" in text_after and "three" in text_after,
              f"text='{text_after}'")
        # Should have <br> elements preserved (lines not collapsed)
        check("cross-line HL: <br> preserved in HTML",
              "<br>" in html_after or "<br/>" in html_after,
              f"html='{html_after[:300]}'")
        # Should have <mark> elements
        check("cross-line HL: mark elements present",
              "<mark" in html_after,
              f"html='{html_after[:300]}'")
        # Editor should NOT be corrupted — text should have newlines
        lines_after = [l.strip() for l in text_after.split('\n') if l.strip()]
        check("cross-line HL: editor still has 3 distinct lines",
              len(lines_after) >= 3,
              f"lines={lines_after}")

        # Test: Highlighting only whitespace should be rejected
        page.locator(".editor").click()
        page.locator(".editor").fill("")
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            ed.innerHTML = 'hello   world';
        }""")
        page.wait_for_timeout(200)
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const textNode = ed.firstChild;
            const range = document.createRange();
            range.setStart(textNode, 5);  // start at first space
            range.setEnd(textNode, 8);    // end at last space (3 spaces)
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }""")
        page.locator(".toolbar-swatch >> nth=2").click()  # Try Yellow highlight
        page.wait_for_timeout(300)
        ws_html = get_editor_html(page)
        check("whitespace-only HL rejected: no mark added",
              "<mark" not in ws_html,
              f"html='{ws_html}'")

        # Test: Highlight word on line 1, then highlight word on line 2 (sequential)
        page.locator(".editor").click()
        page.locator(".editor").fill("")
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            ed.innerHTML = 'alpha bravo<br>charlie delta';
        }""")
        page.wait_for_timeout(200)
        # Highlight "alpha" on line 1
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const textNode = ed.firstChild;
            const range = document.createRange();
            range.setStart(textNode, 0);
            range.setEnd(textNode, 5);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        }""")
        page.locator(".toolbar-swatch >> nth=0").click()  # Red
        page.wait_for_timeout(300)
        # Now highlight "delta" on line 2
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const textNodes = [];
            const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
            let n; while ((n = walker.nextNode())) textNodes.push(n);
            // Find text node containing "delta"
            for (const tn of textNodes) {
                const idx = tn.textContent.indexOf('delta');
                if (idx >= 0) {
                    const range = document.createRange();
                    range.setStart(tn, idx);
                    range.setEnd(tn, idx + 5);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                    break;
                }
            }
        }""")
        page.locator(".toolbar-swatch >> nth=4").click()  # Blue
        page.wait_for_timeout(300)
        seq_html = get_editor_html(page)
        seq_text = get_editor_text(page)
        check("sequential HL: 2 marks present",
              seq_html.count("<mark") >= 2,
              f"marks={seq_html.count('<mark')}")
        check("sequential HL: all words intact",
              "alpha" in seq_text and "bravo" in seq_text and "charlie" in seq_text and "delta" in seq_text,
              f"text='{seq_text}'")
        check("sequential HL: line break preserved",
              "<br>" in seq_html or "<br/>" in seq_html,
              f"html='{seq_html[:300]}'")

        # 8c. Google Docs-style Highlighting Refactor & Bug Fixes (BARAHA V2)
        # Test 1: Immediate recoloring on selected text (Yellow -> Green -> Blue -> No Highlight)
        page.locator(".editor").click()
        page.locator(".editor").fill("")
        page.keyboard.type("spit cold bars")
        page.wait_for_timeout(200)

        # Select "cold" (chars 5..9)
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
            let tn;
            while ((tn = walker.nextNode())) {
                const idx = tn.textContent.indexOf('cold');
                if (idx >= 0) {
                    const r = document.createRange();
                    r.setStart(tn, idx);
                    r.setEnd(tn, idx + 4);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(r);
                    break;
                }
            }
        }""")
        # Click Yellow swatch (nth=2)
        page.locator(".toolbar-swatch >> nth=2").click()
        page.wait_for_timeout(200)
        check("Google Docs HL: cold is yellow", page.evaluate("() => document.querySelector('.editor mark') && document.querySelector('.editor mark').getAttribute('data-color') === '#B45309'"))

        # Immediately click Green swatch (nth=3) without re-selecting (selection preserved!)
        page.locator(".toolbar-swatch >> nth=3").click()
        page.wait_for_timeout(200)
        recolor_green = page.evaluate("() => document.querySelector('.editor mark') && document.querySelector('.editor mark').getAttribute('data-color') === '#15803D'")
        check("Google Docs HL: recolor yellow to green", recolor_green)
        check("Google Docs HL: zero nested marks on recolor", page.evaluate("() => document.querySelectorAll('.editor mark mark').length === 0"))

        # Immediately click Blue swatch (nth=4)
        page.locator(".toolbar-swatch >> nth=4").click()
        page.wait_for_timeout(200)
        recolor_blue = page.evaluate("() => document.querySelector('.editor mark') && document.querySelector('.editor mark').getAttribute('data-color') === '#1D4ED8'")
        check("Google Docs HL: recolor green to blue", recolor_blue)

        # Immediately click "No Highlight" button
        page.locator(".toolbar-clear-hl").click()
        page.wait_for_timeout(200)
        check("Google Docs HL: No Highlight removes mark cleanly", page.evaluate("() => document.querySelectorAll('.editor mark').length === 0"))
        check("Google Docs HL: text intact after No Highlight", get_editor_text(page) == "spit cold bars")

        # Test 2: Enter after highlight does NOT create yellow empty lines (Photo 3 bug fix)
        page.locator(".editor").click()
        page.locator(".editor").fill("")
        page.keyboard.type("fire line")
        page.wait_for_timeout(200)
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
            const tn = walker.nextNode();
            const r = document.createRange();
            r.setStart(tn, 0);
            r.setEnd(tn, tn.textContent.length);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
        }""")
        page.locator(".toolbar-swatch >> nth=2").click()  # Yellow
        page.wait_for_timeout(200)
        # Collapse caret to end of mark and press Enter
        page.evaluate("""() => {
            const mark = document.querySelector('.editor mark');
            const walker = document.createTreeWalker(mark, NodeFilter.SHOW_TEXT);
            const tn = walker.nextNode();
            const r = document.createRange();
            r.setStart(tn, tn.textContent.length);
            r.setEnd(tn, tn.textContent.length);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
        }""")
        page.keyboard.press("Enter")
        page.keyboard.type("clean second line")
        page.wait_for_timeout(200)
        ed_html = get_editor_html(page)
        check("Enter after HL: second line not highlighted",
              page.evaluate("() => { const marks = document.querySelectorAll('.editor mark'); return marks.length === 1 && marks[0].textContent === 'fire line'; }"),
              f"html='{ed_html}'")
        check("Enter after HL: no BR inside mark", page.evaluate("() => document.querySelectorAll('.editor mark br').length === 0"))

        # Test 3: Multi-line cross-line recolor & No Highlight (Photo 1 & 2 bug fix)
        page.locator(".editor").click()
        page.locator(".editor").fill("")
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            ed.innerHTML = 'sadas<br>sadas<br>asd';
        }""")
        page.wait_for_timeout(200)
        # Select all 3 lines
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const r = document.createRange();
            r.selectNodeContents(ed);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
        }""")
        page.locator(".toolbar-swatch >> nth=0").click()  # Red
        page.wait_for_timeout(300)
        # Recolor all to Yellow
        page.locator(".toolbar-swatch >> nth=2").click()  # Yellow
        page.wait_for_timeout(300)
        check("Multi-line recolor: all marks are yellow", page.evaluate("() => Array.from(document.querySelectorAll('.editor mark')).every(m => m.getAttribute('data-color') === '#B45309')"))
        check("Multi-line recolor: zero nested marks", page.evaluate("() => document.querySelectorAll('.editor mark mark').length === 0"))

        # Click No Highlight on multi-line selection
        page.locator(".toolbar-clear-hl").click()
        page.wait_for_timeout(300)
        check("Multi-line No Highlight: zero marks left", page.evaluate("() => document.querySelectorAll('.editor mark').length === 0"))
        check("Multi-line No Highlight: lines intact", "sadas" in get_editor_text(page) and "asd" in get_editor_text(page))

        # Test 4: Cannot highlight spaces (stress test)
        page.locator(".editor").click()
        page.locator(".editor").fill("")
        page.keyboard.type("   flow state   ")
        page.wait_for_timeout(200)
        # Select entire content including spaces
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const r = document.createRange();
            r.selectNodeContents(ed);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
        }""")
        page.locator(".toolbar-swatch >> nth=2").click() # Yellow
        page.wait_for_timeout(300)
        # Mark must only wrap "flow state", leading/trailing spaces must be outside
        mark_text = page.evaluate("() => document.querySelector('.editor mark') ? document.querySelector('.editor mark').textContent : ''")
        check("cannot highlight space: mark contains only non-whitespace text", mark_text == "flow state")
        check("cannot highlight space: zero leading or trailing space in mark", not mark_text.startswith(" ") and not mark_text.endswith(" "))

        # Test 5: Multiple Enters after highlight produce zero yellow marks on blank lines (Photo 3 bug)
        page.locator(".editor").click()
        page.locator(".editor").fill("")
        page.keyboard.type("asd")
        page.wait_for_timeout(200)
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const r = document.createRange();
            r.selectNodeContents(ed);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
        }""")
        page.locator(".toolbar-swatch >> nth=2").click() # Yellow
        page.wait_for_timeout(200)
        # Place caret at end of asd mark and press Enter 6 times
        page.evaluate("""() => {
            const mark = document.querySelector('.editor mark');
            const walker = document.createTreeWalker(mark, NodeFilter.SHOW_TEXT);
            const tn = walker.nextNode();
            const r = document.createRange();
            r.setStart(tn, tn.textContent.length);
            r.setEnd(tn, tn.textContent.length);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
        }""")
        for _ in range(6):
            page.keyboard.press("Enter")
            page.wait_for_timeout(50)
        page.wait_for_timeout(200)
        marks_after_enters = page.evaluate("() => document.querySelectorAll('.editor mark').length")
        empty_marks_count = page.evaluate("() => Array.from(document.querySelectorAll('.editor mark')).filter(m => !m.textContent.trim()).length")
        check("multiple Enters after HL: exactly 1 mark exists (asd)", marks_after_enters == 1)
        check("multiple Enters after HL: zero empty yellow marks on blank lines", empty_marks_count == 0)

        # Restore editor content for pinned bars test
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            ed.innerHTML = 'sadas<br>sadas<br>asd';
        }""")
        page.wait_for_timeout(200)

        # 9. Pinned Bars Panel & Context Menu Pinning (Phase 6 Part 11)
        check("pinned bars panel mounted above editor", page.locator(".pinned-bars-panel").is_visible())
        page.evaluate("""() => {
            const ed = document.querySelector('.editor');
            const range = document.createRange();
            range.selectNodeContents(ed);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            const rect = ed.getBoundingClientRect();
            const evt = new MouseEvent('contextmenu', {
                clientX: rect.left + 50,
                clientY: rect.top + 30,
                bubbles: true,
                cancelable: true
            });
            ed.dispatchEvent(evt);
        }""")
        page.wait_for_selector(".baraha-context-menu")
        check("context menu has 'Pin Bar' item", page.locator(".context-item:has-text('Pin Bar'), .context-menu-item:has-text('Pin Bar')").is_visible())
        page.locator(".context-item:has-text('Pin Bar'), .context-menu-item:has-text('Pin Bar')").click()
        page.wait_for_selector(".toast")
        check("bar pinned feedback toast", page.locator(".toast:has-text('Bar pinned'), .toast:has-text('Pinned')").is_visible())
        page.wait_for_selector(".pinned-bar-item")
        check("pinned bar listed in Pinned Bars panel", page.locator(".pinned-bar-item").count() >= 1)
        check("pinned bar shows line text", "sadas" in page.locator(".pinned-bar-item").first.inner_text())
        check("pinned bar has Unpin button", page.locator(".pinned-bar-unpin-btn").is_visible())
        page.locator(".pinned-bar-unpin-btn").first.click()
        page.wait_for_timeout(300)
        check("unpinning bar removes it from panel", page.locator(".pinned-bar-item").count() == 0)

        # 10. Keyboard Shortcuts (Phase 6 Part 9)
        page.keyboard.press("Control+Shift+R")
        page.wait_for_timeout(200)
        is_rhyme_focused = page.evaluate("() => document.activeElement === document.querySelector(\".compact-rhyme-host input[aria-label='Rhyme search']\")")
        check("Ctrl+Shift+R focuses Rhyme Bank input", is_rhyme_focused)

        page.keyboard.press("Control+/")
        page.wait_for_selector("input[aria-label='Global search']")
        check("Ctrl+/ opens Global Search", page.locator("input[aria-label='Global search']").is_visible())

        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        check("Escape closes modal / search dialog", page.locator(".search-overlay, .modal").count() == 0)

        # 11. Writer Studio Dashboard (Phase 6 Part 10)
        page.click("a.nav-link:has-text('Dashboard')")
        page.wait_for_selector(".continue-writing-hero")
        check("Dashboard has Continue Writing hero card", page.locator(".continue-writing-hero").is_visible())
        check("Hero card has Quick Resume button", page.locator(".hero-resume-btn").is_visible())
        check("Hero card displays battle title and excerpt", page.locator(".hero-battle-title").is_visible())
        page.click(".hero-resume-btn")
        editor_ready(page)
        check("clicking Resume on hero jumps straight into active writing workspace", "/final" in page.url or page.locator(".editor").is_visible())

        # 12. Draft Duplication Prevention (Phase 7 / V2 Part 3)
        page.click(".supporting-tab:has-text('Drafts')")
        page.wait_for_timeout(300)
        initial_draft_cards = page.locator(".draft-card").count()
        page.click("button:has-text('New Draft')")
        page.wait_for_selector(".inline-editor")
        page.fill(".inline-title-input", "Duplication Stress Draft")
        page.locator(".inline-content-textarea").click()
        page.keyboard.type("testing that typing and blurring does not create multiple cards")
        page.wait_for_timeout(700)
        # Click back to drafts
        page.click(".inline-back-btn")
        page.wait_for_timeout(500)
        new_draft_cards = page.locator(".draft-card").count()
        check("Draft creation: creates exactly 1 card without duplicates", new_draft_cards == initial_draft_cards + 1)
        check("Draft card displays correct title", page.locator(".draft-card-title:has-text('Duplication Stress Draft')").count() == 1)

        # 13. Scheme Duplication Prevention (Phase 7 / V2 Part 4)
        page.click(".supporting-tab:has-text('Schemes')")
        page.wait_for_timeout(300)
        initial_scheme_cards = page.locator(".scheme-card").count()
        page.click("button:has-text('New Scheme')")
        page.wait_for_selector(".inline-editor")
        page.fill(".inline-title-input", "Duplication Stress Scheme")
        page.fill("input[placeholder*='Topic']", "Cards and Poker")
        page.locator(".inline-content-textarea").click()
        page.keyboard.type("aces up my sleeve\nroyal flush")
        page.wait_for_timeout(700)
        # Click back to schemes
        page.click(".inline-back-btn")
        page.wait_for_timeout(500)
        new_scheme_cards = page.locator(".scheme-card").count()
        check("Scheme creation: creates exactly 1 card without duplicates", new_scheme_cards == initial_scheme_cards + 1)
        check("Scheme card displays correct title", page.locator(".scheme-card-title:has-text('Duplication Stress Scheme')").count() == 1)

        # Final console error check
        real_errors = [e for e in errors if "Failed to load resource" not in e and "injected failure" not in e]
        check("no console/page errors", not real_errors, "; ".join(real_errors)[:300])
        b.close()
finally:
    srv.terminate()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
