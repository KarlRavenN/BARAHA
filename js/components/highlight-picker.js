import { h, toast } from '../core/ui.js';
import {
  HIGHLIGHT_PALETTE, DEFAULT_HIGHLIGHT, loadHighlightState, getLastColor, getRecentColors,
  recordHighlightColor, onHighlightStateChange,
} from './highlight-state.js';
import { iconEl } from './icons.js';

/**
 * Collapsible highlight colour picker (Google Docs style).
 * - One toolbar button shows the last-used colour; tapping it opens the palette.
 * - Desktop: popover under the button. Phones: bottom sheet.
 * - Rows: BARAHA colours (the original six), recently used, full palette grid, custom colour, None.
 * - The text selection is saved when the palette opens and restored before applying,
 *   so colour pickers and sheets on phones can't lose the selection.
 */

// Full palette: grays, bright colours, then light and dark tints (same layout as Google Docs).
const GRID = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
];

const isPhone = () => window.matchMedia('(max-width: 768px)').matches;
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/**
 * Opens the full colour palette (popover on desktop, bottom sheet on phones).
 * Used by the toolbar button AND by "More colors..." in the right-click menu.
 * - anchorRect: DOMRect-like { left, right, top, bottom } the popover is placed next to (desktop).
 * - onPick(color): apply the colour; returns false when nothing could be highlighted.
 * - onNone(): remove the highlight; returns false when nothing could be changed.
 * - onClose(): called once when the palette closes.
 */
export function openHighlightPalette({ anchorRect = null, onPick, onNone, onClose = () => {}, onNeedSelection } = {}) {
  const needSel = onNeedSelection || (() => toast('Select text inside the writing area to highlight'));
  const current = getLastColor();
  let closed = false;

  function swatch(color, title, selected) {
    return h('button', {
      type: 'button',
      class: `hl-swatch${selected ? ' is-current' : ''}`,
      style: `background-color: ${color};`,
      title: title || color,
      'aria-label': `Highlight ${title || color}`,
      onmousedown: (e) => e.preventDefault(),
      onclick: () => pick(color),
    });
  }
  function section(label, ...children) {
    return h('div', { class: 'hl-section' }, h('div', { class: 'hl-label' }, label), ...children);
  }
  function pick(color) {
    const ok = onPick ? onPick(color) : false;
    close();
    if (ok === false) needSel();
  }

  const customInput = h('input', {
    type: 'color',
    class: 'hl-custom-input',
    value: /^#[0-9a-f]{6}$/i.test(current) ? current : DEFAULT_HIGHLIGHT,
    'aria-label': 'Pick a custom color',
  });
  customInput.addEventListener('change', () => pick(customInput.value));

  const noneBtn = h('button', {
    type: 'button',
    class: 'hl-none',
    onmousedown: (e) => e.preventDefault(),
    onclick: () => {
      const ok = onNone ? onNone() : false;
      close();
      if (ok === false) needSel();
    },
  }, iconEl('none', 16), h('span', {}, 'None'));

  const customLabel = h('label', { class: 'hl-custom' },
    h('span', { class: 'hl-custom-plus' }, iconEl('plus', 14)),
    h('span', {}, 'Custom'),
    customInput);

  const recent = getRecentColors();
  const parts = [
    h('div', { class: 'hl-top' }, noneBtn, customLabel),
    section('BARAHA colors', h('div', { class: 'hl-grid' },
      ...HIGHLIGHT_PALETTE.map((p) => swatch(p.color, p.title, same(p.color, current))))),
  ];
  if (recent.length) {
    parts.push(section('Recent', h('div', { class: 'hl-grid' }, ...recent.map((c) => swatch(c, c, same(c, current))))));
  }
  parts.push(section('All colors', h('div', { class: 'hl-grid hl-grid-full' },
    ...GRID.flat().map((c) => swatch(c, c, same(c, current))))));

  const phone = isPhone();
  const pop = h('div', { class: 'hl-popover', role: 'dialog', 'aria-label': 'Highlight color' },
    h('div', { class: 'hl-sheet-handle', 'aria-hidden': 'true' }), ...parts);
  pop.classList.toggle('is-sheet', phone);
  const backdrop = h('div', { class: `hl-backdrop${phone ? ' is-sheet' : ''}`, onclick: () => close() });
  document.body.append(backdrop, pop);

  if (!phone) {
    const r = anchorRect || { left: 20, right: 20, top: 20, bottom: 20 };
    const w = pop.offsetWidth;
    const ph = pop.offsetHeight;
    // Prefer the right of the anchor (next to the menu); fall back to its left, then the screen edge
    let left = r.right + 6;
    if (left + w > window.innerWidth - 8) left = r.left - w - 6;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - ph - 8))}px`;
  }

  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const onResize = () => close();
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    pop.remove();
    backdrop.remove();
    onClose();
  }
  return { close, el: pop };
}

export function createHighlightPicker({ getArea, applyColor, removeColor, onNeedSelection }) {
  let saved = null;
  let open = null; // { close }

  const colorBar = h('span', { class: 'hl-color-bar', style: `background-color: ${getLastColor()};` });
  const trigger = h('button', {
    type: 'button',
    class: 'ghost small-btn hl-trigger',
    title: 'Highlight color',
    'aria-label': 'Highlight color',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    onmousedown: (e) => e.preventDefault(), // keep the text selection
    onclick: () => (open ? close() : openPicker()),
  }, h('span', { class: 'hl-trigger-icon' }, iconEl('highlighter', 18), colorBar), iconEl('caret', 14, 'hl-caret'));

  // Last used + recent colours are shared with the right-click menu
  const syncBar = () => { colorBar.style.backgroundColor = getLastColor(); };
  const unsub = onHighlightStateChange(syncBar);
  loadHighlightState().then(syncBar);

  function captureSelection() {
    const sel = window.getSelection();
    saved = null;
    if (sel && sel.rangeCount > 0 && getArea().contains(sel.getRangeAt(0).commonAncestorContainer)) {
      saved = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection() {
    if (!saved) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(saved);
  }

  function openPicker() {
    captureSelection();
    trigger.setAttribute('aria-expanded', 'true');
    open = openHighlightPalette({
      anchorRect: trigger.getBoundingClientRect(),
      onNeedSelection,
      onPick: (color) => {
        restoreSelection();
        const ok = applyColor(color);
        if (ok) recordHighlightColor(color);
        return ok;
      },
      onNone: () => {
        restoreSelection();
        return removeColor();
      },
      onClose: () => {
        open = null;
        trigger.setAttribute('aria-expanded', 'false');
      },
    });
    // Toolbar popover sits under the button (not beside it)
    if (!isPhone() && open.el) {
      const r = trigger.getBoundingClientRect();
      const w = open.el.offsetWidth;
      open.el.style.top = `${Math.min(r.bottom + 6, window.innerHeight - open.el.offsetHeight - 8)}px`;
      open.el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    }
  }

  function close() { if (open) open.close(); }

  return { el: trigger, close, destroy: () => { close(); unsub(); }, getCurrent: getLastColor };
}
