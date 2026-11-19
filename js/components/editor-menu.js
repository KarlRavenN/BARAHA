import { toast } from '../core/ui.js';
import { openEditorContextMenu } from './context-menu.js';
import { openHighlightPalette } from './highlight-picker.js';
import {
  getLastColor, getRecentColors, recordHighlightColor, loadHighlightState,
} from './highlight-state.js';
import {
  mergeSpans, spanTexts, getSelectionSpan, setSelectionSpan,
  applyHighlightToSpans, removeHighlightFromSpans, deleteSpans, clearAllHighlights,
} from './rich-editor.js';

/**
 * Selection actions for a writing area: copy, cut, paste, highlight, remove highlight, delete.
 * Every action works on ALL selected pieces (the multi-selection from multi-select.js) and is ONE
 * undo step (edit-history.js). Drafts and Schemes use it without multi/history and get the same menu.
 *
 * @param {HTMLElement} area contenteditable writing area
 * @param {object} [opts]
 * @param {object} [opts.multi]    multi-select controller (optional)
 * @param {object} [opts.history]  edit history (optional)
 * @param {Function} [opts.onChanged] called after our own DOM changes (e.g. save)
 */
export function createEditorOps(area, { multi = null, history = null, onChanged = () => {} } = {}) {
  const nativeSpans = () => { const s = getSelectionSpan(area); return s ? [s] : []; };
  const getSpans = () => (multi ? multi.getSpans() : nativeSpans());
  const texts = (spans = getSpans()) => spanTexts(area, spans);

  function setSpans(spans) {
    const list = mergeSpans(spans);
    if (multi) multi.setSpans(list);
    else if (list.length) { area.focus(); const l = list[list.length - 1]; setSelectionSpan(area, l.start, l.end); }
  }

  /** Runs one DOM-changing action as a single undo step. `after` returns the spans to select afterwards. */
  function change(spans, fn, after = () => spans) {
    if (history) history.markSelection();
    const ok = fn();
    if (!ok) return false;
    setSpans(after());
    // Synthetic input: counts, autosave, find bar and the undo history all listen to it
    area.dispatchEvent(new Event('input', { bubbles: true }));
    onChanged();
    return true;
  }

  function highlight(color, spans = getSpans()) {
    if (!spans.length) return false;
    return change(spans, () => applyHighlightToSpans(area, color, spans));
  }
  function unhighlight(spans = getSpans()) {
    if (!spans.length) return false;
    return change(spans, () => removeHighlightFromSpans(area, spans));
  }
  function deleteSelection(spans = getSpans()) {
    if (!spans.length) return false;
    const first = mergeSpans(spans)[0];
    if (history) history.markSelection();
    if (!deleteSpans(area, spans)) return false;
    if (multi) multi.clear();
    area.focus();
    setSelectionSpan(area, first.start, first.start); // caret where the first piece was
    area.dispatchEvent(new Event('input', { bubbles: true }));
    onChanged();
    return true;
  }
  function clearAll() {
    change([], () => {
      if (!area.querySelector('mark')) return false;
      clearAllHighlights(area);
      return true;
    }, () => []);
  }

  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall back below */ }
    try { // older browsers / blocked API: copy through a hidden textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  async function copy(spans = getSpans()) {
    if (!spans.length) return false;
    const ok = await writeClipboard(texts(spans).join('\n'));
    setSpans(spans); // the fallback may have moved the selection
    if (!ok) toast('Could not copy. Use Ctrl+C instead.', 'error');
    return ok;
  }
  async function cut(spans = getSpans()) {
    if (!spans.length) return false;
    const ok = await copy(spans);
    if (!ok) return false; // never delete text that did not reach the clipboard
    return deleteSelection(spans);
  }
  async function paste() {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast('Your browser blocked paste here. Press Ctrl+V instead.');
      return false;
    }
    if (!text) return false;
    if (multi) multi.clear(); // pasting replaces the last selection only
    area.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount || !area.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const r = document.createRange();
      r.selectNodeContents(area);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    // Same path as the editor's paste handler: plain text only, no markup
    return document.execCommand('insertText', false, text);
  }

  return { getSpans, texts, setSpans, highlight, unhighlight, deleteSelection, clearAll, copy, cut, paste };
}

const snippet = (t) => `"${t.slice(0, 24)}${t.length > 24 ? '…' : ''}"`;

/**
 * Opens the writing-area right-click menu for `area`.
 * @param {MouseEvent} event
 * @param {object} ops createEditorOps(...)
 * @param {object} [o]
 * @param {(texts:string[])=>Array} [o.buildActions] editor-specific actions (rhymes, pin bar...) for the selected texts
 * @param {boolean} [o.canClearAll]
 */
export function showEditorMenu(event, ops, { buildActions = () => [], canClearAll = true } = {}) {
  const spans = ops.getSpans(); // captured now: later actions use exactly what was selected when the menu opened
  const selected = ops.texts(spans);
  const hasSelection = spans.length > 0;
  const count = spans.length;
  loadHighlightState();

  const header = count > 1 ? `${count} selections` : (count === 1 ? snippet(selected[0].trim() || selected[0]) : '');
  const finish = () => ops.setSpans(spans);

  openEditorContextMenu(event, {
    header,
    hasSelection,
    clipboard: {
      cut: () => ops.cut(spans),
      copy: () => ops.copy(spans),
      paste: () => ops.paste(),
    },
    highlight: {
      getLast: getLastColor,
      getRecent: getRecentColors,
      apply: (color) => {
        if (ops.highlight(color, spans)) recordHighlightColor(color);
        else toast('Select some words (not only spaces) to highlight');
      },
      remove: () => { ops.unhighlight(spans); },
      more: (anchorRect) => {
        openHighlightPalette({
          anchorRect,
          onPick: (color) => {
            const ok = ops.highlight(color, spans);
            if (ok) recordHighlightColor(color);
            return ok;
          },
          onNone: () => ops.unhighlight(spans),
          onClose: finish,
        });
      },
      clearAll: canClearAll ? () => { ops.clearAll(); toast('All highlights cleared'); } : null,
    },
    actions: hasSelection ? buildActions(selected.map((t) => t.trim()).filter(Boolean)) : [],
  });
}
