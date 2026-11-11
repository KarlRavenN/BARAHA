import { h } from '../core/ui.js';
import * as store from '../core/store.js';

export async function searchView(root) {
  let query = '';
  const input = h('input', {
    type: 'search',
    class: 'quick-open-input',
    placeholder: 'Search workspace',
    'aria-label': 'Global search',
    oninput: (e) => {
      query = e.target.value;
      performSearch();
    },
  });

  const resultsContainer = h('div', { class: 'stack', style: 'margin-top: 16px;' });

  async function performSearch() {
    const q = query.trim();
    if (!q) {
      resultsContainer.replaceChildren(
        h('div', { class: 'empty-state-wrap empty' },
          h('div', { class: 'empty-state-icon' }, '🔍'),
          h('div', { class: 'empty-state-title' }, 'Quick Open & Search'),
          h('div', { class: 'empty-state-desc' }, 'Type keywords to locate punchlines, draft concepts, schemes, rival notes, or saved rhymes across all battles.')
        )
      );
      return;
    }

    resultsContainer.replaceChildren(h('div', { class: 'small muted' }, 'Scanning workspace records...'));
    const { results, total } = await store.globalSearch(q);

    if (total === 0) {
      resultsContainer.replaceChildren(
        h('div', { class: 'empty-state-wrap empty' },
          h('div', { class: 'empty-state-icon' }, '❌'),
          h('div', { class: 'empty-state-title' }, 'No Matches Found'),
          h('div', { class: 'empty-state-desc' }, `Zero records matching "${q}" in active battles, notes, or drafts.`)
        )
      );
      return;
    }

    // Group results by category for Quick Open experience (Drafts merged into Final Material)
    const groups = {
      Battles: [],
      'Final Material': [],
      Schemes: [],
      Rhymes: [],
      Opponents: [],
      'Voice Takes': [],
      Other: [],
    };

    for (const r of results) {
      const t = (r.type || '').toLowerCase();
      if (t.includes('battle')) groups.Battles.push(r);
      // Draft Idea results now point to the battle's Draft round — group them under Final Material
      else if (t.includes('draft') || t.includes('final material')) groups['Final Material'].push(r);
      else if (t.includes('scheme')) groups.Schemes.push(r);
      else if (t.includes('rhyme')) groups.Rhymes.push(r);
      else if (t.includes('opponent')) groups.Opponents.push(r);
      else if (t.includes('voice')) groups['Voice Takes'].push(r);
      else groups.Other.push(r);
    }

    const renderItem = (r) => h('a', { class: 'item search-result-item', href: r.href, style: 'border-radius: 4px; margin-bottom: 2px;' },
      h('div', { class: 'grow' },
        h('div', { class: 'row', style: 'align-items:center; gap: 8px;' },
          h('span', { class: 'tag red', style: 'font-size: 10px; padding: 1px 6px;' }, r.type),
          h('b', { class: 'title' }, r.title)),
        h('div', { class: 'small muted', style: 'margin-top: 4px; font-family: var(--font-write); font-size: 12.5px;' }, r.subtitle)),
      h('span', { class: 'small', style: 'font-weight: 600; color: var(--red-text);' }, 'Open →')
    );

    const groupSections = [];
    for (const [groupName, items] of Object.entries(groups)) {
      if (items.length > 0) {
        groupSections.push(
          h('div', { class: 'search-group' },
            h('div', { class: 'search-group-header' }, `${groupName} (${items.length})`),
            h('div', { class: 'list', style: 'border-top: none;' }, items.map(renderItem))
          )
        );
      }
    }

    resultsContainer.replaceChildren(
      h('div', { class: 'row', style: 'justify-content: space-between; align-items:center;' },
        h('span', { class: 'small faint' }, `Found ${total} item(s) across categories:`),
        h('span', { class: 'small faint' }, 'Press Esc to clear')
      ),
      ...groupSections
    );
  }

  root.replaceChildren(
    h('div', { class: 'page stack quick-open-container' },
      h('div', { class: 'page-head', style: 'justify-content: center; text-align: center; border-bottom: none; padding-bottom: 0;' },
        h('div', {},
          h('h1', { style: 'font-size: 32px;' }, 'Global Search'),
          h('p', { class: 'muted small' }, 'Fast Quick Open across all battles, rhymes, drafts, schemes, and dossiers.')
        )
      ),
      input,
      resultsContainer)
  );

  input.focus();
}
