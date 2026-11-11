import { h, toast } from '../core/ui.js';
import * as store from '../core/store.js';

export function mountPinnedBars(container, { onInsertBar = null } = {}) {
  let isPanelCollapsed = localStorage.getItem('baraha_pinned_collapsed') === 'true';
  let searchQuery = '';
  let items = [];

  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Filter pinned bars…',
    'aria-label': 'Search pinned bars',
    style: 'font-size: 11.5px; padding: 2px 6px; max-width: 140px; height: 24px;',
  });

  const arrow = h('span', { class: 'small faint' }, isPanelCollapsed ? '▸' : '▾');
  const countBadge = h('span', { class: 'small faint', style: 'margin-left: 4px;' }, '(0)');

  function pinIcon() {
    const s = document.createElement('span');
    s.className = 'pinned-thumbtack-icon';
    s.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color: var(--red-spray, #8E2A22); vertical-align: -2px; margin-right: 4px;"><path d="M9 2l5 5-2.5 1-1-1-3.5 3.5v2.5l-1.5-1.5v-2.5l3.5-3.5-1-1 1-2.5z"/><path d="M3.5 12.5l2-2"/><circle cx="11.5" cy="4.5" r="1.5" fill="currentColor"/></svg>';
    return s;
  }

  const head = h('div', {
    class: 'pinned-bars-head',
    onclick: (e) => {
      // Don't toggle collapse if clicking search input
      if (e.target === searchInput) return;
      isPanelCollapsed = !isPanelCollapsed;
      panel.classList.toggle('is-collapsed', isPanelCollapsed);
      arrow.textContent = isPanelCollapsed ? '▸' : '▾';
      localStorage.setItem('baraha_pinned_collapsed', String(isPanelCollapsed));
    },
  },
    h('div', { class: 'pinned-bars-title' },
      pinIcon(),
      h('span', {}, 'Pinned Bars'),
      countBadge
    ),
    h('div', { class: 'row', style: 'gap: 6px; align-items: center;' },
      searchInput,
      arrow
    )
  );

  const body = h('div', { class: 'pinned-bars-body' });
  const panel = h('div', { class: `pinned-bars-panel ${isPanelCollapsed ? 'is-collapsed' : ''}` }, head, body);

  async function refresh() {
    items = await store.listPinnedBars(searchQuery);
    countBadge.textContent = `(${items.length})`;
    render();
  }

  function render() {
    if (!items.length) {
      body.replaceChildren(
        h('div', { class: 'small faint', style: 'padding: 4px 0;' },
          searchQuery ? 'No matching pinned bars.' : 'No pinned bars yet. Right-click any line in your material or drafts and choose "Pin Bar" to keep it visible on the wall.'
        )
      );
      return;
    }

    const rows = items.map((pb) => {
      const copyBtn = h('button', {
        class: 'ghost small-btn',
        title: 'Copy bar to clipboard',
        onclick: () => {
          navigator.clipboard?.writeText(pb.text);
          toast('Copied pinned bar');
        },
      }, '📋');

      const insertBtn = onInsertBar ? h('button', {
        class: 'ghost small-btn',
        title: 'Insert bar into editor',
        onclick: () => {
          onInsertBar(pb.text);
          toast('Inserted into editor');
        },
      }, 'Insert') : null;

      const sourceLink = (pb.battleId && pb.roundNumber) ? h('a', {
        href: `#/battle/${pb.battleId}/${pb.roundNumber}/final`,
        class: 'small faint',
        title: 'Go to original battle & round',
        style: 'text-decoration: underline;',
      }, `${pb.battleTitle || 'Battle'} · R${pb.roundNumber}`) : null;

      const unpinBtn = h('button', {
        class: 'ghost danger-text small-btn pinned-bar-unpin-btn',
        title: 'Unpin this bar',
        onclick: async () => {
          await store.deletePinnedBar(pb.id);
          toast('Bar unpinned');
          await refresh();
        },
      }, '✕');

      const metaParts = [
        pb.source || 'Final Material',
        sourceLink,
        pb.createdAt ? new Date(pb.createdAt).toLocaleDateString() : '',
      ].filter(Boolean);

      return h('div', { class: 'pinned-bar-item' },
        h('div', { class: 'grow' },
          h('div', { class: 'pinned-bar-text' }, pb.text),
          h('div', { class: 'pinned-bar-meta' }, ...metaParts)
        ),
        h('div', { class: 'pinned-bar-actions' },
          copyBtn,
          insertBtn,
          unpinBtn
        )
      );
    });

    body.replaceChildren(...rows);
  }

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    refresh();
  });

  const onUpdateEvent = () => refresh();
  window.addEventListener('baraha:pinned-updated', onUpdateEvent);

  container.replaceChildren(panel);
  refresh();

  return {
    refresh,
    destroy() {
      window.removeEventListener('baraha:pinned-updated', onUpdateEvent);
    },
  };
}
