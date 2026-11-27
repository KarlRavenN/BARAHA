# BARAHA — Feature Status (v0.6.0 Writing Workflow & UI Refinement)

Status legend: **[T]** Completed and tested · **[I]** Implemented but not fully tested · **[P]** Partially implemented · **[N]** Not implemented

"Tested" = covered by unit tests (12/12 in data layer, in-memory backend, store runner) and `python tests/e2e.py` (136/136 checks in real Chrome/Edge with real IndexedDB, run on final code).

## UI Polish C: Account menu, Profile, Settings (branch `ui-polish-c-account-settings`)
| Feature | Status | Notes |
|---|---|---|
| Account menu shows avatar + rapper name (also in the phone drawer) | [T] | Name is cut with "…" when long. Tested at 360/390/412 px. |
| Sync dot stays on the avatar with a tooltip | [T] | Green synced, pulsing amber syncing, gray offline/off, red problem. "Sync now" and "Synced just now" left the dropdown. |
| Dropdown: name + email, Profile, Settings, Sign out | [T] | Settings link removed from the sidebar; route `#/settings` still works. |
| Profile page `#/profile` (back button, rapper name, read-only email) | [T] | Name 1-30 chars, trimmed, saved with `updateUser`, sidebar updates at once. Real Supabase NOT tested (stubbed). |
| Change password (asks current password first) | [T] with a fake Supabase | Same 8-character rule as registration, show/hide, plain-word errors. |
| "Email me a code instead" | [T] with a fake Supabase | Reuses `forgotPassword` + 6-digit `verifyOtp('recovery')` + `updatePassword`. Real email NOT tested. |
| "Sign out and remove this device's data" | [T] with a fake Supabase | Warns about unsynced changes and offers Sync now; must type REMOVE; the local DB `baraha-<id>` is deleted on the next start. |
| Settings cleanup | [T] | Removed Appearance, Editor & Shortcuts list, About. Kept Rhyme Engine, Storage, Backup and Restore (unchanged). Plain titles, no numbers. |
| English rhyme switch fixed | [T] | Real `<input type="checkbox" role="switch">`, themed pill in one row with its label, works with keyboard. Same setting `englishRhymes`. |
| "?" shortcuts popup | [T] | Ctrl+/, Ctrl+H, Ctrl+Shift+R, Alt+F, Ctrl+F, Ctrl+Z/Y, Ctrl+click multi-select. Esc or Close shuts it. |
| Persistent storage button | [T] | Calls `navigator.storage.persist()` and reports the real result. |
| Cloud sync section in Settings | [T] | Status, last synced, waiting count, Sync now. New helper `js/core/sync-ui.js`. There is still no on/off switch (none existed before). |

| Profile page two columns on wide screens | [T] | Name + Email left, Password + This device right; one column on phones. |
| Fix: bottom of a long round could not be clicked | [T] | The writing box now grows with its text (`.editor-area > .editor` in `css/profile-settings.css`); clicking the blank band under the text puts the caret at the end instead of the top. |

Tests: `python tests/ui-polish-c-e2e.py` (about 100 checks, real Chromium, Supabase stubbed). Not tested: real phone, Opera, real Supabase sign-in/emails.

