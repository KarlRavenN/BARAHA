import { getSelectionOffsetsPublic, setSelectionSpan, mergeSpans } from './rich-editor.js';

/**
 * Undo / redo for ONE writing area, built on snapshots of its HTML + selection.
 *
 * Why not the browser's own undo: highlights (and multi-selection actions) change the DOM directly,
 * which the browser's undo stack cannot follow, so Ctrl+Z would skip them or act on the wrong place.
 * With snapshots every action is exactly one undo step: typing (grouped while you keep typing),
 * paste, cut, delete, apply highlight, remove highlight - including multi-selection actions.
 *
 * Contract:
 * - Real edits (typing, paste, cut...) are recorded from the area's `input` events.
 * - Our own DOM changes call `record()` (or dispatch a synthetic `input` event, which does the same).
 * - Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, the toolbar buttons and the browser's own history commands go through here.
 */
const MAX_STEPS = 300;
const TYPING_GROUP_MS = 900;
const TYPING_TYPES = new Set(['insertText', 'deleteContentBackward', 'deleteContentForward']);

export function createEditHistory(area, { onRestore = () => {}, getExtraSpans = () => [] } = {}) {
  let stack = [];
  let idx = -1;
  let restoring = false;
  let lastKind = null;
  let lastTime = 0;
  let composing = false;

  const snapshot = () => ({
    html: area.innerHTML,
    sel: getSelectionOffsetsPublic(area),
    extra: getExtraSpans(),
  });

  /** Start (or restart) history from the current content, e.g. after the saved text was loaded. */
  function reset() {
    stack = [snapshot()];
    idx = 0;
    lastKind = null;
  }

  /** Record the current content as a new step. `kind` lets rapid typing share one step. */
  function record(kind = null) {
    if (restoring) return;
    const snap = snapshot();
    const now = Date.now();
    const cur = stack[idx];
    if (cur && cur.html === snap.html) { // nothing changed (only the selection)
      cur.sel = snap.sel;
      return;
    }
    const groupable = kind && kind === lastKind && now - lastTime < TYPING_GROUP_MS && idx > 0;
    if (groupable) {
      stack[idx] = snap; // keep typing inside the same step
    } else {
      stack = stack.slice(0, idx + 1); // a new action ends the redo branch
      stack.push(snap);
      if (stack.length > MAX_STEPS) stack.shift();
      idx = stack.length - 1;
    }
    lastKind = kind;
    lastTime = now;
  }

  /** Call just before an action changes the DOM so Undo brings the selection back too. */
  function markSelection() {
    const cur = stack[idx];
    if (!cur) return;
    cur.sel = getSelectionOffsetsPublic(area) || cur.sel;
    cur.extra = getExtraSpans();
    lastKind = null; // the action below is its own step
  }

  function restore(snap) {
    restoring = true;
    try {
      area.innerHTML = snap.html;
      const sel = snap.sel;
      if (sel) {
        const extra = mergeSpans(snap.extra || []);
        setSelectionSpan(area, sel.start, sel.end);
        onRestore({ sel, extra });
      } else {
        onRestore({ sel: null, extra: [] });
      }
      // Tell the editor (counts, autosave, find bar) that the text changed
      area.dispatchEvent(new Event('input', { bubbles: true }));
    } finally {
      restoring = false;
    }
    lastKind = null;
  }

  function undo() {
    if (idx <= 0) return false;
    if (stack[idx].html !== area.innerHTML) record(); // safety: something changed without an event
    if (idx <= 0) return false;
    idx -= 1;
    restore(stack[idx]);
    return true;
  }

  function redo() {
    if (idx >= stack.length - 1) return false;
    idx += 1;
    restore(stack[idx]);
    return true;
  }

  const canUndo = () => idx > 0;
  const canRedo = () => idx < stack.length - 1;

  // ---------- events ----------
  function onInput(e) {
    if (restoring) return;
    if (composing || e.isComposing) return; // IME: record once when it finishes
    record(TYPING_TYPES.has(e.inputType) ? e.inputType : null);
  }
  const onCompStart = () => { composing = true; };
  const onCompEnd = () => { composing = false; record('insertText'); };

  function onBeforeInput(e) {
    if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); }
    else if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); }
  }

  function onKeyDown(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  }

  area.addEventListener('input', onInput);
  area.addEventListener('beforeinput', onBeforeInput);
  area.addEventListener('keydown', onKeyDown);
  area.addEventListener('compositionstart', onCompStart);
  area.addEventListener('compositionend', onCompEnd);

  function destroy() {
    area.removeEventListener('input', onInput);
    area.removeEventListener('beforeinput', onBeforeInput);
    area.removeEventListener('keydown', onKeyDown);
    area.removeEventListener('compositionstart', onCompStart);
    area.removeEventListener('compositionend', onCompEnd);
    stack = [];
  }

  return { reset, record, markSelection, undo, redo, canUndo, canRedo, destroy };
}
