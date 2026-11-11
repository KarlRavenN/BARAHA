import { h, toast } from '../core/ui.js';
import { HIGHLIGHT_PALETTE } from './context-menu.js';
import { iconEl } from './icons.js';
import { getSetting, setSetting } from '../core/store.js';

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

const MAX_RECENT = 10;
const DEFAULT_COLOR = HIGHLIGHT_PALETTE[0].color;
const isPhone = () => window.matchMedia('(max-width: 768px)').matches;
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function createHighlightPicker({ getArea, applyColor, removeColor, onNeedSelection }) {
  let current = DEFAULT_COLOR;
  let recent = [];
  let saved = null;
  let open = null; // { pop, backdrop, cleanup }

  const colorBar = h('span', { class: 'hl-color-bar', style: `background-color: ${current};` });
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

  // Restore last used + recent colours from settings
  Promise.all([getSetting('highlightLast', null), getSetting('highlightRecent', [])]).then(([last, rec]) => {
    const lastVal = last && typeof last === 'object' && 'value' in last ? last.value : last;
    const recVal = rec && typeof rec === 'object' && 'value' in rec ? rec.value : rec;
    if (typeof lastVal === 'string' && /^#[0-9a-f]{6}$/i.test(lastVal)) setCurrent(lastVal, false);
    if (Array.isArray(recVal)) recent = recVal.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, MAX_RECENT);
  }).catch(() => {});

  function setCurrent(color, persist = true) {
    current = color;
    colorBar.style.backgroundColor = color;
    if (persist) {
      recent = [color, ...recent.filter((c) => !same(c, color))].slice(0, MAX_RECENT);
      setSetting('highlightLast', color).catch(() => {});
      setSetting('highlightRecent', recent).catch(() => {});
    }
  }

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

  function pick(color) {
    restoreSelection();
    const ok = applyColor(color);
    close();
    if (ok) setCurrent(color);
    else (onNeedSelection || (() => toast('Select text inside the writing area to highlight')))();
  }

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

  function buildPopover() {
    const baraha = h('div', { class: 'hl-grid' },
      ...HIGHLIGHT_PALETTE.map((p) => swatch(p.color, p.title, same(p.color, current))));

    const customInput = h('input', {
      type: 'color',
      class: 'hl-custom-input',
      value: /^#[0-9a-f]{6}$/i.test(current) ? current : DEFAULT_COLOR,
      'aria-label': 'Pick a custom color',
    });
    customInput.addEventListener('change', () => pick(customInput.value));

    const noneBtn = h('button', {
      type: 'button',
      class: 'hl-none',
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        restoreSelection();
        const ok = removeColor();
        close();
        if (!ok) (onNeedSelection || (() => toast('Select text inside the writing area to highlight')))();
      },
    }, iconEl('none', 16), h('span', {}, 'None'));

    const customLabel = h('label', { class: 'hl-custom' },
      h('span', { class: 'hl-custom-plus' }, iconEl('plus', 14)),
      h('span', {}, 'Custom'),
      customInput);

    const parts = [
      h('div', { class: 'hl-top' }, noneBtn, customLabel),
      section('BARAHA colors', baraha),
    ];
    if (recent.length) {
      parts.push(section('Recent', h('div', { class: 'hl-grid' }, ...recent.map((c) => swatch(c, c, same(c, current))))));
    }
    parts.push(section('All colors', h('div', { class: 'hl-grid hl-grid-full' },
      ...GRID.flat().map((c) => swatch(c, c, same(c, current))))));

    return h('div', { class: 'hl-popover', role: 'dialog', 'aria-label': 'Highlight color' },
      h('div', { class: 'hl-sheet-handle', 'aria-hidden': 'true' }), ...parts);
  }

  function openPicker() {
    captureSelection();
    const phone = isPhone();
    const pop = buildPopover();
    pop.classList.toggle('is-sheet', phone);
    const backdrop = h('div', { class: `hl-backdrop${phone ? ' is-sheet' : ''}`, onclick: close });
    document.body.append(backdrop, pop);

    if (!phone) {
      const r = trigger.getBoundingClientRect();
      const w = pop.offsetWidth;
      pop.style.top = `${Math.min(r.bottom + 6, window.innerHeight - pop.offsetHeight - 8)}px`;
      pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    }

    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const onResize = () => close();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    trigger.setAttribute('aria-expanded', 'true');
    open = {
      pop,
      backdrop,
      cleanup: () => {
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', onResize);
      },
    };
  }

  function close() {
    if (!open) return;
    open.cleanup();
    open.pop.remove();
    open.backdrop.remove();
    open = null;
    trigger.setAttribute('aria-expanded', 'false');
  }

  return { el: trigger, close, destroy: close, getCurrent: () => current };
}
