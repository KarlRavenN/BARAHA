/**
 * Pure helpers for the Voice Inbox (no DOM, no store) so they are unit-testable.
 *
 * EXTENSION POINTS (not implemented yet — see FUTURE_INTEGRATION_NOTES.md):
 *  - favorites / tags / folders: add fields on the voice note (`tags` already exists in the
 *    store) and register a predicate in FILTERS below; add a comparator in SORTS if needed.
 *  - AI transcription / summary: decorate() is where `transcript` / `summary` would be joined
 *    in, and matchesQuery() is where they would join the searchable text.
 */

export const NO_BATTLE = 'No battle';

export function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Join each note with its battle name. @param battles array of {id,title} */
export function decorate(notes, battles) {
  const names = new Map((battles || []).map((b) => [b.id, b.title || b.name || 'Untitled battle']));
  return (notes || []).map((n) => ({
    ...n,
    battleName: n.battleId ? (names.get(n.battleId) || 'Unknown battle') : NO_BATTLE,
  }));
}

/** Searchable text — extend here for tags / transcripts later. */
const searchText = (n) => [n.title, n.battleName, n.description].filter(Boolean).join(' ').toLowerCase();

export function matchesQuery(n, query) {
  const q = (query || '').trim().toLowerCase();
  return !q || q.split(/\s+/).every((tok) => searchText(n).includes(tok));
}

const byDate = (a, b) => String(a.recordedAt || '').localeCompare(String(b.recordedAt || ''));

export const SORTS = {
  newest: { label: 'Newest', compare: (a, b) => byDate(b, a) },
  oldest: { label: 'Oldest', compare: (a, b) => byDate(a, b) },
  duration: { label: 'Duration', compare: (a, b) => (b.durationMs || 0) - (a.durationMs || 0) || byDate(b, a) },
  battle: {
    label: 'Battle',
    // recordings without a battle go last; then by battle name, then newest first
    compare: (a, b) => {
      const an = a.battleName === NO_BATTLE, bn = b.battleName === NO_BATTLE;
      if (an !== bn) return an ? 1 : -1;
      return a.battleName.localeCompare(b.battleName) || byDate(b, a);
    },
  },
};

/** Registry for future filters (favorites, tag, folder). Each: (note, value) => boolean. */
export const FILTERS = {};

export function filterAndSort(decorated, { query = '', sort = 'newest', filters = {} } = {}) {
  const cmp = (SORTS[sort] || SORTS.newest).compare;
  return decorated
    .filter((n) => matchesQuery(n, query))
    .filter((n) => Object.entries(filters).every(([k, v]) => !FILTERS[k] || FILTERS[k](n, v)))
    .sort(cmp);
}
