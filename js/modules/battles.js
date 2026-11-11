import { h, toast, confirmDialog } from '../core/ui.js';
import { go } from '../core/router.js';
import { formatDate } from '../core/util.js';
import * as store from '../core/store.js';
import { battleFormDialog } from './battle-form.js';

export async function battlesView(root) {
  let all = await store.listBattles();
  const f = { q: '', show: 'active' };   // show: active | archived | all

  const search = h('input', { type: 'search', placeholder: 'Search title, opponent, league…', 'aria-label': 'Search battles',
    oninput: (e) => { f.q = e.target.value; draw(); } });
  const filter = h('select', { 'aria-label': 'Filter battles', onchange: (e) => { f.show = e.target.value; draw(); } },
    h('option', { value: 'active' }, 'Active'), h('option', { value: 'archived' }, 'Archived'), h('option', { value: 'all' }, 'All'));
  const listEl = h('div', {});

  async function reload() { all = await store.listBattles(); draw(); }

  async function run(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); await reload(); } catch (e) { console.error(e); toast(e.message || 'Something went wrong', 'error'); }
  }

  function row(b) {
    const isDone = b.status === 'Done';
    const leagueTag = b.league || 'BATTLE';
    const matchupDetails = [
      b.opponentName && `vs ${b.opponentName}`,
      b.league,
      b.location,
      b.battleDate && formatDate(b.battleDate),
    ].filter(Boolean).join(' · ') || 'No details yet';

    return h('div', { class: 'item battle-card battle-item-row' },
      h('a', { class: 'grow', href: `#/battle/${b.id}/1/final` },
        h('div', { class: 'row', style: 'gap: 8px; align-items: baseline; margin-bottom: 2px;' },
          h('span', { class: 'poster-league-badge', style: 'font-size: 10px; padding: 1px 6px;' }, leagueTag),
          h('div', { class: 'title', style: 'font-family: var(--font-display); font-size: 19px; letter-spacing: 0.03em;' }, b.title)
        ),
        h('div', { class: 'small muted' }, matchupDetails)
      ),
      h('span', { class: `tag ${b.archived ? '' : (isDone ? '' : 'red')}` }, b.archived ? 'Archived' : b.status),
      h('div', { class: 'row', style: 'gap: 4px;' },
        h('button', { class: 'ghost small-btn', onclick: () => go(`/battle/${b.id}/1/final`) }, 'Open'),
        h('button', { class: 'ghost small-btn', onclick: async () => {
          const v = await battleFormDialog(b); if (v) run(() => store.updateBattle(b.id, v), 'Battle updated'); } }, 'Edit'),
        h('button', { class: 'ghost small-btn', onclick: () => run(() => store.setArchived(b.id, !b.archived), b.archived ? 'Restored' : 'Archived') }, b.archived ? 'Restore' : 'Archive'),
        h('button', { class: 'ghost danger small-btn', onclick: async () => {
          const ok = await confirmDialog({ title: 'Delete battle?', danger: true, confirmLabel: 'Delete permanently',
            message: `“${b.title}” and everything inside its three rounds will be deleted. Other battles are not affected. This cannot be undone (consider Archive instead).` });
          if (ok) run(() => store.deleteBattle(b.id), 'Delete'); } }, 'Delete')
      )
    );
  }

  function draw() {
    const q = f.q.trim().toLowerCase();
    const rows = all.filter((b) => (f.show === 'all' || (f.show === 'archived') === b.archived)
      && (!q || [b.title, b.opponentName, b.league, b.location].some((x) => (x || '').toLowerCase().includes(q))));
    listEl.replaceChildren(rows.length ? h('div', { class: 'list' }, rows.map(row))
      : h('div', { class: 'empty-state-wrap empty' },
          h('div', { class: 'empty-state-icon' }, '🎤'),
          h('div', { class: 'empty-state-title' }, all.length ? 'No Matches Found' : "The Wall's Empty"),
          h('div', { class: 'empty-state-desc' }, all.length ? 'No battles match your search or active filter.' : 'Start your first battle matchup and prepare your rounds.'),
          !all.length ? h('button', { class: 'primary', onclick: async () => {
            const v = await battleFormDialog(); if (!v) return;
            const { battle } = await store.createBattle(v); toast('Battle created'); go(`/battle/${battle.id}/1/final`);
          } }, 'New battle') : null
        ));
  }

  root.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h1', {}, 'Battles'),
      h('button', { class: 'primary', onclick: async () => {
        const v = await battleFormDialog(); if (!v) return;
        const { battle } = await store.createBattle(v); toast('Battle created'); go(`/battle/${battle.id}/1/final`); } }, 'New battle')),
    h('div', { class: 'grid2', style: 'grid-template-columns:1fr 160px;margin-bottom:16px' }, search, filter),
    listEl));
  draw();
}
