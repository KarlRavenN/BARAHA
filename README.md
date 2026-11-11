# BARAHA — Battle Rap Writing Workspace
> **Every bar is a card. Play yours right.**

BARAHA is a dedicated, offline-first creative workspace designed specifically for battle rap writers. It organizes projects around the core discipline: **Battle → 3 Rounds → Materials**, with dedicated tools for writing rounds, capturing punchline drafts, architecting schemes, rhyming, recording delivery flow notes, and scouting opponents.

Version: **0.6.0 (Phase 6: Writing Workflow & UI Refinement)**

---

## What's New in Phase 6 (Writing Workflow & UI Refinement)

1. **Highlight Caret Boundary Escape:**
   - Pressing the **Space** key after applying a highlight now cleanly breaks out of the `<mark>` tag.
   - Subsequent typing continues unhighlighted (`[highlight]gun[/highlight] today`), preventing accidental color bleeding while writing.
   - Standardized via reusable `attachHighlightBoundaryHandler` across all editors.

2. **Autosave-First Architecture:**
   - Manual save buttons ("Save", "Save Draft", "Save Scheme") have been completely removed for a distraction-free writing experience.
   - All changes (typing, backspacing, pasting, dropdown selects, and metadata) are debounced (600ms) and saved automatically into IndexedDB.
   - Lightweight status badge indicates live state: `Saving…` → `Saved` → `Saved just now`.

3. **Removed Redundant Actions:**
   - Cleaned up Drafts and Schemes editors by removing clutter actions ("Append to Final", "Insert Cursor", "Link Scheme").

4. **Simplified Add Rhyme Dialog & Clean Rhyme Bank:**
   - The Add Rhyme dialog now contains only: **Rhyme Word / Phrase**, **Save Destination** (This Battle vs General), and **Collection / Scheme**.
   - Removed confusing "Rhyme Type" and "Notes/Context" fields.
   - Completely removed the redundant "Custom Words" tab from Rhyme Bank, keeping only Local Rhymes and Scoped Saved Rhymes.

5. **Grouped Collections in Saved Rhymes:**
   - Saved rhymes are organized into clean, collapsible cards grouped by collection name with item counters and toggle arrows.
   - Rhymes saved to the same collection (case-insensitive) are automatically merged into a single card.

6. **Vertically Resizable Rhyme Panel:**
   - Docked Rhyme Bank under the main editor features a top draggable splitter handle (`.rhyme-panel-resizer`).
   - Dragging vertically smoothly adjusts height between 130px and 520px with height persistence in `localStorage` and settings.

7. **Pinned Bars System:**
   - 1-click **Pin Bar** from the right-click context menu in Final Material, Drafts, and Schemes.
   - Dedicated collapsible **Pinned Bars** panel mounted above the editor with original source links, one-click copy, and unpinning.
   - Stored in IndexedDB `pinnedBars` store (Migration #3) and included in backups.

8. **Keyboard Shortcuts:**
   - `Ctrl+H`: Highlight selected text with default highlight swatch.
   - `Ctrl+Shift+R`: Instantly focus Rhyme Bank search input.
   - `Ctrl+/`: Open Global Search from anywhere in the app.
   - `Esc`: Dismiss open modal dialogs and overlays.

9. **Writer Studio Dashboard Redesign:**
   - Notion/Obsidian-inspired writer studio aesthetic.
   - **Continue Writing Hero Card:** Displays active battle, round number, preview excerpt, and a **Resume Writing →** button jumping straight into the writing workspace.
   - Clean lists for Recently Edited Material, Recent Battles, and Recent Flow / Voice Notes.
   - De-emphasized raw metric boxes with a subtle single-line stats summary.

---

## Key Modules & Capabilities

- **Two-Workspace Studio:** Main Final Material editor (~60%) + Supporting Tools drawer (~35%) with draggable divider.
- **Battle Management:** Organize battles by league, opponent, and date. Every battle contains exactly three isolated rounds.
- **Final Material Editor:** Distraction-free, dark writing studio with honest autosave (800ms debounce), character/word/line counters, width/font-size controls, and Focus Mode (`Alt+F`). Disables autocorrect and spellcheck to preserve Filipino, Taglish, slang, and phonetic spelling byte-for-byte.
- **Draft Ideas:** Fast, uncluttered cards with 2-state status and inline editing.
- **Scheme Builder:** Multi-bar angles with built-in voice cadence recordings and direct-to-editor insertion.
- **Rhyme Bank:** Phonetic Tagalog/Taglish rhyme engine (exact, slant/assonance, multisyllabic, concept associations) plus a personal saved rhyme collection. Synchronized between docked quick bar and full tab.
- **Editor Context Menu:** Highlight any bar or word and right-click to find rhymes, create a draft idea, add to a scheme, check for similar lines, or search across the workspace.
- **Voice Notes:** In-browser audio recorder (`MediaRecorder`) to test cadence, rhyme delivery, and flow with pause/resume and playback controls. Supports audio file import. Audio files are persisted as Blobs in IndexedDB.
- **Opponent Research:** Dedicated dossier for rivals: record notable lines, known weaknesses, contradictions, personal attack angles, counter-rebuttals, and timestamps.
- **Battle Rap Line Checker:** Screen bars against local reference records to catch accidental biting or similarity. Catches Exact, Phrase, and Possible Similarity matches. Never fabricates matches.
- **Global Search:** Instant search across battles, round materials, drafts, schemes, saved rhymes, voice notes, and opponents.
- **Backup & Export:** Export full ZIP backups (including all audio recordings) or raw JSON backups. Restore with schema validation. Export complete 3-round battle scripts to `.txt`.

---

## Tech Stack & Architecture

- **Frontend:** Vanilla JavaScript (ES modules), Semantic HTML5, CSS Custom Properties. Zero runtime dependencies, no build step, no bundler.
- **Persistence:** IndexedDB with versioned schema migrations (`js/core/db.js`). All writes are atomic across related stores.
- **Local Dev Servers:**
  - `start.bat` — One-click launcher for Windows.
  - `serve.py` — Zero-dependency Python server.
  - `serve.mjs` — Zero-dependency Node.js server.
- **Testing:** 136 automated end-to-end browser tests (`tests/e2e.py`) via Playwright covering real Chrome/Edge and real IndexedDB, plus a 12-test in-browser unit test suite (`tests/runner.html`). All passing 100%.

---

## Installation & Running

BARAHA runs locally without an internet connection and requires no external packages to operate:

### Option A: One-Click Launcher (Windows)
Double-click `start.bat` in the project root folder.

### Option B: Using Python (Windows / macOS / Linux)
1. Open a terminal in the project directory.
2. Run:
   ```powershell
   python serve.py
   ```
3. Open **`http://localhost:5173`** in Chrome, Edge, or Firefox.

### Option C: Using Node.js
1. Run:
   ```bash
   node serve.mjs
   ```
2. Open **`http://localhost:5173`** in your browser.

> **Note:** The application must be served over `http://localhost` (not opened directly via `file://`) because modern browsers restrict ES modules over local file schemes.

---

## Automated Tests

Run the complete 81-check browser test suite against real Chrome:
```powershell
python tests/e2e.py
```

Run in-memory unit tests:
- Open `http://localhost:5173/tests/runner.html` in your browser.
- All 10 unit test suites run and report status in real time.
