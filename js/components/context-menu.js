import { h, confirmDialog } from '../core/ui.js';
import { isEditableWritingArea } from './rich-editor.js';

let activeMenu = null;

export const HIGHLIGHT_PALETTE = [
  { label: 'Red',    color: '#A60000', title: 'Red (Danger / Key Bar)' },
  { label: 'Orange', color: '#D97706', title: 'Orange (Angle / Setup)' },
  { label: 'Yellow', color: '#B45309', title: 'Yellow (Rhyme / Payoff)' },
  { label: 'Green',  color: '#15803D', title: 'Green (Completed Bar)' },
  { label: 'Blue',   color: '#1D4ED8', title: 'Blue (Delivery Cue)' },
  { label: 'Purple', color: '#7E22CE', title: 'Purple (Scheme / Concept)' },
];

export function closeContextMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKey);
  }
}

function onDocClick(e) {
  if (activeMenu && !activeMenu.contains(e.target)) {
    closeContextMenu();
  }
}

function onDocKey(e) {
  if (e.key === 'Escape') {
    closeContextMenu();
  }
}

/**
 * Mounts custom BARAHA context menu at cursor/selection coordinates.
 * @param {MouseEvent} event
 * @param {string} selectedText
 * @param {Array<{label: string, icon?: string, action: () => void}>} actions
 * @param {object} highlightOpts Optional highlighting options: { onHighlight, onRemoveHighlight, onClearAllHighlights }
 */
export function openContextMenu(event, selectedText, actions = [], highlightOpts = null) {
  event.preventDefault();
  closeContextMenu();

  if (!selectedText || !selectedText.trim()) return;

  // Preserve the selection range so clicking swatches doesn't lose it
  const sel = window.getSelection();
  const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

  function restoreSelection() {
    if (savedRange && window.getSelection) {
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(savedRange);
    }
  }

  const elements = [
    h('div', { class: 'context-header' }, `"${selectedText.slice(0, 24)}${selectedText.length > 24 ? '…' : ''}"`),
  ];

  // Check if selection is strictly inside an editable writing textbox
  const startEl = savedRange
    ? (savedRange.startContainer.nodeType === Node.ELEMENT_NODE ? savedRange.startContainer : savedRange.startContainer.parentElement)
    : null;
  const isInsideWritingBox = isEditableWritingArea(startEl);

  // Highlighting Section (only when right-clicking inside an editable writing area)
  if (isInsideWritingBox && highlightOpts && (highlightOpts.onHighlight || highlightOpts.onRemoveHighlight)) {
    const swatches = HIGHLIGHT_PALETTE.map((p) =>
      h('button', {
        class: 'context-swatch',
        style: `background-color: ${p.color};`,
        title: `Highlight: ${p.title}`,
        'aria-label': `Highlight ${p.label}`,
        onclick: (e) => {
          e.stopPropagation();
          restoreSelection();
          closeContextMenu();
          if (highlightOpts.onHighlight) highlightOpts.onHighlight(p.color);
        },
      })
    );

    const paletteRow = h('div', { class: 'context-palette-row' }, ...swatches);

    const highlightSection = h('div', { class: 'context-highlight-box' },
      h('div', { class: 'context-section-label' }, 'Highlight Color:'),
      paletteRow
    );

    elements.push(highlightSection);

    if (highlightOpts.onRemoveHighlight) {
      elements.push(h('button', {
        class: 'context-item context-subtle',
        onclick: (e) => {
          e.stopPropagation();
          restoreSelection();
          closeContextMenu();
          highlightOpts.onRemoveHighlight();
        },
      }, '✕ Remove Highlight'));
    }

    if (highlightOpts.onClearAllHighlights) {
      elements.push(h('button', {
        class: 'context-item context-subtle',
        onclick: async (e) => {
          e.stopPropagation();
          closeContextMenu();
          const ok = await confirmDialog({
            title: 'Clear All Highlights?',
            message: 'Remove all color highlights in this writing area? Your words and line breaks will remain untouched.',
            confirmLabel: 'Clear Highlights',
            danger: false,
          });
          if (ok) {
            highlightOpts.onClearAllHighlights();
          }
        },
      }, 'Clear All Highlights in Field'));
    }

    elements.push(h('div', { class: 'context-divider' }));
  }

  // General actions
  for (const act of actions) {
    elements.push(
      h('button', {
        class: 'context-item context-menu-item',
        onclick: (e) => {
          e.stopPropagation();
          closeContextMenu();
          act.action();
        },
      }, act.label)
    );
  }

  const menu = h('div', { class: 'baraha-context-menu' }, ...elements);

  document.body.appendChild(menu);
  activeMenu = menu;

  // Viewport clamping
  const menuRect = menu.getBoundingClientRect();
  let x = event.clientX;
  let y = event.clientY;

  if (x + menuRect.width > window.innerWidth - 10) {
    x = window.innerWidth - menuRect.width - 10;
  }
  if (y + menuRect.height > window.innerHeight - 10) {
    y = window.innerHeight - menuRect.height - 10;
  }

  menu.style.left = `${Math.max(10, x)}px`;
  menu.style.top = `${Math.max(10, y)}px`;

  // Attach outside dismissal listeners after this event loop tick
  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onDocKey);
  }, 0);
}

/**
 * Mounts a generic context menu (e.g. for round tabs) at mouse event coordinates.
 * @param {MouseEvent} event
 * @param {Array<{label: string, action?: () => void, danger?: boolean, disabled?: boolean, divider?: boolean}>} actions
 * @param {string} title
 */
export function openGenericContextMenu(event, actions = [], title = '') {
  event.preventDefault();
  closeContextMenu();

  const elements = [];
  if (title) {
    elements.push(h('div', { class: 'context-header' }, title));
  }

  for (const act of actions) {
    if (act.divider) {
      elements.push(h('div', { class: 'context-divider' }));
      continue;
    }
    const btn = h('button', {
      class: `context-item context-menu-item ${act.danger ? 'danger' : ''}`,
      disabled: !!act.disabled,
      onclick: (e) => {
        if (act.disabled) return;
        e.stopPropagation();
        closeContextMenu();
        if (act.action) act.action();
      },
    }, act.label);
    if (act.disabled) {
      btn.style.opacity = '0.45';
      btn.style.cursor = 'not-allowed';
    }
    elements.push(btn);
  }

  const menu = h('div', { class: 'baraha-context-menu' }, ...elements);
  document.body.appendChild(menu);
  activeMenu = menu;

  const menuRect = menu.getBoundingClientRect();
  let x = event.clientX;
  let y = event.clientY;

  if (x + menuRect.width > window.innerWidth - 10) {
    x = window.innerWidth - menuRect.width - 10;
  }
  if (y + menuRect.height > window.innerHeight - 10) {
    y = window.innerHeight - menuRect.height - 10;
  }

  menu.style.left = `${Math.max(10, x)}px`;
  menu.style.top = `${Math.max(10, y)}px`;

  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onDocKey);
  }, 0);
}
