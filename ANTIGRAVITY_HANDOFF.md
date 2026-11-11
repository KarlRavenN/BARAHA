# BARAHA — Developer Handoff & Architecture Guide
> **Phase 6 Implementation Complete: Writing Workflow & UI Refinement**

This document details the architecture, code organization, completed modules, database schema, and testing setup for BARAHA.

---

## 1. Executive Summary

BARAHA is a dedicated, offline-first creative workspace for battle rap writers. The core structural hierarchy is **Battle → 3 Independent Rounds → Writing Materials**.

### Phase 6 Highlights:
1. **Highlight Boundary Escape:**
   - Pressing the **Space** key after applying a highlight cleanly escapes the `<mark>` tag.
   - Subsequent typing continues unhighlighted (`[highlight]gun[/highlight] today`), preventing accidental color bleeding while writing.
   - Standardized via reusable `attachHighlightBoundaryHandler` across all editors.
2. **Autosave-First Across All Writing Areas:**
   - Manual save buttons ("Save", "Save Draft", "Save Scheme") have been completely removed for a clean, distraction-free writing experience.
   - Debounced autosave (600ms) on typing, backspacing, pasting, dropdown selects, and metadata updates.
   - Lightweight status badge indicates live state: `Saving…` → `Saved` → `Saved just now`.
3. **Removed Redundant Actions:**
   - Cleaned up Drafts and Schemes editors by removing clutter actions ("Append to Final", "Insert Cursor", "Link Scheme").
4. **Simplified Add Rhyme Dialog & Clean Rhyme Bank:**
   - Add Rhyme dialog contains only: **Rhyme Word / Phrase**, **Save Destination** (This Battle vs General), and **Collection / Scheme**.
   - Removed confusing "Rhyme Type" and "Notes/Context" fields.
   - Completely removed the redundant "Custom Words" tab from Rhyme Bank, keeping only Local Rhymes and Scoped Saved Rhymes.
5. **Grouped Collections in Saved Rhymes:**
   - Saved rhymes organized into clean, collapsible cards grouped by collection name with item counters and toggle arrows.
   - Rhymes saved to the same collection (case-insensitive) are automatically merged.
6. **Vertically Resizable Rhyme Panel:**
   - Docked Rhyme Bank features top draggable splitter handle (`.rhyme-panel-resizer`).
   - Dragging vertically smoothly adjusts height between 130px and 520px with persistence in `localStorage` and settings.
