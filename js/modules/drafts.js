import { h, toast, confirmDialog, formDialog } from '../core/ui.js';
import { debounce } from '../core/util.js';
import * as store from '../core/store.js';
import { openContextMenu } from '../components/context-menu.js';
import { lineCheckerDialog } from './line-checker.js';
import {
  sanitizeRichContent,
  htmlToPlainText,
  plainTextToHtml,
  applyHighlight,
  removeHighlight,
  clearAllHighlights,
  attachHighlightBoundaryHandler,
} from '../components/rich-editor.js';

export async function draftFormDialog(initial = {}, { battleId = null, roundId = null } = {}) {
  const isEdit = !!initial.id;
  const titleInput = h('input', { type: 'text', value: initial.title || '', placeholder: 'Enter draft title', 'aria-label': 'Draft title' });
  const contentInput = h('textarea', { rows: 5, placeholder: 'Enter bars or content', 'aria-label': 'Draft content' }, initial.content || '');
  const categorySelect = h('select', { 'aria-label': 'Draft category' },
    store.DRAFT_CATEGORIES.map((c) => h('option', { value: c, selected: (initial.category || 'Punchline') === c }, c)));
  const statusSelect = h('select', { 'aria-label': 'Draft status' },
    store.DRAFT_STATUSES.map((s) => h('option', { value: s, selected: (store.normalizeDraftStatus(initial.status)) === s }, s)));
  const tagsInput = h('input', { type: 'text', value: (initial.tags || []).join(', '), placeholder: 'Enter tags', 'aria-label': 'Draft tags' });
  const notesInput = h('input', { type: 'text', value: initial.notes || '', placeholder: 'Enter delivery notes', 'aria-label': 'Draft notes' });

  const body = h('div', { class: 'stack form' },
    h('label', {}, 'Title / Hook', titleInput),
    h('label', {}, 'Bars / Content', contentInput),
    h('div', { class: 'grid2' },
      h('label', {}, 'Category', categorySelect),
      h('label', {}, 'Status', statusSelect)),
    h('label', {}, 'Tags (comma-separated)', tagsInput),
    h('label', {}, 'Delivery Notes / Cadence', notesInput));

  const ok = await formDialog({
    title: isEdit ? 'Edit Draft Idea' : 'New Draft Idea',
    confirmLabel: isEdit ? 'Save Draft' : 'Create Draft',
    body,
  });
  if (!ok) return null;

  return {
    title: titleInput.value.trim(),
    content: contentInput.value,
    category: categorySelect.value,
    status: statusSelect.value,
    tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
    notes: notesInput.value.trim(),
    battleId: initial.battleId || battleId,
    roundId: initial.roundId || roundId,
  };
}

function getFirstLinePreview(content) {
  if (!content || !content.trim()) return 'No content yet';
  const plain = htmlToPlainText(content);
  const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[0] : 'No content yet';
}

