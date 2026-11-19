import { h, confirmDialog } from '../core/ui.js';
import { HIGHLIGHT_PALETTE } from './highlight-state.js';

// Kept as an export for older imports; the palette itself now lives in highlight-state.js
export { HIGHLIGHT_PALETTE };

let activeMenu = null;

export function closeContextMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('contextmenu', onDocContext, true);
    document.removeEventListener('keydown', onDocKey, true);
    window.removeEventListener('resize', closeContextMenu);
    window.removeEventListener('blur', closeContextMenu);
  }
}

function onDocClick(e) {
  if (activeMenu && !activeMenu.contains(e.target)) {
    closeContextMenu();
  }
}

function onDocContext(e) {
  // A right-click anywhere else closes the old menu first (the new menu, if any, opens afterwards)
  if (activeMenu && !activeMenu.contains(e.target)) closeContextMenu();
}

function onDocKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation(); // closing the menu must not also leave focus mode
    closeContextMenu();
  }
}

function placeMenu(menu, event) {
  menu.style.maxHeight = `${window.innerHeight - 20}px`;
  menu.style.overflowY = 'auto';
  const menuRect = menu.getBoundingClientRect();
  let x = event.clientX;
  let y = event.clientY;
  if (x + menuRect.width > window.innerWidth - 10) x = window.innerWidth - menuRect.width - 10;
  if (y + menuRect.height > window.innerHeight - 10) y = window.innerHeight - menuRect.height - 10;
  menu.style.left = `${Math.max(10, x)}px`;
  menu.style.top = `${Math.max(10, y)}px`;
}

function armDismissal() {
  // Attach after this event loop tick so the opening click does not close it at once
  setTimeout(() => {
    if (!activeMenu) return;
    document.addEventListener('click', onDocClick);
    document.addEventListener('contextmenu', onDocContext, true);
    document.addEventListener('keydown', onDocKey, true);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('blur', closeContextMenu);
  }, 0);
}

const SHORTCUT = /Mac|iPhone|iPad/.test(navigator.platform || '') ? { mod: '⌘' } : { mod: 'Ctrl+' };

/**
 * Writing-area right-click menu: Cut / Copy / Paste, the highlight section, then the editor's own actions.
 * The menu never takes focus or the text selection (mousedown is cancelled on everything in it).
 *
 * @param {MouseEvent} event
 * @param {object} spec
 * @param {string}  [spec.header]            e.g. '"some words"' or '3 selections'
 * @param {boolean} spec.hasSelection        enables Cut/Copy and the highlight section
 * @param {{cut:Function,copy:Function,paste:Function}} spec.clipboard
 * @param {object|null} spec.highlight       { getLast, getRecent, apply(color), remove(), more(anchorRect), clearAll() }
 * @param {Array<{label:string, action:Function}>} [spec.actions]  shown after a divider
 */
export function openEditorContextMenu(event, spec) {
  event.preventDefault();
  closeContextMenu();

  const { hasSelection, clipboard, highlight, actions = [], header = '' } = spec;
  const run = (fn) => (e) => {
    e.stopPropagation();
    closeContextMenu();
    fn();
  };
  const item = (label, fn, { disabled = false, hint = '', cls = '' } = {}) => {
    const btn = h('button', {
      type: 'button',
      class: `context-item context-menu-item ${cls}`.trim(),
      role: 'menuitem',
      disabled: !!disabled,
      onclick: disabled ? (e) => e.stopPropagation() : run(fn),
    }, h('span', { class: 'context-label' }, label), hint ? h('span', { class: 'context-hint' }, hint) : null);
    return btn;
  };

  const els = [];
  if (header) els.push(h('div', { class: 'context-header' }, header));

  els.push(
    item('Cut', clipboard.cut, { disabled: !hasSelection, hint: `${SHORTCUT.mod}X` }),
    item('Copy', clipboard.copy, { disabled: !hasSelection, hint: `${SHORTCUT.mod}C` }),
    item('Paste', clipboard.paste, { hint: `${SHORTCUT.mod}V` }),
  );

  if (hasSelection && highlight) {
    els.push(h('div', { class: 'context-divider' }));
    const last = highlight.getLast();
    const recent = highlight.getRecent();
    els.push(h('div', { class: 'context-section-label' }, 'Highlight'));
    els.push(h('button', {
      type: 'button', class: 'context-item context-menu-item context-hl-last', role: 'menuitem',
      title: `Highlight with the last used color (${last})`,
      onclick: run(() => highlight.apply(last)),
    }, h('span', { class: 'context-chip', style: `background-color: ${last};` }), h('span', { class: 'context-label' }, 'Last used')));
    if (recent.length) {
      els.push(h('div', { class: 'context-palette-row', role: 'group', 'aria-label': 'Recent colors' },
        ...recent.slice(0, 8).map((c) => h('button', {
          type: 'button', class: 'context-swatch', style: `background-color: ${c};`,
          title: `Highlight ${c}`, 'aria-label': `Highlight ${c}`,
          onclick: run(() => highlight.apply(c)),
        }))));
    }
    els.push(h('button', {
      type: 'button', class: 'context-item context-menu-item', role: 'menuitem',
      onclick: (e) => {
        e.stopPropagation();
        const r = menu.getBoundingClientRect(); // open the palette next to the menu
        const anchor = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        closeContextMenu();
        highlight.more(anchor);
      },
    }, h('span', { class: 'context-label' }, 'More colors…')));
    els.push(item('✕ Remove highlight', highlight.remove, { cls: 'context-subtle' }));
    if (highlight.clearAll) {
      els.push(h('button', {
        type: 'button', class: 'context-item context-menu-item context-subtle', role: 'menuitem',
        onclick: async (e) => {
          e.stopPropagation();
          closeContextMenu();
          const ok = await confirmDialog({
            title: 'Clear All Highlights?',
            message: 'Remove all color highlights in this writing area? Your words and line breaks will remain untouched.',
            confirmLabel: 'Clear Highlights',
            danger: false,
          });
          if (ok) highlight.clearAll();
        },
      }, 'Clear all highlights in field'));
    }
  }

  if (hasSelection && actions.length) {
    els.push(h('div', { class: 'context-divider' }));
    for (const act of actions) els.push(item(act.label, act.action));
  }

  const menu = h('div', {
    class: 'baraha-context-menu baraha-editor-menu',
    role: 'menu',
    onmousedown: (e) => e.preventDefault(), // keep focus + selection in the writing area
  }, ...els);
  document.body.appendChild(menu);
  activeMenu = menu;
  placeMenu(menu, event);
  armDismissal();
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
  placeMenu(menu, event);
  armDismissal();
}
