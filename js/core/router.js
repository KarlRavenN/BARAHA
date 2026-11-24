// Hash router with an async "leave" hook so views can flush unsaved work
// BEFORE the next view replaces the DOM. Routes are matched in order.
//
// A route handler receives (params) and returns either nothing or a
// { destroy?: () => Promise<void> | void } object for the mounted view.

const routes = [];
let current = null;
let navToken = 0;

export const route = (pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, handler });
};

export const go = (path) => { location.hash = '#' + path; };

async function resolve() {
  const token = ++navToken;
  const path = location.hash.slice(1) || '/';
  // Flush/teardown the previous view first. Awaiting guarantees unsaved text is persisted.
  if (current?.destroy) {
    try { await current.destroy(); } catch (e) { console.error('View teardown failed', e); }
  }
  current = null;
  if (token !== navToken) return; // a newer navigation superseded this one
  for (const r of routes) {
    const m = path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    document.dispatchEvent(new CustomEvent('baraha:route', { detail: { path } }));
    const view = document.getElementById('view');
    const changed = resolve._last !== path; resolve._last = path;
    if (view && changed) { // content-only page transition; nav stays fixed
      view.classList.remove('page-enter'); void view.offsetWidth; view.classList.add('page-enter');
      clearTimeout(resolve._t); resolve._t = setTimeout(() => view.classList.remove('page-enter'), 700);
    }
    current = (await r.handler(params)) || null;
    return;
  }
  location.hash = '#/';
}

/** Re-render the current page (flushes unsaved text first, like any navigation). */
export const refresh = () => resolve();

export const startRouter = () => { window.addEventListener('hashchange', resolve); return resolve(); };

/** Best-effort flush for tab close. Browsers may not wait for async work; see docs. */
export const flushCurrent = () => current?.flush?.();
