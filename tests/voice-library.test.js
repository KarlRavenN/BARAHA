import test from 'node:test';
import assert from 'node:assert/strict';
import { decorate, filterAndSort, formatDuration, NO_BATTLE } from '../js/core/voice-library.js';

const battles = [{ id: 'b1', title: 'Zed vs Alpha' }, { id: 'b2', title: 'Beta Showdown' }];
const notes = [
  { id: '1', title: 'Opening flow', recordedAt: '2026-01-01T10:00:00Z', durationMs: 30000, battleId: 'b1' },
  { id: '2', title: 'Punchline test', recordedAt: '2026-01-03T10:00:00Z', durationMs: 90000, battleId: 'b2' },
  { id: '3', title: 'Random idea', recordedAt: '2026-01-02T10:00:00Z', durationMs: 5000, battleId: null },
];
const dec = decorate(notes, battles);
const ids = (r) => r.map((n) => n.id).join(',');

test('decorate joins battle names', () => {
  assert.equal(dec[0].battleName, 'Zed vs Alpha');
  assert.equal(dec[2].battleName, NO_BATTLE);
});
test('sorts', () => {
  assert.equal(ids(filterAndSort(dec, { sort: 'newest' })), '2,3,1');
  assert.equal(ids(filterAndSort(dec, { sort: 'oldest' })), '1,3,2');
  assert.equal(ids(filterAndSort(dec, { sort: 'duration' })), '2,1,3');
  assert.equal(ids(filterAndSort(dec, { sort: 'battle' })), '2,1,3'); // Beta, Zed, then no battle
});
test('search matches recording name and battle name', () => {
  assert.equal(ids(filterAndSort(dec, { query: 'punch' })), '2');
  assert.equal(ids(filterAndSort(dec, { query: 'zed' })), '1');
  assert.equal(ids(filterAndSort(dec, { query: 'nothing' })), '');
});
test('formatDuration', () => { assert.equal(formatDuration(65000), '1:05'); assert.equal(formatDuration(0), '0:00'); });
