// Back button navigation memory (js/core/nav-history.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavHistory, normalizeRoute } from '../js/core/nav-history.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('Wall > Line Checker > back = Wall > back again = Line Checker (swap)', () => {
  const nav = createNavHistory(memStorage());
  nav.visit('/'); nav.visit('/line-checker');
  assert.equal(nav.previous(), '/');
  nav.visit('/');                       // user pressed Back: lands on the Wall
  assert.equal(nav.previous(), '/line-checker');
  nav.visit('/line-checker');           // pressed Back again
  assert.equal(nav.previous(), '/');
});

test('Settings > Line Checker > back = Settings', () => {
  const nav = createNavHistory(memStorage());
  nav.visit('/settings'); nav.visit('/line-checker');
  assert.equal(nav.previous(), '/settings');
});

test('re-entering the same route never overwrites previous (refresh, re-render)', () => {
  const nav = createNavHistory(memStorage());
  nav.visit('/'); nav.visit('/settings'); nav.visit('/settings'); nav.visit('/settings');
  assert.equal(nav.previous(), '/');
});

test('redirect-only routes and non-routes are not pages', () => {
  const nav = createNavHistory(memStorage());
  nav.visit('/settings');
  nav.visit('/battles');                              // redirects to /
  nav.visit('#access_token=abc&type=recovery');       // auth hash
  nav.visit('');  nav.visit(undefined);  nav.visit(42);
  nav.visit('/');
  assert.equal(nav.previous(), '/settings');
  assert.equal(normalizeRoute('/battles'), null);
  assert.equal(normalizeRoute('/settings/'), '/settings');
  assert.equal(normalizeRoute('/search?q=x'), '/search');
});

test('round tabs inside one battle are the same page: Back restores the latest round, previous page is kept', () => {
  const nav = createNavHistory(memStorage());
  nav.visit('/');
  nav.visit('/battle/B1/R1');
  nav.visit('/battle/B1/R2');
  nav.visit('/battle/B1/R3/schemes');
  assert.equal(nav.previous(), '/', 'round switches must not become the "previous page"');
  assert.equal(nav.current(), '/battle/B1/R3/schemes');
  nav.visit('/line-checker');
  assert.equal(nav.previous(), '/battle/B1/R3/schemes', 'full route incl. round is restored');
});

test('a different battle IS a new page', () => {
  const nav = createNavHistory(memStorage());
  nav.visit('/battle/B1/R1'); nav.visit('/battle/B2/R1');
  assert.equal(nav.previous(), '/battle/B1/R1');
});

test('survives a refresh (same storage) and a new tab starts clean', () => {
  const s = memStorage();
  const a = createNavHistory(s);
  a.visit('/settings'); a.visit('/line-checker');
  const afterRefresh = createNavHistory(s);
  assert.equal(afterRefresh.previous(), '/settings');
  afterRefresh.visit('/line-checker');                // boot re-enters the same route
  assert.equal(afterRefresh.previous(), '/settings');
  assert.equal(createNavHistory(memStorage()).previous(), null);
});

test('corrupt or missing storage never throws', () => {
  const bad = { getItem: () => '{not json', setItem: () => { throw new Error('full'); } };
  const nav = createNavHistory(bad);
  assert.doesNotThrow(() => nav.visit('/settings'));
  assert.equal(createNavHistory(null).previous(), null);
});
