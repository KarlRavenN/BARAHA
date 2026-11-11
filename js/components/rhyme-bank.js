import { h, toast, confirmDialog, formDialog } from '../core/ui.js';
import * as store from '../core/store.js';
import { openGenericContextMenu } from './context-menu.js';
import { getRhymeEndingTag } from '../core/rhymes-engine.js';

export function mountRhymeBank(container, { battleId = null, roundId = null, onInsertWord = null } = {}) {
  let activeTab = 'engine'; // 'engine' | 'saved'
  let savedScope = battleId ? 'all' : 'general'; // 'all' | 'battle' | 'general'
  let currentSearch = '';
  const searchMode = 'lastWord'; // Last word matching only
  let engineResults = null;
  let savedRhymes = [];

  const tabEngineBtn = h('button', { class: 'ghost small-btn active' }, 'Local Rhymes');
  const tabSavedBtn = h('button', { class: 'ghost small-btn' }, 'Saved Rhymes');

  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Find rhyme…',
    'aria-label': 'Find rhyme',
    class: 'rhyme-search-field',
  });

  const contentArea = h('div', { class: 'supporting-rhymes-view' });

  async function loadSaved() {
    savedRhymes = await store.listSavedRhymes({ battleId, scope: savedScope, search: currentSearch });
  }

  async function triggerSearch(word) {
    if (!word) {
      engineResults = null;
    } else {
      engineResults = await store.searchRhymeEngineWithBattleCorpus(word, battleId, searchMode);
    }
    renderEngine();
  }

  function notifySync() {
    window.dispatchEvent(new CustomEvent('baraha:rhymes-sync'));
  }

  function handleSyncEvent() {
    if (activeTab === 'saved') {
      loadSaved().then(renderSaved);
    }
  }
  window.addEventListener('baraha:rhymes-sync', handleSyncEvent);

  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value.trim();
    if (activeTab === 'engine') {
      triggerSearch(currentSearch);
    } else {
      loadSaved().then(renderSaved);
    }
  });

  function wordPillWithSave(word, customTooltip = null) {
    const pill = h('button', {
      class: 'rhyme-pill',
      title: customTooltip || `Click to insert "${word}" into round`,
      onclick: () => {
        if (onInsertWord) onInsertWord(word);
        else navigator.clipboard?.writeText(word);
        toast(`Used "${word}"`);
      },
    }, word);

    const isAlreadySaved = savedRhymes.some((r) => r.text.toLowerCase() === word.toLowerCase());

    const saveBtn = h('button', {
      class: `rhyme-save-icon-btn ${isAlreadySaved ? 'is-saved' : ''}`,
      title: isAlreadySaved ? `"${word}" is saved in your Rhyme Bank` : `Save "${word}" to Rhyme Bank`,
      'aria-label': `Save ${word}`,
      onclick: async (e) => {
        e.stopPropagation();
        if (isAlreadySaved) {
          toast(`"${word}" is already in your bank.`);
          return;
        }
        await openAddRhymeDialog(word);
      },
    }, isAlreadySaved ? '★' : '☆');

    return h('div', { class: 'rhyme-pill-wrap' }, pill, saveBtn);
  }

  function renderEngine() {
    if (!currentSearch) {
      contentArea.replaceChildren(
        h('div', { class: 'rhyme-empty-tip empty-state-wrap' },
          h('div', { class: 'empty-state-icon' }, '🎙'),
          h('div', { class: 'empty-state-title' }, 'Rhyme Engine Ready'),
          h('div', { class: 'empty-state-desc faint' }, 'Type a word or ending cadence above to inspect phonetic codas, multi-syllable cadences, and battle slant rhymes.')
        )
      );
      return;
    }

    const exact = engineResults?.exact || [];
    const multi = engineResults?.multi || [];
    const slant = engineResults?.slant || [];
    const assoc = engineResults?.associations || [];

    if (!exact.length && !multi.length && !slant.length && !assoc.length) {
      contentArea.replaceChildren(
        h('div', { class: 'rhyme-empty-tip empty-state-wrap' },
          h('div', { class: 'empty-state-icon' }, '🔍'),
          h('div', { class: 'empty-state-title' }, 'No matches found'),
          h('div', { class: 'empty-state-desc faint' }, `No direct matches for "${currentSearch}". Try a Tagalog root or phonetic variation.`)
        )
      );
      return;
    }

    const sections = [];

    if (exact.length) {
      sections.push(h('div', { class: 'rhyme-group' },
        h('div', { class: 'rhyme-group-title' }, `Exact Rhymes (${exact.length})`, h('span', { class: 'rhyme-group-desc faint' }, 'Phonetic coda match')),
        h('div', { class: 'rhyme-pill-cloud' }, exact.map((w) => wordPillWithSave(w)))));
    }

    if (multi.length) {
      sections.push(h('div', { class: 'rhyme-group' },
        h('div', { class: 'rhyme-group-title' }, `Multi-Syllable Rhymes (${multi.length})`, h('span', { class: 'rhyme-group-desc faint' }, '2–3 syllable cadence match')),
        h('div', { class: 'rhyme-pill-cloud' }, multi.map((w) => wordPillWithSave(w)))));
    }

    if (slant.length) {
      sections.push(h('div', { class: 'rhyme-group' },
        h('div', { class: 'rhyme-group-title' }, `Slant / Assonance (${slant.length})`, h('span', { class: 'rhyme-group-desc faint' }, 'Vowel harmony & consonant slant')),
        h('div', { class: 'rhyme-pill-cloud' }, slant.map((w) => wordPillWithSave(w)))));
    }

    if (assoc.length) {
      sections.push(h('div', { class: 'rhyme-group' },
        h('div', { class: 'rhyme-group-title' }, `Word Associations (${assoc.length})`, h('span', { class: 'rhyme-group-desc faint' }, 'Battle concepts — not phonetic rhymes')),
        h('div', { class: 'rhyme-pill-cloud' }, assoc.map((w) => wordPillWithSave(w, 'Battle concept association')))));
    }

    contentArea.replaceChildren(...sections);
  }

  async function openAddRhymeDialog(defaultText = '') {
    const textInput = h('input', { type: 'text', value: defaultText, placeholder: 'Enter rhyme word or phrase', 'aria-label': 'Rhyme text' });
    const colInput = h('input', { type: 'text', placeholder: 'Enter collection name', 'aria-label': 'Rhyme collection' });

    const scopeSelect = battleId ? h('select', { 'aria-label': 'Storage Scope' },
      h('option', { value: 'battle' }, 'This Battle Only (Specific)'),
      h('option', { value: 'general' }, 'General Library (All Battles)')
    ) : null;

    if (scopeSelect && savedScope === 'general') {
      scopeSelect.value = 'general';
    }

    const formFields = [
      h('label', {}, 'Rhyme Word / Phrase', textInput),
    ];
    if (scopeSelect) {
      formFields.push(h('label', {}, 'Save Destination', scopeSelect));
    }
    formFields.push(h('label', {}, 'Collection / Scheme', colInput));

    const ok = await formDialog({
      title: 'Save to Rhyme Bank',
      confirmLabel: 'Save Rhyme',
      body: h('div', { class: 'stack form' }, ...formFields),
    });

    if (!ok) return;

    const trimmed = textInput.value.trim();
    if (!trimmed) return;

    const isGen = scopeSelect ? scopeSelect.value === 'general' : !battleId;
    const targetBattle = isGen ? null : battleId;

    const exists = savedRhymes.some((r) =>
      r.text.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      toast(`"${trimmed}" is already saved in your bank.`);
      return;
    }

    await store.createSavedRhyme({
      text: trimmed,
      collection: colInput.value.trim() || 'General',
      kind: 'word',
      notes: '',
      battleId: targetBattle,
      isGeneral: isGen,
    });
    toast(isGen ? 'Rhyme saved to General Library' : 'Rhyme saved to This Battle');
    notifySync();
    await loadSaved();
    if (activeTab === 'saved') renderSaved();
  }

  // Grouped Collections Saved Rhymes Render (Responsive Cards Grid)
  function renderSaved() {
    const filterAllBtn = h('button', {
      class: `ghost small-btn scope-filter-btn ${savedScope === 'all' ? 'active' : ''}`,
      onclick: () => { savedScope = 'all'; loadSaved().then(renderSaved); },
    }, 'All');

    const filterBattleBtn = battleId ? h('button', {
      class: `ghost small-btn scope-filter-btn ${savedScope === 'battle' ? 'active' : ''}`,
      onclick: () => { savedScope = 'battle'; loadSaved().then(renderSaved); },
    }, 'This Battle') : null;

    const filterGeneralBtn = h('button', {
      class: `ghost small-btn scope-filter-btn ${savedScope === 'general' ? 'active' : ''}`,
      onclick: () => { savedScope = 'general'; loadSaved().then(renderSaved); },
    }, 'General Library');

    const scopeFilterBar = h('div', { class: 'row', style: 'gap: 4px; align-items: center; flex-wrap: wrap;' },
      h('span', { class: 'small faint' }, 'View:'),
      filterAllBtn,
      ...(filterBattleBtn ? [filterBattleBtn] : []),
      filterGeneralBtn
    );

    const headerRow = h('div', { class: 'row', style: 'justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 6px;' },
      scopeFilterBar,
      h('div', { class: 'row', style: 'gap: 6px; align-items: center;' },
        h('span', { class: 'small muted' }, `${savedRhymes.length} rhyme${savedRhymes.length === 1 ? '' : 's'}`),
        h('button', { class: 'primary small-btn', onclick: () => openAddRhymeDialog(currentSearch) }, '+ Add Rhyme')
      )
    );

    if (!savedRhymes.length) {
      contentArea.replaceChildren(
        headerRow,
        h('div', { class: 'rhyme-empty-tip empty-state-wrap' },
          h('div', { class: 'empty-state-icon' }, '📝'),
          h('div', { class: 'empty-state-title' }, 'No Saved Rhymes'),
          h('div', { class: 'empty-state-desc faint' }, currentSearch ? 'No saved rhymes match this search.' : `No rhymes saved in ${savedScope === 'battle' ? 'this battle' : savedScope === 'general' ? 'general library' : 'bank'} yet.`)
        )
      );
      return;
    }

    // Group rhymes by collection name (case-insensitive key)
    const groupsMap = new Map();
    for (const r of savedRhymes) {
      const rawName = (r.collection || 'General').trim();
      const key = rawName.toLowerCase();
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { name: rawName, items: [] });
      }
      groupsMap.get(key).items.push(r);
    }

    // Render cards in responsive masonry columns
    const collectionCards = Array.from(groupsMap.values()).map((grp) => {
      const countLabel = h('span', { class: 'rhyme-col-count small faint' }, `${grp.items.length}`);

      // Count battle-specific vs general in this collection
      const battleCount = grp.items.filter((i) => i.battleId).length;
      let scopeInfo = null;
      if (battleCount > 0 && battleCount === grp.items.length) {
        scopeInfo = h('span', { class: 'rhyme-card-scope-tag battle' }, 'Battle');
      } else if (battleCount > 0) {
        scopeInfo = h('span', { class: 'rhyme-card-scope-tag mixed' }, `${battleCount} Battle`);
      }

      const colHeader = h('div', { class: 'rhyme-col-header' },
        h('div', { class: 'row', style: 'align-items: center; gap: 6px; min-width: 0;' },
          h('b', { class: 'rhyme-col-title' }, grp.name),
          scopeInfo
        ),
        countLabel
      );

      const rhymeRows = grp.items.map((r) => {
        const isBattleOnly = !!r.battleId;
        const endingTag = getRhymeEndingTag(r.text);

        // Edit row state element
        const rowEl = h('div', { class: 'saved-rhyme-row-v2' });

        function renderRowNormal() {
          const battleDot = isBattleOnly ? h('span', {
            class: 'rhyme-battle-dot',
            title: 'Tied to this battle',
          }) : null;

          const textBtn = h('button', {
            class: 'rhyme-row-text-btn',
            title: `Click to insert "${r.text}" into editor`,
            onclick: () => {
              if (onInsertWord) onInsertWord(r.text);
              else navigator.clipboard?.writeText(r.text);
              toast(`Used "${r.text}"`);
            },
          }, r.text);

          const endingEl = endingTag ? h('span', {
            class: 'rhyme-ending-tag faint',
            title: `Rhyme ending sound: ${endingTag}`,
          }, endingTag) : null;

          const menuBtn = h('button', {
            class: 'rhyme-row-menu-btn',
            title: 'Rhyme actions',
            'aria-label': `Actions for ${r.text}`,
            onclick: (e) => {
              e.stopPropagation();
              const actions = [
                {
                  label: 'Edit',
                  action: () => startEdit(),
                },
                isBattleOnly ? {
                  label: 'Move to General Library',
                  action: async () => {
                    await store.updateSavedRhyme(r.id, { battleId: null, isGeneral: true });
                    toast(`Moved "${r.text}" to General Library`);
                    notifySync();
                    await loadSaved();
                    renderSaved();
                  },
                } : (battleId ? {
                  label: 'Set to this battle',
                  action: async () => {
                    await store.updateSavedRhyme(r.id, { battleId, isGeneral: false });
                    toast(`Set "${r.text}" to this battle`);
                    notifySync();
                    await loadSaved();
                    renderSaved();
                  },
                } : null),
                {
                  label: 'Delete',
                  danger: true,
                  action: async () => {
                    await store.deleteSavedRhyme(r.id);
                    toast('Rhyme removed');
                    notifySync();
                    await loadSaved();
                    renderSaved();
                  },
                },
              ].filter(Boolean);

              openGenericContextMenu(e, actions, r.text);
            },
          }, '⋯');

          rowEl.replaceChildren(
            h('div', { class: 'rhyme-row-main' },
              battleDot,
              textBtn
            ),
            h('div', { class: 'rhyme-row-meta' },
              endingEl,
              menuBtn
            )
          );
        }

        function startEdit() {
          const editInput = h('input', {
            type: 'text',
            class: 'rhyme-row-edit-input',
            value: r.text,
            'aria-label': 'Edit rhyme text',
          });

          async function saveEdit() {
            const nextText = editInput.value.trim();
            if (!nextText || nextText === r.text) {
              renderRowNormal();
              return;
            }
            await store.updateSavedRhyme(r.id, { text: nextText });
            r.text = nextText;
            toast('Rhyme updated');
            notifySync();
            await loadSaved();
            renderSaved();
          }

          function cancelEdit() {
            renderRowNormal();
          }

          editInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              saveEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
          });

          editInput.addEventListener('blur', () => {
            // Auto cancel on blur
            setTimeout(() => {
              if (rowEl.contains(editInput)) cancelEdit();
            }, 100);
          });

          rowEl.replaceChildren(
            h('div', { class: 'rhyme-row-edit-wrap' },
              editInput,
              h('span', { class: 'small faint' }, '↵ Save · Esc Cancel')
            )
          );
          editInput.focus();
          editInput.select();
        }

        renderRowNormal();
        return rowEl;
      });

      const itemsContainer = h('div', { class: 'rhyme-col-items' }, ...rhymeRows);
      return h('div', { class: 'rhyme-collection-card' }, colHeader, itemsContainer);
    });

    contentArea.replaceChildren(
      headerRow,
      h('div', { class: 'saved-rhymes-grid' }, ...collectionCards)
    );
  }

  function setTab(tab) {
    activeTab = tab;
    tabEngineBtn.classList.toggle('active', tab === 'engine');
    tabSavedBtn.classList.toggle('active', tab === 'saved');

    searchInput.value = '';
    currentSearch = '';

    if (tab === 'engine') {
      renderEngine();
    } else {
      loadSaved().then(renderSaved);
    }
  }

  tabEngineBtn.onclick = () => setTab('engine');
  tabSavedBtn.onclick = () => setTab('saved');

  const topBar = h('div', { class: 'rhyme-bank-bar supporting-rhyme-topbar' },
    h('div', { class: 'row', style: 'align-items: center; gap: 6px;' },
      tabEngineBtn,
      tabSavedBtn),
    h('div', { class: 'search-wrap', style: 'flex: 1; min-width: 140px;' },
      searchInput
    )
  );

  const wrapper = h('div', { class: 'rhyme-bank-panel supporting-rhyme-panel' },
    topBar,
    contentArea
  );

  container.replaceChildren(wrapper);
  setTab('engine');

  return {
    search(word) {
      searchInput.value = word;
      currentSearch = word;
      setTab('engine');
      triggerSearch(word);
    },
    focusInput() {
      searchInput.focus();
    },
    openSaveDialog(text) {
      openAddRhymeDialog(text);
    },
    destroy() {
      window.removeEventListener('baraha:rhymes-sync', handleSyncEvent);
    },
  };
}