## Writing Workflow & UI Refinement (Phase 6)
| Feature | Status | Notes |
|---|---|---|
| Highlight Caret Boundary Escape | [T] | Pressing Space after highlighting does NOT inherit the highlight. Caret cleanly escapes mark; subsequent typing continues unhighlighted (`[highlight]gun[/highlight] today`). |
| Autosave-First Architecture | [T] | Manual save buttons ("Save", "Save Draft", "Save Scheme") removed. Debounced autosave (600ms) on typing, deleting, pasting, and dropdown changes. Lightweight status badge (`Saving…` → `Saved` → `Saved just now`). |
| Redundant Actions Removed | [T] | Removed "Append to Final", "Insert Cursor", and "Link Scheme" from Drafts and Schemes to prevent workflow clutter. |
| Simplified Add Rhyme Dialog | [T] | Streamlined to Rhyme Word/Phrase, Save Destination, and Collection. Rhyme Type and Notes/Context inputs completely removed. |
| Simplified Rhyme Bank | [T] | Custom Words tab completely removed from Rhyme Bank, keeping only Local Rhymes and Scoped Saved Rhymes. |
| Grouped Collections in Saved Rhymes | [T] | Saved rhymes grouped into collapsible cards by collection name, with count badge, toggle arrow, and case-insensitive collection merging. |
| Vertically Resizable Rhyme Panel | [T] | Docked Rhyme Bank features top draggable splitter handle (`.rhyme-panel-resizer`) with vertical height persistence (130px to 520px) in `localStorage` and settings. |
| Keyboard Shortcuts | [T] | Global `Ctrl+H` (highlight selection), `Ctrl+Shift+R` (focus rhyme search), `Ctrl+/` (global search), and `Esc` (close modal dialogs). |
| Pinned Bars System | [T] | Right-click context menu "📌 Pin Bar" across Final Material, Drafts, and Schemes. Collapsible pinned bars panel with battle & round links, copy, and unpin actions. Stored in IndexedDB `pinnedBars` store (Migration #3) and included in backups. |
| Writer Studio Dashboard Redesign | [T] | "Continue Writing" hero card with Quick Resume button jumping directly to active workspace, recently edited material list, recent battles list, recent voice notes, and de-emphasized subtle stats summary. |

## Writing Enhancements & Highlighting (Phase 5)
| Feature | Status | Notes |
|---|---|---|
| Text Highlighting across Writing Areas | [T] | 6 distinct accessible colors (Red, Orange, Yellow, Green, Blue, Purple). Works across Final Material, Drafts, and Schemes. |
| Textbox Boundary Restriction | [T] | Highlighting is strictly restricted to editable writing textboxes. Non-textbox text (sidebar, navbar, links) is rejected with feedback toasts. |
| Context Menu Highlighting & Swatches | [T] | Right-clicking selected text in writing fields presents highlight swatches, Remove Highlight, and Clear All Highlights. |
| Toolbar Quick Swatches | [T] | Header swatches allow one-click highlighting of selected text with selection preservation. |
| Clean Plain-Text Exports | [T] | `.txt` export strips all HTML `<mark>` tags, producing clean plain text with pristine formatting. |
| Left-Aligned Full-Width Editor | [T] | Main workspace textfield is left-aligned, eliminating fit-content collapse and enabling seamless typing after removing letters. |
| Persistent Panel Width Across Rounds | [T] | Supporting tools panel width and collapsed state persist across Round 1/2/3 navigation without resetting. |
| Streamlined Supporting Tools Drawer | [T] | Redundant Rhyme Bank removed from supporting panel, keeping Drafts, Schemes, and Voice Notes uncluttered. |

## Local Rhyme Engine & Scoped Rhyme Bank (Phase 5)
| Feature | Status | Notes |
|---|---|---|
| Battle-Specific vs General Saved Rhymes | [T] | Saved rhymes can be scoped to a specific battle or General Library (accessible in all battles). |
| Scope Filter Bar (`All`, `This Battle`, `General`) | [T] | Filter saved rhymes by battle or global scope with visual badges (`[This Battle]` vs `[General]`). |
| One-Click Scope Transfer | [T] | Transfer rhymes between "This Battle" and "General Library" with a single click. |
| Duplicate Prevention | [T] | Prevents accidental duplicate saves across the bank with immediate feedback. |
| Docked Rhyme Bank with Full Feature Set | [T] | Docked Rhyme Quick Bar features search mode, Local Rhymes, Scoped Saved Rhymes, and Custom Words dictionary. |
| Phonetic Coda Matching | [T] | Tagalog vowel harmony, diphthongs, and hip-hop codas (e.g. flow / glow / blow / slow). |
| 4 Categorized Engine Results | [T] | Cleanly separated into Exact Rhymes, Multi-Syllable Rhymes, Slant/Assonance, and Battle Word Associations. |
| Custom Pronunciation Dictionary | [T] | User-defined slang pronunciations persisted in IndexedDB `pronunciations` store. |

## Simplified Drafts & Schemes Workspace (Phase 4)
| Feature | Status | Notes |
|---|---|---|
| Simplified List View (List → Select → Edit → Back) | [T] | Uncluttered cards; clicking transitions smoothly to inline editor in supporting panel. |
| Clean Draft Cards (Title, 1-Line Preview, Status Dropdown ONLY) | [T] | No separate Edit, Append, Delete, or Link buttons on list card. Single-line truncated preview. |
| Independent Draft Status Dropdown | [T] | Dropdown change updates IndexedDB immediately with `e.stopPropagation()` without opening editor. |
| Two-State Draft Status (`In Progress` / `Done`) | [T] | Normalized 2-state workflow. Legacy active statuses cleanly map to `In Progress`, `Used` maps to `Done`. |
| Inline Draft Editor (Zero Modals) | [T] | Full writing textarea, Category & Status toolbar at top, tags/notes, Append/Insert/Delete actions, Back button. |
| Simplified Scheme Cards (Title, Preview, No Status Field) | [T] | Clean cards showing only Title and preview. Status field completely removed from normal scheme workflow. |
| Inline Scheme Editor (Zero Modals) | [T] | Title, topic, angle, draft bars textarea, word associations, references, punchline ideas, delivery notes. |
| Scheme Voice / Flow Recording | [T] | In-scheme flow recording with MediaRecorder, timer, pause/resume, take naming, and audio playback. |
| Reuse of Existing Voice Storage | [T] | Stores scheme recordings in IndexedDB `voiceNotes` (with `schemeId`) and `audioBlobs`. Preserved in ZIP backups. |
| Supporting Navigation Stays Visible | [T] | Tabs remain active and clickable at top of Supporting Tools panel; Final Material stays mounted on the left. |

## Two-Workspace Studio (Phase 3)
| Feature | Status | Notes |
|---|---|---|
| Split Layout: Workspace A (~60%) + Workspace B (~35%) | [T] | Desktop-optimized studio layout occupying full screen width and height. |
| Workspace A: Final Material Primary Focus | [T] | Editor always visible on the main stage, complete with autosave, counters, width/size controls. |
| Workspace B: 4 Supporting Tabs (Drafts, Schemes, Voice, Rhymes) | [T] | Clean tabbed drawer with independent scrolling and content swapping. |
| Zero Workspace A Reload on Tab Switch | [T] | Switching supporting tabs swaps only supporting drawer; Final Material never unmounts, preserving cursor and unsaved text. |
| Draggable Divider with Width Clamping | [T] | Smooth drag-resizing with mouse events, visual grip handle, clamped between 260px and 55vw. |
| Persistent Panel Width & Collapsed State | [T] | Saved to IndexedDB settings and restored across page loads and browser reloads. |
| Collapsible Drawer with Reopen Pill | [T] | Supporting panel folds away cleanly; subtle reopen pill lets user reclaim 100% of workspace width. |
| Dual Rhyme Bank Architecture | [T] | Collapsible compact bar docked under editor + full Rhyme Bank in Workspace B tab. |
| Cross-Instance Rhyme Synchronization | [T] | Adding/deleting rhymes in one instance dispatches `baraha:rhymes-sync`, instantly updating both views. |
| Direct Final Material Insertion | [T] | Drafts and Schemes feature "Append to Final" and "Insert Cursor" buttons that directly push into the active editor. |
| Round Notes Removed from Workspace | [T] | Cleaned up workspace navigation by removing Round Notes tabs; legacy notes safely preserved in IndexedDB/exports. |

## Foundation
| Feature | Status | Notes |
|---|---|---|
| Project structure, zero-dependency stack, Node + Python servers | [T] | `start.bat`, `serve.py` (Python), and `serve.mjs` (Node) provided for zero-dependency local running. |
| IndexedDB persistence with versioned migrations | [T] | All 15 stores created; verified across browser reloads. |
| Atomic multi-record writes | [T] | Verified on IndexedDB backend and memory backend. |
| Hash router with flush-on-leave | [T] | Route transitions await outgoing views before mounting next view. |
| Reusable UI helpers (modal, confirm, formDialog, toast) | [T] | Supports structured fields and custom DOM dialog bodies. |
| Design system (tokens + component CSS) | [T] | Primary red, charcoal, light gray, dark editor theme. |
| Offline use after load | [T] | 100% offline; zero external API dependencies. Tested with network disabled. |
| Optional online sync | [N] | Seams prepared in data layer; cloud sync intentionally deferred in local-first phase. |

## Dashboard
| Feature | Status | Notes |
|---|---|---|
| Live Totals (Battles, Active, Drafts, Schemes, Voice notes) | [T] | Real-time counts reflecting active IndexedDB records. |
| Recently opened battles / recently edited material | [T] | Direct navigation to battles and round material. |
| Quick-create battle action | [T] | Creates battle + 3 rounds, opens workspace immediately. |
| Quick-create draft action | [T] | Creates standalone or battle draft directly from dashboard. |

## Battle Management
| Feature | Status | Notes |
|---|---|---|
| Create / edit battle (all spec fields) | [T] | Title, opponent, league, date, status, location, notes. |
| Exactly three rounds per battle | [T] | Independent storage for Round 1, Round 2, Round 3. |
| Archive / restore | [T] | Safe alternative to deletion. |
| Delete with confirmation and clean cascade | [T] | Cascades to rounds, final material, drafts, schemes, voice notes, scans. Unrelated battles untouched. |
| Search and filter (Active / Archived / All) | [T] | Instant client-side search by title, opponent, league, location. |
| Opponent linking | [T] | Opponent name and reserved opponentId in battle records. |

## Final Material Editor
| Feature | Status | Notes |
|---|---|---|
| Dark editor, word / character / line counts | [T] | Real-time statistics, comfortable contrast. |
| Autosave (800 ms debounce), manual save (button, Ctrl+S) | [T] | Saved state appears only after IndexedDB transaction completes. |
| Honest save states (Saving / Saved / Save failed) | [T] | Error handling tested under simulated write failure. |
| Preserve Taglish, slang, phonetic spelling, no autocorrect | [T] | Spellcheck, autocorrect, and autocapitalize disabled. Byte-for-byte fidelity verified. |
| Switching rounds flushes unsaved text | [T] | Destruction flush tested in E2E. |
| Undo / redo | [T] | Native Ctrl+Z / Ctrl+Y with explicit toolbar buttons. |
| Focus mode (Alt+F, Esc) | [T] | Hides navigation for distraction-free writing. |
| Adjustable writing width & font size | [T] | Slider controls persisted in settings store (widths up to 1400px). |

## Rhyme Bank & Engine
| Feature | Status | Notes |
|---|---|---|
| Phonetic Tagalog/Taglish rhyme engine | [T] | Offline phonetic algorithm with exact, slant/assonance, multisyllabic, and concept associations. |
| Dynamic battle corpus expansion | [T] | Discovers rhymes from user's current battle rounds and drafts. |
| Click-to-insert rhyme pills | [T] | Clicking any rhyme pill inserts word directly into editor at cursor position. |
| Personal saved rhymes | [T] | Add, categorize, and delete custom rhymes and multi schemes. |
| Dual-panel presentation | [T] | Compact quick-access bar below editor + full tab inside Workspace B. |

## Voice Notes & Scheme Audio
| Feature | Status | Notes |
|---|---|---|
| In-browser audio recording | [T] | HTML5 MediaRecorder with live timer and recording indicator. |
| Audio persistence | [T] | Blobs stored directly in IndexedDB. |
| Scheme flow takes | [T] | Associated via `schemeId` with in-app playback and download. |
| Dedicated inbox | [T] | Accessible per-round, in Scheme editor, or globally in Voice Inbox. |

## Opponent Research
| Feature | Status | Notes |
|---|---|---|
| Opponent dossiers | [T] | Profile, style, league history, strengths, known weaknesses, counter-angles, timestamps. |
| Notes and battle linking | [T] | Structured note-taking per opponent. |

## Battle Rap Line Checker
| Feature | Status | Notes |
|---|---|---|
| Multi-bar scanning | [T] | Scans lines against local reference database. |
| Match tiers | [T] | Exact Match, Phrase Match, Possible Similarity. |
| Honesty | [T] | Returns 0 matches when reference DB is empty; never invents matches. |
| Reference database management | [T] | Add, search, and delete reference bars with emcee, league, and battle metadata. |

## Global Search
| Feature | Status | Notes |
|---|---|---|
| Multi-store search | [T] | Searches battles, round materials, drafts, schemes, saved rhymes, voice notes, opponents. |

## Backup & Export
| Feature | Status | Notes |
|---|---|---|
| JSON Backup & Restore | [T] | Complete database export/import with schema validation. |
| Full ZIP Backup with Audio | [T] | Packages database JSON and all raw audio blobs (including scheme flow takes). |
| Script Plain Text (.txt) Export | [T] | Generates formatted 3-round battle script text file. |


## Rhyme Engine v2 (rhyme-upgrade)
| Feature | Status | Notes |
|---|---|---|
| Real ending-sound matching | [T] | Compares the last 1-3 syllables (vowel family + actual ending consonants) instead of vowel + consonant class. Tagalog e~i / o~u harmony kept. |
| Scoring and ranking | [T] | Every result is scored (multi-syllable > exact > slant > assonance); best matches first, grouped Multi / Exact / Slant. |
| English sound model | [T] | English words map to the same sound tokens (dictionary + spelling-ending rules), so `fire` matches `liar` / `desire`, not Tagalog spellings. |
| Phrase search | [T] | Several words = phrase-ending search (`ka laban`). |
| Whole-library word pool | [T] | Words and bar endings (last 2-3 words of each line) from ALL battles, drafts and saved rhymes feed the local search. |
| Optional English suggestions (Datamuse) | [T] | Off by default (Settings > Rhyme Engine). Sends only the single English word searched, debounced, cached in localStorage. |
| Ending tag fix | [T] | `kalaban` now shows `-aban` (was `-ala`). |


## Cloud sync, Stage 1: local foundations (sync-stage-1)
| Feature | Status | Notes |
|---|---|---|
| Per-account local database | [T] | `baraha-<userId>`; two accounts in one browser never share data. A different account signing in reloads the app. |
| Change stamping + tombstones | [T] | `modifiedAt` and `syncQueue` written atomically with every data write; cascaded deletes and restore-from-backup are tracked. |
| Sync bookkeeping stores | [T] | `syncQueue`, `syncMeta` (migration v4). |
| Network sync | [ ] | Stage 2 (`sync.js` + Supabase `sync_records`). Nothing is sent to the cloud yet. |


## Landing page redesign (ui-landing-redesign)
| Feature | Status | Notes |
|---|---|---|
| Two-column landing (wall left, form right) | [T] | Visual only: `auth-screens.js` wraps the same forms in `authShell()`. Auth logic, routing and Firebase/Supabase calls are unchanged. |
| Battle-prep process wall | [T] | Opponent > Research > Round 1-3 > Performance on tape / pin / clip notes. No copy. On phones it becomes a 3x2 strip. |
| Spray-painted form panel + stencil button | [T] | CSS + inline SVG filters only. Inputs use the maroon palette. |
| New logo + favicon | [T] | `assets/baraha-logo*.png`, `favicon-32/192/512.png`, `apple-touch-icon.png`. Old `favicon.svg` removed. Logo also replaces the text wordmark in the sidebar and Wall header. |
| Tested | [T] | Chromium at 1440, 1280x640, 820, 390, 360 (no horizontal scroll); sign-in error, show/hide, forgot, register > verify flows (Supabase stubbed). Real Google Fonts and real Supabase were not reachable in the test sandbox. |

## Navbar, text size, password eye (ui-landing-redesign)
| Feature | Status | Notes |
|---|---|---|
| Top navbar (desktop) | [T] | Logo, The Wall, Global Search, Voice Inbox, account menu (drops down). Phones keep the top bar + slide-in drawer. |
| Opponent Research / Line Checker hidden from nav | [T] | Only the nav entries are hidden (`hidden: true` in `NAV_ALL`, `js/main.js`). Modules and routes `#/opponents`, `#/line-checker` are untouched; set `hidden: false` to restore. |
| Text size works on phones | [T] | Mobile CSS was forcing the editor to 16px; it now follows the size control. |
| Reset-to-16 button always visible | [T] | Greyed out (disabled) at 16 instead of disappearing, so the toolbar doesn't shift. |
| Eye icons for show/hide password | [T] | `assets/icons/eye-show.png` / `eye-hide.png` on a light chip (dark art vanishes on the maroon inputs). |

## Motion polish + Voice Inbox (ui-motion-voice-inbox)
| Feature | Status | Notes |
|---|---|---|
| Motion layer | [T] | `css/motion.css` (loaded last). Uses individual `scale`/`translate` so existing transforms still work. 150/200/250ms, ease-out, no bounce. Covers buttons, nav colours, inputs, card hover lift + page-load stagger, modals, account dropdown, toasts, skeleton loaders (`skeleton()` in `ui.js`), reduced-motion. |
| Page transition | [T] | `router.js` adds `page-enter` to `#view` only when the path changes; the nav never animates. |
| Exit animations | [T] | `removeAnimated()` in `ui.js` (modals, toasts, account menu). Removes instantly under reduced motion. |
| Voice Inbox | [T] | `js/modules/voice-inbox.js` at the unchanged `/voice` route. Lists ALL recordings (battle ones included) from the same store, so nothing is copied; delete removes the original. Name, date, duration, battle, Play/Pause/Stop, rename (+ assign battle), download, delete with confirm, search (name + battle), sort Newest/Oldest/Duration/Battle, empty state. |
| Shared recorder/player | [T] | `components/voice-recorder.js` (now used by the battle Voice Notes tab too) and `components/voice-player.js`. |
| Future hooks | [ ] | `core/voice-library.js` (`FILTERS`, `SORTS`, `decorate`, `searchText`) is where favorites, tags, folders, AI transcripts/summaries plug in. Not implemented. |
| Tests | [T] | `tests/voice-library.test.js`, `tests/motion-voice-inbox-e2e.py` (fake mic). Known stale failures not from this change: draft-creation unit test, ui-polish-a size/reset checks, ui-polish-c Line Checker menu check. |

## Sign-up, tools bubble and sheet (auth-back-buttons)
| Feature | Status | Notes |
|---|---|---|
| Back button on sign-up and code screens | [T] | Spray-paint arrow. Sign-up goes back to Sign in; code screen goes back to sign-up (or Forgot password for a reset). |
| Sign-up labels | [T] | "Enter Rap Name:" and "Enter Email address:"; no example placeholder. |
| Email validation | [T] | `js/core/email-check.js`. Format check, then the domain must be a common provider (Gmail, Yahoo, Outlook, Hotmail, iCloud, Proton, etc.). Near misses (gmial.com, yaho.com) get "Did you mean ...?" with a "Use this" tap. Unknown domains are blocked. |
| Tools bubble (phones) | [T] | Wrench icon (`assets/icons/tools-wrench.png`). Drag anywhere; release past an edge and it tucks away with 25% visible at 55% opacity. Tap the sliver to bring it back. Position remembered per device. Replaces "Rhymes & Tools". Desktop keeps "Supporting Tools". |
| Tools sheet close | [T] | Spray-paint back arrow replaces the » button. Swipe the sheet head down: past a third of its height or a quick flick closes it with an animation; otherwise it springs back. Reduced-motion users get a fade. |
| Tests | [T] | `tests/email-check.test.js`, `tests/tools-bubble-e2e.py` (Playwright, Supabase stubbed). Not tested on a real phone or Safari/Opera. |