export async function draftsView(container, { battleId, roundId, roundNumber, editor = null }) {
  let drafts = await store.listDrafts({ roundId });
  let currentMode = 'list'; // 'list' | 'editor'
  let activeDraft = null; // null for creating new draft, or draft object for editing
  let isSaving = false;

  const filter = {
    category: 'all',
    status: 'all',
    search: '',
  };

  async function reloadList() {
    const raw = await store.listDrafts({ roundId });
    // Guaranteed deduplication by ID
    drafts = Array.from(new Map(raw.map((d) => [d.id, d])).values());
    render();
  }

  function openEditor(draft = null) {
    activeDraft = draft;
    currentMode = 'editor';
    render();
  }

  function backToList() {
    currentMode = 'list';
    activeDraft = null;
    reloadList();
  }

  function appendDraftToFinal(content) {
    if (!content || !content.trim()) {
      toast('Draft has no content to append.', 'error');
      return;
    }
    if (editor && typeof editor.appendText === 'function') {
      editor.appendText('\n' + content + '\n');
      toast('Appended to Final Material');
      return;
    }
    toast('Final editor is not accessible', 'error');
  }

  function insertDraftAtCursor(content) {
    if (!content || !content.trim()) {
      toast('Draft has no content to insert.', 'error');
      return;
    }
    if (editor && typeof editor.insertText === 'function') {
      editor.insertText(content + '\n');
      toast('Inserted at cursor');
    } else {
      appendDraftToFinal(content);
    }
  }

  async function openLinkSchemeDialog(draft) {
    const schemes = await store.listSchemes({ roundId });
    if (!schemes.length) {
      toast('No schemes created in this round yet. Build a scheme first.', 'error');
      return;
    }
    const schemeSelect = h('select', {},
      schemes.map((s) => h('option', { value: s.id }, s.title)));
    const ok = await formDialog({
      title: 'Link Draft to Scheme',
      confirmLabel: 'Link Draft',
      body: h('div', { class: 'stack form' },
        h('p', { class: 'small muted' }, `Link "${draft.title}" to an angle/scheme:`),
        h('label', {}, 'Choose Scheme', schemeSelect)),
    });
    if (ok) {
      await store.linkDraftToScheme(schemeSelect.value, draft.id);
      toast('Draft linked to scheme');
    }
  }

  // --- RENDER CARD (LIST VIEW) ---
  function renderDraftCard(d) {
    const statusVal = store.normalizeDraftStatus(d.status);

    const statusDropdown = h('select', {
      class: `draft-status-select ${statusVal === 'Done' ? 'status-done' : 'status-in-progress'}`,
      'aria-label': 'Draft status',
      onclick: (e) => e.stopPropagation(),
      onchange: async (e) => {
        e.stopPropagation();
        const nextStatus = e.target.value;
        d.status = nextStatus;
        statusDropdown.className = `draft-status-select ${nextStatus === 'Done' ? 'status-done' : 'status-in-progress'}`;
        await store.updateDraft(d.id, { status: nextStatus });
        toast(`Draft marked ${nextStatus}`);
      },
    },
      h('option', { value: 'In Progress', selected: statusVal === 'In Progress' }, 'In Progress'),
      h('option', { value: 'Done', selected: statusVal === 'Done' }, 'Done'));

    const preview = getFirstLinePreview(d.content);

    return h('div', {
      class: 'draft-card clickable',
      onclick: () => openEditor(d),
    },
      h('div', { class: 'draft-card-head' },
        h('div', { class: 'draft-card-title' }, d.title || 'Untitled Draft'),
        statusDropdown),
      h('div', { class: 'draft-card-preview' }, preview));
  }

  // --- RENDER INLINE DRAFT EDITOR ---
  function renderDraftEditor() {
    const isNewRecord = () => !activeDraft || !activeDraft.id;
    const initialTitle = activeDraft ? (activeDraft.title || '') : '';
    const initialContent = activeDraft ? (activeDraft.content || '') : '';
    const initialCategory = activeDraft ? (activeDraft.category || 'Punchline') : 'Punchline';
    const initialStatus = activeDraft ? store.normalizeDraftStatus(activeDraft.status) : 'In Progress';
    const initialTags = activeDraft ? (activeDraft.tags || []).join(', ') : '';
    const initialNotes = activeDraft ? (activeDraft.notes || '') : '';

    let inFlightSave = null;

    const backBtn = h('button', {
      class: 'ghost small-btn inline-back-btn',
      title: 'Back to Drafts list',
      onclick: async () => {
        debouncedAutosave.cancel?.();
        await saveCurrentChanges();
        backToList();
      },
    }, '← Drafts');

    const saveBadge = h('span', { class: 'save-state faint small' }, 'Saved');

    const headEl = h('div', { class: 'inline-editor-head' },
      h('div', { class: 'row', style: 'align-items: center; gap: 8px;' },
        backBtn,
        h('h3', { class: 'inline-editor-title' }, isNewRecord() ? 'New Draft' : (activeDraft.title || 'Edit Draft'))),
      saveBadge);

    const categorySelect = h('select', { class: 'inline-meta-select', 'aria-label': 'Draft category' },
      store.DRAFT_CATEGORIES.map((c) => h('option', { value: c, selected: initialCategory === c }, c)));

    const statusSelect = h('select', { class: 'inline-meta-select', 'aria-label': 'Draft status' },
      h('option', { value: 'In Progress', selected: initialStatus === 'In Progress' }, 'In Progress'),
      h('option', { value: 'Done', selected: initialStatus === 'Done' }, 'Done'));

    const metaBar = h('div', { class: 'inline-meta-bar' },
      h('div', { class: 'inline-meta-field' },
        h('span', { class: 'inline-meta-label' }, 'Category'),
        categorySelect),
      h('div', { class: 'inline-meta-field' },
        h('span', { class: 'inline-meta-label' }, 'Status'),
        statusSelect));

    const titleInput = h('input', {
      type: 'text',
      class: 'inline-title-input',
      value: initialTitle,
      placeholder: 'Draft title / hook...',
      'aria-label': 'Draft title',
    });

    const contentTextarea = h('div', {
      class: 'inline-content-textarea rich-field',
      contenteditable: 'true',
      'aria-label': 'Draft content',
      'data-placeholder': 'Draft your bar(s) here…\n\nPreserve rhymes, Taglish, cadence, and line breaks.',
      spellcheck: 'false',
      tabindex: '0',
    });

    Object.defineProperty(contentTextarea, 'value', {
      get() { return sanitizeRichContent(contentTextarea.innerHTML); },
      set(val) {
        if ((val || '').includes('<mark') || (val || '').includes('<br>')) {
          contentTextarea.innerHTML = sanitizeRichContent(val || '');
        } else {
          contentTextarea.innerHTML = plainTextToHtml(val || '');
        }
      },
      configurable: true,
    });
    contentTextarea.value = initialContent;

    contentTextarea.addEventListener('paste', (e) => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (txt) document.execCommand('insertText', false, txt);
      debouncedAutosave();
    });

    // Attach boundary handler so pressing Space after a highlight types cleanly outside the mark
    attachHighlightBoundaryHandler(contentTextarea, () => {
      debouncedAutosave();
    });

    contentTextarea.addEventListener('contextmenu', (e) => {
      const sel = window.getSelection();
      const selected = sel ? sel.toString().trim() : '';
      if (!selected) return;
      e.preventDefault();

      const highlightOpts = {
        onHighlight: (color) => {
          const ok = applyHighlight(color, contentTextarea);
          if (ok) {
            saveCurrentChanges();
            toast('Highlight applied');
          }
        },
        onRemoveHighlight: () => {
          const ok = removeHighlight(contentTextarea);
          if (ok) {
            saveCurrentChanges();
            toast('Highlight removed');
          }
        },
        onClearAllHighlights: () => {
          clearAllHighlights(contentTextarea);
          saveCurrentChanges();
          toast('Highlights cleared');
        },
      };

      const actions = [
        {
          label: `📌 Pin Bar "${selected.length > 20 ? selected.slice(0, 20) + '…' : selected}"`,
          action: async () => {
            await store.createPinnedBar({ text: selected, battleId, roundId, source: 'Draft' });
            window.dispatchEvent(new CustomEvent('baraha:pinned-updated'));
            toast('Bar pinned');
          },
        },
        {
          label: `Find Rhymes for "${selected.length > 18 ? selected.slice(0, 18) + '…' : selected}"`,
          action: () => {
            if (editor && typeof editor.onRhymeSearch === 'function') {
              editor.onRhymeSearch(selected);
            } else {
              toast(`Selected "${selected}"`);
            }
          },
        },
        {
          label: 'Save Selection to Rhyme Bank',
          action: async () => {
            await store.createSavedRhyme({ text: selected, battleId, roundId, collection: 'Drafts' });
            toast(`Saved "${selected}" to Rhyme Bank`);
          },
        },
        {
          label: 'Check for Similar Lines (Line Checker)',
          action: () => {
            lineCheckerDialog(selected, { battleId, roundId });
          },
        },
      ];

      openContextMenu(e, selected, actions, highlightOpts);
    });

    const tagsInput = h('input', {
      type: 'text',
      value: initialTags,
      placeholder: 'multi, rebuttal, casino, angle',
      'aria-label': 'Draft tags',
    });

    const notesInput = h('textarea', {
      rows: 2,
      placeholder: 'Delivery cues, flow cadence, posture reminders...',
      'aria-label': 'Draft notes',
    }, initialNotes);

    const secondaryDetails = h('details', { class: 'inline-secondary-details' },
      h('summary', { class: 'inline-secondary-summary' }, 'Delivery notes & tags'),
      h('div', { class: 'stack form', style: 'margin-top: 8px;' },
        h('label', {}, 'Tags (comma-separated)', tagsInput),
        h('label', {}, 'Delivery Notes / Cadence', notesInput)));

    async function saveCurrentChanges() {
      // If a save is already in-flight, return the existing promise so we never duplicate
      if (inFlightSave) return inFlightSave;

      const title = titleInput.value.trim() || 'Untitled Draft';
      const content = contentTextarea.value;
      const category = categorySelect.value;
      const status = statusSelect.value;
      const tags = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);
      const notes = notesInput.value.trim();

      // Only save if there's actual content or non-default title
      if (isNewRecord() && !titleInput.value.trim() && !htmlToPlainText(content).trim()) return null;

      saveBadge.className = 'save-state saving small';
      saveBadge.textContent = 'Saving…';

      inFlightSave = (async () => {
        try {
          if (isNewRecord()) {
            const created = await store.createDraft({
              title, content, category, status, tags, notes, battleId, roundId,
            });
            activeDraft = created;
            saveBadge.className = 'save-state saved small';
            saveBadge.textContent = 'Saved';
            return created;
          } else {
            const updated = await store.updateDraft(activeDraft.id, {
              title, content, category, status, tags, notes,
            });
            activeDraft = updated;
            saveBadge.className = 'save-state saved small';
            saveBadge.textContent = 'Saved';
            return updated;
          }
        } catch (err) {
          console.error(err);
          saveBadge.className = 'save-state failed small';
          saveBadge.textContent = 'Save failed';
          return null;
        } finally {
          inFlightSave = null;
        }
      })();

      return inFlightSave;
    }

    const debouncedAutosave = debounce(saveCurrentChanges, 600);

    // Auto-save on input / change / blur
    [titleInput, contentTextarea, tagsInput, notesInput].forEach((el) => {
      el.addEventListener('input', () => {
        saveBadge.className = 'save-state saving small';
        saveBadge.textContent = 'Saving…';
        debouncedAutosave();
      });
      el.addEventListener('blur', () => { saveCurrentChanges(); });
    });
    [categorySelect, statusSelect].forEach((el) => {
      el.addEventListener('change', () => { saveCurrentChanges(); });
    });

    const deleteBtn = !isNewRecord() ? h('button', {
      class: 'ghost danger small-btn',
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Delete Draft?',
          message: `Delete "${activeDraft.title}"? This cannot be undone.`,
          danger: true,
          confirmLabel: 'Delete',
        });
        if (ok) {
          debouncedAutosave.cancel?.();
          await store.deleteDraft(activeDraft.id);
          toast('Draft deleted');
          backToList();
        }
      },
    }, 'Delete') : null;

    const footActions = h('div', { class: 'inline-editor-foot' },
      saveBadge,
      deleteBtn);

    return h('div', { class: 'inline-editor stack' },
      headEl,
      metaBar,
      titleInput,
      contentTextarea,
      secondaryDetails,
      footActions);
  }

  // --- RENDER MAIN VIEW ---
  function render() {
    if (currentMode === 'editor') {
      container.replaceChildren(renderDraftEditor());
      return;
    }

    const q = filter.search.toLowerCase();
    const rows = drafts.filter((d) => {
      const matchCat = filter.category === 'all' || d.category === filter.category;
      const dStatus = store.normalizeDraftStatus(d.status);
      const matchStat = filter.status === 'all' || dStatus === filter.status;
      const matchQ = !q || (d.title || '').toLowerCase().includes(q)
        || (d.content || '').toLowerCase().includes(q)
        || (d.notes || '').toLowerCase().includes(q)
        || (d.tags || []).some((t) => t.toLowerCase().includes(q));
      return matchCat && matchStat && matchQ;
    });

    const searchInput = h('input', {
      type: 'search',
      placeholder: 'Search drafts...',
      class: 'inline-search-input',
      'aria-label': 'Search drafts',
      value: filter.search,
      oninput: (e) => { filter.search = e.target.value; render(); },
    });

    const catSelect = h('select', {
      class: 'small-select',
      'aria-label': 'Filter by category',
      onchange: (e) => { filter.category = e.target.value; render(); },
    },
      h('option', { value: 'all' }, 'All Categories'),
      store.DRAFT_CATEGORIES.map((c) => h('option', { value: c, selected: filter.category === c }, c)));

    const statusFilterSelect = h('select', {
      class: 'small-select',
      'aria-label': 'Filter by status',
      onchange: (e) => { filter.status = e.target.value; render(); },
    },
      h('option', { value: 'all' }, 'All Statuses'),
      h('option', { value: 'In Progress', selected: filter.status === 'In Progress' }, 'In Progress'),
      h('option', { value: 'Done', selected: filter.status === 'Done' }, 'Done'));

    const newDraftBtn = h('button', {
      class: 'primary small-btn',
      onclick: () => openEditor(null),
    }, '+ New Draft');

    const headBar = h('div', { class: 'page-head', style: 'margin-bottom: 8px;' },
      h('h3', { style: 'margin: 0; font-size: 15px;' }, 'Draft Ideas'),
      newDraftBtn);

    const filterRow = h('div', { class: 'row wrap', style: 'gap: 6px; margin-bottom: 8px;' },
      catSelect,
      statusFilterSelect);

    const cardsContainer = h('div', { class: 'draft-cards-list' },
      rows.length ? rows.map(renderDraftCard)
        : h('div', { class: 'empty' }, drafts.length ? 'No drafts match filters.' : 'No drafts yet. Click "+ New Draft" to write a bar.'));

    container.replaceChildren(
      h('div', { class: 'drafts-module stack' },
        headBar,
        filterRow,
        searchInput,
        cardsContainer)
    );
  }

  render();
  return {
    destroy: () => {
      // Clean up if destroyed
    },
  };
}
