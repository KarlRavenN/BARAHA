# BARAHA — Design System

Dark, minimal, writing-first. Tokens live in `css/tokens.css`; component styles in `css/app.css`.

## Palette
| Role | Value | Use |
|---|---|---|
| Primary red | `#A60000` (`--red`) | Primary buttons, active-tab/nav indicator, red tags (borders) |
| Light gray | `#A29F9F` (`--gray-light`, `--text-dim`) | Secondary text, focus rings |
| Medium gray | `#777675` (`--gray-mid`, `--text-faint`) | Disabled/tertiary text, hover borders |
| Charcoal | `#262323` (`--charcoal`, `--surface`) | Sidebar, editor surface, modals |
| White | `#FFFFFF` (`--white`) | Emphasis (active labels, primary button text) |

Derived tones: `--bg #1c1a1a` app background, `--surface-2 #302c2c` inputs/hover, `--line #3a3636` hairlines, `--text #ECEAEA` body (softer than pure white for long sessions), `--red-text #E05A5A` (brand red step for legibility on dark surfaces), `--ok #7FB685`, `--danger #E05A5A`.

## Typography
UI: system sans (`system-ui, Segoe UI, Roboto`).
Writing area: monospace stack (`Cascadia Mono, Consolas, SF Mono, Menlo`) at 16px default, 1.7 line height, user-adjustable 13–24px. Scale: 12.5 / 14.5 / 18 / 24px. Base weight 400, headings 600.

## Spacing and Layout
- 4-px scale `--s1..--s6` (4, 8, 12, 16, 24, 32). Radius 6px. Sidebar width 208px.
- Standard pages: `.page` max-width 1000px.
- Two-Workspace Studio: `.page.workspace-studio` utilizes 100% viewport width and height.

## Studio Workspace Layout Architecture (Phase 3)
- `.workspace-split`: Flex container with Workspace A, resizable divider, and Workspace B.
- `.workspace-main`: Main stage occupying ~60% width by default. Houses the Final Material editor, word/char counters, and docked compact rhyme bar.
- `.workspace-divider`: Draggable vertical split divider with grip indicator, hover states, and smooth drag-resizing between 260px and 55vw.
- `.workspace-supporting`: Secondary drawer occupying ~35% width. Contains independent scrollable content for Drafts, Schemes, Voice Notes, and Rhyme Bank.
- `.supporting-head` & `.supporting-tabs`: High-contrast tab strip allowing instant tool switching without unmounting or reloading the Final Material editor.
- `.workspace-reopen-pill`: Subtle floating pill that appears when the supporting panel is collapsed to allow instant expansion.

## Reusable UI Pieces
- `js/core/ui.js`: `h()` element builder (escapes text), `toast`, `confirmDialog`, `formDialog`, `download`.
- `js/components/text-editor.js`: `mountTextEditor` with autosave, counts, focus mode, undo/redo, width/font-size controls, context menu, and direct `appendText` / `insertText` APIs.
- `js/components/rhyme-bank.js`: `mountRhymeBank` supporting both compact collapsible docking and full-tab views, with reactive `baraha:rhymes-sync` synchronization.
- `js/components/context-menu.js`: Custom right-click menu tailored for battle rap workflows.