7. **Pinned Bars System:**
   - 1-click **Pin Bar** from the right-click context menu in Final Material, Drafts, and Schemes.
   - Dedicated collapsible **Pinned Bars** panel mounted above the editor with original source links, one-click copy, and unpinning.
   - Stored in IndexedDB `pinnedBars` store (Migration #3) and included in backups.
8. **Keyboard Shortcuts:**
   - `Ctrl+H`: Highlight selected text.
   - `Ctrl+Shift+R`: Instantly focus Rhyme Bank search input.
   - `Ctrl+/`: Open Global Search from anywhere in the app.
   - `Esc`: Dismiss open modal dialogs and overlays.
9. **Writer Studio Dashboard Redesign:**
   - Notion/Obsidian-inspired writer studio aesthetic.
   - **Continue Writing Hero Card:** Displays active battle, round number, preview excerpt, and a **Resume Writing →** button jumping straight into the writing workspace.
   - Clean lists for Recently Edited Material, Recent Battles, and Recent Flow / Voice Notes.
   - De-emphasized raw metric boxes with a subtle single-line stats summary.

---

## 2. Directory & Component Structure

```
baraha/
├── index.html                   # HTML entry point; loads tokens.css, app.css, js/main.js
├── start.bat                    # One-click Windows launcher
├── serve.py                     # Zero-dependency Python 3 static server
├── serve.mjs                    # Zero-dependency Node.js static server
├── package.json                 # Scripts and project metadata
├── assets/
│   └── favicon.svg              # BARAHA playing card icon
├── css/
│   ├── tokens.css               # Design tokens (brand red #A60000, charcoal, grays)
│   └── app.css                  # Studio layout, simplified cards, inline editors, animations
├── js/
│   ├── main.js                  # Client router registration & navigation sidebar
│   ├── components/
│   │   ├── text-editor.js       # Autosaving rich-text editor with right-click context menu & toolbar swatches
│   │   ├── rich-editor.js       # Core highlighting engine, palette, caret boundary handler, sanitizer
│   │   ├── rhyme-bank.js        # Compact dockable bar & full tab (local engine + grouped saved rhymes + vertical resizer)
│   │   ├── pinned-bars.js       # Collapsible pinned bars panel with battle & round links, copy, and unpin
│   │   └── context-menu.js      # Viewport-clamped custom right-click selection menu with highlight palette
│   ├── core/
│   │   ├── db.js                # IndexedDB stores & migration pipeline (16 stores, Schema v3)
│   │   ├── store.js             # Unified domain layer, storage operations, and pinned bars API
│   │   ├── router.js            # Hash router with view teardown lifecycle
│   │   ├── rhymes-engine.js     # Offline phonetic rhyme & assonance engine
│   │   ├── zip.js               # Zero-dependency PKZip 2.0 creator and parser
│   │   ├── ui.js                # Modal, formDialog, confirmDialog, toast, download
│   │   └── util.js              # UUID, textStats, nowIso, formatDate, debounce
│   └── modules/
│       ├── dashboard.js         # Redesigned Writer Studio dashboard with Continue Writing hero
│       ├── battles.js           # Battle list, search, archive, delete
│       ├── battle-form.js       # Battle creation & editing modal
│       ├── workspace.js         # Two-Workspace Studio host (Final Material + Supporting Drawer)
│       ├── drafts.js            # Simplified Drafts: clean cards, 2-state status, inline editor, autosave
│       ├── schemes.js           # Simplified Schemes: clean cards, inline editor, flow voice recording, autosave
│       ├── voice-notes.js       # Audio recorder, playback & audio blob management
│       ├── opponents.js         # Opponent dossier, attack angles & weakness notes
│       ├── line-checker.js      # Reference database & similarity matcher
│       ├── search.js            # Global multi-store search
│       └── settings.js          # Full ZIP & JSON backup / restore
└── tests/
    ├── e2e.py                   # 136 Playwright automated browser tests (100% pass)
    ├── runner.html              # In-browser unit test runner (12/12 pass)
    ├── store.test.js            # Domain store test specifications
    └── memory-backend.js        # In-memory storage mock
```

---

## 3. Database Schema Reference

IndexedDB database name: `baraha`, schema version 3.

All 16 stores:
1. `battles`: `{ id, title, opponentName, opponentId, league, battleDate, status, location, notes, archived, createdAt, updatedAt, lastOpenedAt }`
2. `rounds`: `{ id, battleId, number, notes, createdAt, updatedAt }` (Index: `battleId`)
3. `finalMaterials`: `{ id, roundId, battleId, text, createdAt, updatedAt }` (Indices: `roundId` (unique), `battleId`)
4. `drafts`: `{ id, roundId, battleId, title, content, category, status, tags, notes, createdAt, updatedAt }` (Indices: `roundId`, `battleId`, `category`, `status`)
5. `schemes`: `{ id, roundId, battleId, title, topic, angle, status, wordAssociations, references, punchlines, draftBars, supportingNotes, createdAt, updatedAt }` (Indices: `roundId`, `battleId`, `status`)
6. `schemeDrafts`: `{ id, schemeId, draftId, createdAt }` (Indices: `schemeId`, `draftId`)
7. `rhymes`: `{ id, text, collection, kind, notes, battleId, isGeneral, createdAt, updatedAt }` (Indices: `battleId`, `roundId`)
8. `pronunciations`: `{ id, word, phonetic, notes, tags, createdAt, updatedAt }` (Index: `word`)
9. `voiceNotes`: `{ id, title, description, durationMs, recordedAt, battleId, roundId, draftId, schemeId, tags, mimeType }` (Indices: `battleId`, `roundId`, `draftId`, `schemeId`)
10. `audioBlobs`: `{ id, voiceNoteId, mimeType, blob }` (Index: `voiceNoteId`)
11. `pinnedBars`: `{ id, text, source, battleId, roundId, createdAt, updatedAt }` (Indices: `battleId`, `roundId`)
12. `opponents`: `{ id, name, alias, league, style, strengths, weaknesses, counterAngles, notes, createdAt, updatedAt }`
13. `opponentNotes`: `{ id, opponentId, body, linkedBattleIds, createdAt }` (Index: `opponentId`)
14. `referenceLines`: `{ id, text, emcee, opponent, battle, league, round, timestamp, sourceUrl, origin, createdAt }`
15. `scans`: `{ id, battleId, roundId, submittedText, scannedAt, mode, reviewStatus }`
16. `scanMatches`: `{ id, scanId, referenceLineId, matchedLine, referenceLine, category, reviewStatus }`
17. `settings`: `{ key, value }`

---

## 4. Verification and Test Results

### 1. Automated Browser E2E Tests (`tests/e2e.py`)
- **Total Assertions:** 136
- **Passed:** 136 (100%)
- **Test execution command:** `python tests/e2e.py`
- **Coverage:**
  - App boot and dashboard rendering
  - Battle creation and navigation to Round 1
  - Studio Two-Workspace split verification
  - Draggable divider drag-resizing and width clamping
  - Collapsible drawer toggle and reopen pill
  - Final Material debounced autosave (600ms) and honest save state verification (`Saving…` → `Saved` → `Saved just now`)
  - Text formatting preservation (Taglish, intentional typos, line breaks)
  - Inter-round switching with automatic teardown flush
  - Supporting tab switching without unmounting Final Material
  - **Phase 4: Simplified Drafts:**
    - Inline editor creation (no modal)
    - Category & Status dropdowns at top
    - 2-state status (`In Progress` / `Done`)
    - Simplified draft card (Title, single-line preview, status dropdown ONLY)
    - Independent status dropdown change without opening editor
    - Clicking card opens inline editor with loaded values
    - Direct "Append to Final" into active editor
    - "Back" button returns to list
  - **Phase 4: Simplified Schemes:**
    - Inline editor creation (no modal)
    - Clean cards (Title, preview, NO status dropdown)
    - Scheme Voice / Flow Recording:
      - Live MediaRecorder with fake audio stream
      - Live timer and recording indicator
      - Stop take, auto-save to IndexedDB with `schemeId`
      - Audio player element rendered for scheme take
      - Multiple takes per scheme with playback and delete
    - Direct "Append to Final" of scheme draft bars
    - "Back" button returns to scheme list
  - Opponent research dossier creation
  - Line checker reference database and similarity scan
  - Global search across all entities
  - Full ZIP backup export (including scheme audio recordings) and schema-validated restore
  - Plain text script export
  - Offline capability with network disabled
  - Simulated storage write failure (honest "Save failed") and recovery

### 2. In-Browser Unit Tests (`tests/runner.html`)
- **Total Tests:** 12
- **Passed:** 12 (100%)
- **Test execution:** `python -c "... tests/runner.html ..."` or open `runner.html` in browser.
