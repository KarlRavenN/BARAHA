import { debounce } from '../core/util.js';
import { getSetting, setSetting } from '../core/store.js';
import { h, toast, confirmDialog } from '../core/ui.js';
import { openContextMenu, closeContextMenu } from './context-menu.js';
import { createHighlightPicker } from './highlight-picker.js';
import { iconEl } from './icons.js';
import { draftFormDialog } from '../modules/drafts.js';
import { schemeFormDialog } from '../modules/schemes.js';
import { lineCheckerDialog } from '../modules/line-checker.js';
import {
  sanitizeRichContent,
  htmlToPlainText,
  plainTextToHtml,
  applyHighlight,
  removeHighlight,
  clearAllHighlights,
  attachHighlightBoundaryHandler,
} from './rich-editor.js';

/**
 * Text editor component for battle rap writing.
 * - Supports inline color highlighting across words, phrases, and lines.
 * - Autosaves on pause (800ms) and on blur / unload.
 * - Preserves Taglish, street slang, and intentional line breaks verbatim.
 * - Live line, word, and character counts.
 * - Width & font size controls.
 * - Focus mode (Alt+F or button).
 * - Undo & Redo controls.
 * - Highlight tools in toolbar and custom BARAHA context menu.
 */
export function mountTextEditor(container, {
  label = 'Editor',
  placeholder = 'Write here…',
  showWriterTools = true,
  battleId = null,
  roundId = null,
  roundNumber = null,
  isDraft = false,
  load = async () => '',
  save = async () => {},
  onRhymeSearch = null,
  onSaveRhyme = null,
  onOpenFindBar = null,
} = {}) {
  let destroyed = false;
  let lastSaved = '';
  let inFlight = null;

  // Header controls
  const undoBtn = h('button', {
    class: 'ghost small-btn toolbar-undo-btn',
    title: 'Undo (Ctrl+Z)',
    'aria-label': 'Undo',
    onclick: () => { document.execCommand('undo'); refreshCounts(); },
  }, h('span', { class: 'tb-icon' }, '↶'), h('span', { class: 'tb-text' }, ' Undo'));

  const redoBtn = h('button', {
    class: 'ghost small-btn toolbar-redo-btn',
    title: 'Redo (Ctrl+Y)',
    'aria-label': 'Redo',
    onclick: () => { document.execCommand('redo'); refreshCounts(); },
  }, h('span', { class: 'tb-icon' }, '↷'), h('span', { class: 'tb-text' }, ' Redo'));

  const stateBadge = h('span', { class: 'save-state faint' }, 'Loading…');

  // Font size stepper (- 16 +), visible on desktop and phones
  const SIZE_MIN = 13;
  const SIZE_MAX = 24;
  let currentSize = 16;
  const sizeValue = h('span', { class: 'size-value', 'aria-live': 'polite' }, '16');
  const sizeDownBtn = h('button', {
    type: 'button', class: 'ghost size-step-btn', title: 'Smaller text', 'aria-label': 'Decrease font size',
    onmousedown: (e) => e.preventDefault(),
    onclick: () => setSize(currentSize - 1),
  }, iconEl('minus', 14));
  const sizeUpBtn = h('button', {
    type: 'button', class: 'ghost size-step-btn', title: 'Larger text', 'aria-label': 'Increase font size',
    onmousedown: (e) => e.preventDefault(),
    onclick: () => setSize(currentSize + 1),
  }, iconEl('plus', 14));
  const sizeControl = h('div', { class: 'toolbar-size-control', role: 'group', 'aria-label': 'Font size' },
    sizeDownBtn, sizeValue, sizeUpBtn);
  const exitFocus = h('button', { class: 'primary focus-exit', onclick: () => toggleFocus(false) }, 'Exit focus (Esc)');

  // Active round detection and "Mark Round Completed" button with spray animation
  const roundNum = roundNumber || (label.match(/round\s*(\d+)/i)?.[1]) || 1;
  let isRoundCompleted = false;

  const markCompleteBtn = h('button', {
    class: 'ghost small-btn mark-complete-toolbar-btn',
    title: `Mark Round ${roundNum} as completed (updates battle progress)`,
    onclick: async () => {
      if (!roundId) {
        isRoundCompleted = !isRoundCompleted;
        updateCompleteBtn();
        toast(`Round ${roundNum} status updated`);
        return;
      }
      try {
        const { toggleRoundCompleted } = await import('../core/store.js');
        const updated = await toggleRoundCompleted(roundId);
        isRoundCompleted = !!updated.completed;
        updateCompleteBtn();
        if (isRoundCompleted) {
          markCompleteBtn.classList.add('spray-animating');
          setTimeout(() => markCompleteBtn.classList.remove('spray-animating'), 300);
          toast(`Round ${roundNum} marked as completed! 🎯`);
        } else {
          toast(`Round ${roundNum} marked as in progress.`);
        }
        window.dispatchEvent(new CustomEvent('baraha:round-status-changed', {
          detail: { battleId, roundId, roundNumber: roundNum, completed: isRoundCompleted }
        }));
      } catch (err) {
        console.error(err);
        toast('Could not update round status', 'error');
      }
    },
  }, h('span', { class: 'lbl-full' }, `Mark Round ${roundNum} Completed`), h('span', { class: 'lbl-short' }, 'Complete'));

  function updateCompleteBtn() {
    markCompleteBtn.classList.toggle('completed', isRoundCompleted);
    markCompleteBtn.classList.toggle('sprayed', isRoundCompleted);
    markCompleteBtn.innerHTML = isRoundCompleted
      ? `<span class="spray-stencil-icon">✓</span> <span class="lbl-full">Round ${roundNum} Completed</span><span class="lbl-short">Completed</span>`
      : `<span class="lbl-full">Mark Round ${roundNum} Completed</span><span class="lbl-short">Complete</span>`;
  }

  // Collapsible highlight picker (Google Docs style): one button, palette opens on tap
  const afterHighlightChange = () => {
    refreshCounts();
    setState('saving', 'Unsaved changes');
    autosave();
  };
  const highlightPicker = createHighlightPicker({
    getArea: () => area, // `area` is created below, so it is read lazily
    applyColor: (color) => {
      const ok = applyHighlight(color, area);
      if (ok) afterHighlightChange();
      return ok;
    },
    removeColor: () => {
      const ok = removeHighlight(area);
      if (ok) afterHighlightChange();
      return ok;
    },
    onNeedSelection: () => toast('Select text inside the writing area to highlight'),
  });
  // Group holds the highlight button and the size stepper so they share one row on phones
  const formatGroup = h('div', { class: 'toolbar-format-group' }, highlightPicker.el, sizeControl);

  const findBtn = h('button', {
    class: 'ghost small-btn toolbar-find-btn',
    title: 'Find in Round (Ctrl+F)',
    'aria-label': 'Find in Round',
    onclick: () => {
      if (onOpenFindBar) onOpenFindBar();
    },
  }, iconEl('search', 18), h('span', { class: 'tb-text' }, ' Find'));

  // Ordered strictly from left to right:
  // 1. Highlight color button + 2. Font size stepper (grouped)
  // 3. Find
  // 4. Undo
  // 5. Redo
  // 6. Mark Round as Completed
  const showComplete = showWriterTools && !isDraft;
  const tools = showWriterTools ? [
    formatGroup,
    findBtn,
    undoBtn,
    redoBtn,
    ...(showComplete ? [markCompleteBtn] : []),
  ] : [highlightPicker.el];

  const bar = h('div', { class: 'editor-bar' },
    h('div', { class: 'row toolbar-status', style: 'gap: 8px; align-items: center;' },
      stateBadge),
    h('div', { class: 'spacer' }),
    ...tools);

  // Contenteditable Rich Editor Element
  const area = h('div', {
    class: 'editor rich-editor',
    contenteditable: 'false',
    'aria-label': label,
    spellcheck: 'false',
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    'data-placeholder': placeholder,
    tabindex: '0',
  });

  // Footer counts
  const linesCount = h('span', {}, '0 lines');
  const wordsCount = h('span', {}, '0 words');
  const charsCount = h('span', {}, '0 chars');
  const foot = h('div', { class: 'editor-foot' },
    linesCount, h('span', { class: 'faint' }, '·'),
    wordsCount, h('span', { class: 'faint' }, '·'),
    charsCount);

  const editorArea = h('div', {
    class: 'editor-area',
    onclick: (e) => {
      if (e.target === editorArea) {
        area.focus();
      }
    },
  }, area);

  const wrapper = h('div', { class: 'editor-wrap' },
    bar,
    editorArea,
    foot);

  container.replaceChildren(wrapper);

  function setState(kind, text) {
    stateBadge.className = `save-state ${kind}`;
    stateBadge.textContent = text;
  }

  function getRawHtml() {
    return sanitizeRichContent(area.innerHTML);
  }

  function getPlainText() {
    return htmlToPlainText(area.innerHTML);
  }

  function refreshCounts() {
    const text = getPlainText();
    const lines = text ? text.split('\n').length : 0;
    const words = (text.trim().match(/\S+/g) || []).length;
    linesCount.textContent = `${lines} line${lines === 1 ? '' : 's'}`;
    wordsCount.textContent = `${words} word${words === 1 ? '' : 's'}`;
    charsCount.textContent = `${text.length} char${text.length === 1 ? '' : 's'}`;
  }

  async function persist() {
    if (destroyed) return;
    const content = getRawHtml();
    if (content === lastSaved && stateBadge.textContent === 'Saved') return;
    setState('saving', 'Saving…');
    const myPromise = (async () => {
      try {
        await save(content);
        lastSaved = content;
        if (inFlight === myPromise) {
          setState('saved', 'Saved');
          setTimeout(() => {
            if (stateBadge.textContent === 'Saved') {
              stateBadge.textContent = 'Saved just now';
            }
          }, 2000);
        }
      } catch (e) {
        console.error('Save failed', e);
        if (inFlight === myPromise) setState('failed', `Save failed: ${e.message || 'storage error'}`);
      }
    })();
    inFlight = myPromise;
    await myPromise;
  }

  const autosave = debounce(persist, 600);

  // Attach boundary handler so pressing Space after a highlight types cleanly outside the mark
  attachHighlightBoundaryHandler(area, () => {
    refreshCounts();
    if (getRawHtml() !== lastSaved) setState('saving', 'Saving…');
    autosave();
  });

  function ensureCaretVisible() {
    try {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.top === 0 && rect.bottom === 0)) return;
      const scrollContainer = area.closest('.editor-area') || area;
      const containerRect = scrollContainer.getBoundingClientRect();
      const margin = 36;
      if (rect.bottom > containerRect.bottom - margin) {
        scrollContainer.scrollTop += (rect.bottom - containerRect.bottom + margin);
      } else if (rect.top < containerRect.top + margin) {
        scrollContainer.scrollTop -= (containerRect.top + margin - rect.top);
      }
    } catch (_) {}
  }

  area.addEventListener('input', () => {
    refreshCounts();
    if (getRawHtml() !== lastSaved) setState('saving', 'Saving…');
    autosave();
    ensureCaretVisible();
  });

  area.addEventListener('keyup', () => {
    ensureCaretVisible();
  });

  area.addEventListener('blur', () => {
    if (getRawHtml() !== lastSaved) persist();
  });

  area.addEventListener('keydown', (e) => {
    // Ctrl + H: Quick highlight selection with default yellow highlight
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      const ok = applyHighlight('#B45309', area);
      if (ok) {
        refreshCounts();
        setState('saving', 'Saving…');
        autosave();
        toast('Highlight applied (Ctrl+H)');
      } else {
        toast('Select text in editor to highlight (Ctrl+H)');
      }
    }
  });

  // Handle paste: strip arbitrary markup, preserve clean plain text + line breaks
  area.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (!text) return;
    document.execCommand('insertText', false, text);
    refreshCounts();
    setState('saving', 'Unsaved changes');
    autosave();
  });

  // Right-click BARAHA context menu
  area.addEventListener('contextmenu', (e) => {
    const sel = window.getSelection();
    const selected = sel ? sel.toString().trim() : '';
    if (!selected) return; // Allow normal browser context menu if no selection

    e.preventDefault();
    const actions = [
      {
        label: `Find Rhymes for "${selected.length > 18 ? selected.slice(0, 18) + '…' : selected}"`,
        action: () => {
          if (onRhymeSearch) onRhymeSearch(selected);
        },
      },
      {
        label: 'Save Selection to Rhyme Bank',
        action: () => {
          if (onSaveRhyme) onSaveRhyme(selected);
        },
      },
      {
        label: 'Add to Scheme Angle',
        action: async () => {
          const v = await schemeFormDialog({ draftBars: [selected], title: `Scheme: ${selected.slice(0, 24)}` }, { battleId, roundId });
          if (v) {
            const { createScheme } = await import('../core/store.js');
            await createScheme(v);
            toast('Scheme created from selection');
          }
        },
      },
      {
        label: 'Check for Similar Lines (Line Checker)',
        action: () => {
          lineCheckerDialog(selected, { battleId, roundId });
        },
      },
      {
        label: 'Search Phrase in Workspace',
        action: () => {
          location.hash = `#/search`;
        },
      },
    ];

    const highlightOpts = {
      onHighlight: (color) => {
        const ok = applyHighlight(color, area);
        if (ok) {
          refreshCounts();
          setState('saving', 'Unsaved changes');
          autosave();
          toast('Highlight applied');
        }
      },
      onRemoveHighlight: () => {
        const ok = removeHighlight(area);
        if (ok) {
          refreshCounts();
          setState('saving', 'Unsaved changes');
          autosave();
          toast('Highlight removed');
        }
      },
      onClearAllHighlights: () => {
        clearAllHighlights(area);
        refreshCounts();
        setState('saving', 'Unsaved changes');
        autosave();
        toast('All highlights cleared');
      },
    };

    openContextMenu(e, selected, actions, highlightOpts);
  });

  // Writer preferences (size), persisted in settings.
  // Width always remains at maximum (100%)
  const applyPrefs = (s) => {
    area.style.setProperty('--editor-width', '100%');
    area.style.setProperty('--editor-size', `${s}px`);
    area.style.maxWidth = '100%';
    area.style.width = '100%';
  };
  function setSize(value, persist = true) {
    const n = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(Number(value)) || 16));
    currentSize = n;
    sizeValue.textContent = String(n);
    sizeDownBtn.disabled = n <= SIZE_MIN;
    sizeUpBtn.disabled = n >= SIZE_MAX;
    applyPrefs(n);
    if (persist) setSetting('editorSize', n).catch(() => {});
  }

  const appEl = () => document.getElementById('app');
  function toggleFocus(force) {
    const on = force ?? !appEl().classList.contains('focus');
    appEl().classList.toggle('focus', on);
    exitFocus.remove();
    if (on) document.body.append(exitFocus);
    area.focus();
  }
  const onDocKey = (e) => {
    if (e.key === 'Escape' && appEl().classList.contains('focus')) toggleFocus(false);
    if (e.altKey && e.key.toLowerCase() === 'f' && showWriterTools) { e.preventDefault(); toggleFocus(); }
  };
  document.addEventListener('keydown', onDocKey);

  const onBeforeUnload = (e) => {
    if (getRawHtml() !== lastSaved) {
      persist();
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  const ready = (async () => {
    try {
      const [raw, s] = await Promise.all([load(), getSetting('editorSize', 16)]);
      setSize(s, false);
      const text = raw ?? '';
      // Support existing plain-text as well as new rich-text format
      if (text.includes('<mark') || text.includes('<br>') || text.includes('<div>')) {
        area.innerHTML = sanitizeRichContent(text);
      } else {
        area.innerHTML = plainTextToHtml(text);
      }
      lastSaved = getRawHtml();
      area.setAttribute('contenteditable', 'true');
      refreshCounts();
      setState('saved', 'Saved');

      // Check initial round completion status from database
      if (roundId) {
        try {
          const { getRound } = await import('../core/store.js');
          const rData = await getRound(roundId);
          if (rData) {
            isRoundCompleted = !!rData.completed;
            updateCompleteBtn();
          }
        } catch {}
      }
    } catch (e) {
      console.error(e);
      setState('failed', 'Could not load this text');
    }
  })();

  return {
    ready,
    focus: () => area.focus(),
    getText: () => getPlainText(),
    getHTML: () => getRawHtml(),
    insertText(str) {
      area.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(str);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        area.appendChild(document.createTextNode(str));
      }
      refreshCounts();
      setState('saving', 'Unsaved changes');
      autosave();
    },
    appendText(str) {
      const current = area.innerText || '';
      const sep = current && !current.endsWith('\n') ? '\n' : '';
      const node = document.createTextNode(sep + str);
      area.appendChild(node);
      refreshCounts();
      setState('saving', 'Unsaved changes');
      autosave();
      area.focus();
    },
    /** Flush unsaved text; resolves after persistence attempt. Safe to call repeatedly. */
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      closeContextMenu();
      highlightPicker.destroy();
      autosave.cancel();
      document.removeEventListener('keydown', onDocKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      appEl().classList.remove('focus');
      exitFocus.remove();
      await ready;
      await persist();
      if (getRawHtml() !== lastSaved) toast('Could not save your last changes. Copy your text before leaving.', 'error');
    },
  };
}
