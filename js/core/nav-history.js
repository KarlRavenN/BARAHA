// Remembers the CURRENT and the PREVIOUS page (route) so the Back button returns to the page
// the user was just on, and pressing it again swaps back (Wall > Line Checker > back = Wall > back = Line Checker).
// Not raw browser history: redirects, repeated visits and round tabs never create fake "pages".
// Saved in sessionStorage, so a refresh keeps it but a new tab starts clean.

const KEY = 'baraha.navhist.v1';
const IGNORED = new Set(['/battles']); // redirect-only routes are never real pages

/** Only plain app routes count ("/settings", "/battle/ID/ROUND"). Auth hashes, junk and redirects do not. */
export function normalizeRoute(path) {
  if (typeof path !== 'string') return null;
  const p = path.split('?')[0];
  if (!p.startsWith('/') || IGNORED.has(p)) return null;
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

const battleIdOf = (p) => (p && p.match(/^\/battle\/([^/]+)/)?.[1]) || null;

export function createNavHistory(storage) {
  const read = () => {
    try {
      const s = JSON.parse(storage?.getItem(KEY) || 'null');
      if (s && typeof s === 'object') return { current: s.current || null, previous: s.previous || null };
    } catch { /* corrupt or unavailable: start clean */ }
    return { current: null, previous: null };
  };
  let state = read();
  const write = () => { try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* best effort */ } };

  return {
    /** Call once per route change. */
    visit(path) {
      const p = normalizeRoute(path);
      if (!p || p === state.current) return; // fix-ups and re-entering the same route change nothing
      const sameBattle = battleIdOf(p) && battleIdOf(p) === battleIdOf(state.current);
      // Switching rounds/sections inside one battle is the same page: remember the latest
      // round (so Back restores it) but keep the page we came from.
      state = sameBattle ? { ...state, current: p } : { current: p, previous: state.current };
      write();
    },
    previous: () => state.previous,
    current: () => state.current,
  };
}

const hasSession = typeof sessionStorage !== 'undefined';
export const navHistory = createNavHistory(hasSession ? sessionStorage : null);

export function initNavHistory() {
  document.addEventListener('baraha:route', (e) => navHistory.visit(e.detail?.path));
}

/** Go to the previous page, or to `fallback` (the page's parent) when there is none. */
export function goBack(fallback = '/') {
  const target = navHistory.previous() || fallback;
  location.hash = '#' + target;
}
