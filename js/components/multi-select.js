import {
  mergeSpans, rangeToSpan, spanToRange, getSelectionSpan, setSelectionSpan,
} from './rich-editor.js';

/**
 * Ctrl (Cmd on Mac) multi-select for a contenteditable writing area. Desktop only.
 *
 * Browsers only allow ONE native text selection, so extra selections are kept here as a list of live
 * Range objects and painted with the CSS Custom Highlight API (CSS.highlights, name "baraha-multi").
 * Browsers without it get an overlay of positioned boxes. The saved text is NEVER changed to show a selection.
 *
 * "All selections" = the extra ranges + the current native selection. The first selection counts as one.
 * Cleared by: a normal click, Esc, typing a character, navigation keys, or any real edit.
 */
const HL_NAME = 'baraha-multi';
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
export const isMultiKey = (e) => (isMac ? e.metaKey : e.ctrlKey);
const supportsHighlightApi = () => typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

export function createMultiSelect(area, { onChange = () => {}, scrollEl = null, forceOverlay = false } = {}) {
  let extras = []; // live Range objects
  let overlay = null;
  const useApi = !forceOverlay && supportsHighlightApi();
  const host = scrollEl || area.parentElement;

  function pruneDead() {
    extras = extras.filter((r) => !r.collapsed && area.contains(r.startContainer) && area.contains(r.endContainer));
  }

  // ---------- drawing ----------
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'multi-select-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    host.appendChild(overlay);
    return overlay;
  }
  function drawOverlay() {
    if (!extras.length) { if (overlay) overlay.replaceChildren(); return; }
    const o = ensureOverlay();
    const hostRect = host.getBoundingClientRect();
    const frag = document.createDocumentFragment();
    for (const r of extras) {
      for (const rect of r.getClientRects()) {
        if (rect.width < 1 || rect.height < 1) continue;
        const box = document.createElement('div');
        box.className = 'multi-select-box';
        box.style.left = `${rect.left - hostRect.left + host.scrollLeft}px`;
        box.style.top = `${rect.top - hostRect.top + host.scrollTop}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
        frag.appendChild(box);
      }
    }
    o.replaceChildren(frag);
  }
  function render() {
    pruneDead();
    if (useApi) {
      if (extras.length) CSS.highlights.set(HL_NAME, new Highlight(...extras));
      else CSS.highlights.delete(HL_NAME);
    } else {
      drawOverlay();
    }
  }
  // The overlay is positioned from screen rectangles, so redraw when the layout moves
  const redraw = () => { if (!useApi && extras.length) drawOverlay(); };
  if (!useApi) {
    host.addEventListener('scroll', redraw, { passive: true });
    window.addEventListener('resize', redraw);
  }

  // ---------- state ----------
  const nativeSpan = () => getSelectionSpan(area);

  /** Extra selections as spans (without the native one). */
  function getExtraSpans() {
    pruneDead();
    return mergeSpans(extras.map((r) => rangeToSpan(area, r)).filter(Boolean));
  }
  /** Every selection (extras + native), merged and in document order. */
  function getSpans() {
    const n = nativeSpan();
    return mergeSpans([...getExtraSpans(), ...(n ? [n] : [])]);
  }
  const count = () => getSpans().length;
  const hasExtras = () => { pruneDead(); return extras.length > 0; };

  function clear() {
    if (!extras.length) return;
    extras = [];
    render();
    onChange();
  }

  /** Make `spans` the selection: the last one becomes the native selection, the others are extras. */
  function setSpans(spans) {
    const list = mergeSpans(spans);
    extras = [];
    if (!list.length) { render(); onChange(); return; }
    const lastSpan = list[list.length - 1];
    extras = list.slice(0, -1).map((s) => spanToRange(area, s));
    setSelectionSpan(area, lastSpan.start, lastSpan.end);
    render();
    onChange();
  }

  /** Is the screen point inside any selected piece (extras or the native selection)? */
  function hitTest(x, y) {
    const sel = window.getSelection();
    const ranges = [...extras];
    if (sel && sel.rangeCount && !sel.isCollapsed && area.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      ranges.push(sel.getRangeAt(0));
    }
    return ranges.some((r) => {
      for (const rect of r.getClientRects()) {
        if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1) return true;
      }
      return false;
    });
  }

  // ---------- events ----------
  function onMouseDown(e) {
    if (e.button === 2) {
      // Right-click on a selected piece keeps ALL selections (the browser would move the caret otherwise)
      if (hasExtras() || nativeSpan()) {
        if (hitTest(e.clientX, e.clientY)) {
          if (hasExtras()) e.preventDefault();
          return;
        }
        clear();
      }
      return;
    }
    if (e.button !== 0) return;
    if (isMultiKey(e)) {
      // Ctrl + press: keep what is selected now, then let the browser start the NEXT selection
      const n = nativeSpan();
      if (n) {
        extras.push(spanToRange(area, n));
        extras = getExtraSpans().map((s) => spanToRange(area, s)); // merge overlaps
        window.getSelection().removeAllRanges();
        render();
        onChange();
      }
    } else if (extras.length) {
      clear(); // a normal click starts over
    }
  }

  function onKeyDown(e) {
    if (!extras.length) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // do not also leave focus mode
      clear();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
    // Copy / cut / delete / highlight shortcuts are handled by the editor; everything else that types or moves starts over.
    if (mod && ['c', 'x', 'h', 'C', 'X', 'H'].includes(key)) return;
    if (key === 'Backspace' || key === 'Delete') return; // editor deletes all pieces
    if (key === 'Control' || key === 'Meta' || key === 'Shift' || key === 'Alt') return;
    if (navKeys.includes(key) || key === 'Enter' || key === 'Tab' || (key.length === 1) || mod) clear();
  }

  function onBeforeInput(e) {
    // A real edit (typing, paste, undo) invalidates the extra selections. Our own edits are synthetic.
    if (e.isTrusted && extras.length) clear();
  }

  area.addEventListener('mousedown', onMouseDown, true);
  area.addEventListener('keydown', onKeyDown, true);
  area.addEventListener('beforeinput', onBeforeInput);

  function destroy() {
    area.removeEventListener('mousedown', onMouseDown, true);
    area.removeEventListener('keydown', onKeyDown, true);
    area.removeEventListener('beforeinput', onBeforeInput);
    host.removeEventListener('scroll', redraw);
    window.removeEventListener('resize', redraw);
    extras = [];
    if (useApi) CSS.highlights.delete(HL_NAME);
    if (overlay) { overlay.remove(); overlay = null; }
  }

  return {
    getExtraSpans, getSpans, count, hasExtras, clear, setSpans, hitTest, render, destroy,
    usesHighlightApi: useApi,
  };
}
