// Stage 1 sync foundations: stamping, queueing, tombstones, ack, applyRemote, isolation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryBackend } from './memory-backend.js';
import * as store from '../js/core/store.js';
import { dbNameFor } from '../js/core/db.js';
import { isSyncable, queueId } from '../js/core/sync-tracking.js';

const put = (s, value) => ({ op: 'put', store: s, value });
const del = (s, key) => ({ op: 'delete', store: s, key });
const queueOf = async (b) => Object.fromEntries((await b.sync.getPending(1000)).map((e) => [e.qid, e]));

test('a write stamps modifiedAt, keeps updatedAt untouched, and queues the change', async () => {
  const b = createMemoryBackend({ now: () => 1_000 });
  await b.batch([put('battles', { id: 'b1', title: 'A', updatedAt: '2020-01-01T00:00:00.000Z' })]);
  const rec = await b.get('battles', 'b1');
  assert.equal(rec.updatedAt, '2020-01-01T00:00:00.000Z', 'updatedAt (Wall order) must not be touched');
  assert.equal(rec.modifiedAt, new Date(1_000).toISOString());
  const q = await queueOf(b);
  assert.deepEqual(Object.keys(q), ['battles:b1']);
  assert.equal(q['battles:b1'].deleted, false);
  assert.equal(q['battles:b1'].modifiedAt, rec.modifiedAt);
});

test('modifiedAt is strictly increasing even when the clock does not move', async () => {
  const b = createMemoryBackend({ now: () => 5_000 });
  await b.batch([put('battles', { id: 'b1' })]);
  await b.batch([put('battles', { id: 'b1', title: 'v2' })]);
  const q = await queueOf(b);
  assert.equal(q['battles:b1'].modifiedAt, new Date(5_001).toISOString());
});

test('repeated edits of one record collapse into ONE queue entry with the newest stamp', async () => {
  const b = createMemoryBackend();
  for (let i = 0; i < 5; i++) await b.batch([put('rounds', { id: 'r1', battleId: 'b', name: `v${i}` })]);
  const pending = await b.sync.getPending();
  assert.equal(pending.length, 1);
  assert.equal((await b.get('rounds', 'r1')).modifiedAt, pending[0].modifiedAt);
});

test('delete removes the record locally and queues a tombstone; put-then-delete in one batch is a tombstone', async () => {
  const b = createMemoryBackend();
  await b.batch([put('rounds', { id: 'r1', battleId: 'b' })]);
  await b.batch([del('rounds', 'r1')]);
  assert.equal(await b.get('rounds', 'r1'), undefined);
  assert.equal((await queueOf(b))['rounds:r1'].deleted, true);

  await b.batch([put('rounds', { id: 'r2', battleId: 'b' }), del('rounds', 'r2')]);
  assert.equal((await queueOf(b))['rounds:r2'].deleted, true);
});

test('delete-then-put in one batch (restore) leaves a LIVE queued record', async () => {
  const b = createMemoryBackend();
  await b.batch([put('rounds', { id: 'r1', battleId: 'b', name: 'old' })]);
  await b.batch([del('rounds', 'r1'), put('rounds', { id: 'r1', battleId: 'b', name: 'restored' })]);
  const q = await queueOf(b);
  assert.equal(q['rounds:r1'].deleted, false);
  assert.equal((await b.get('rounds', 'r1')).name, 'restored');
});

test('finalMaterials are keyed by roundId in the queue', async () => {
  const b = createMemoryBackend();
  await b.batch([put('finalMaterials', { roundId: 'r9', battleId: 'b', text: 'bars' })]);
  assert.ok((await queueOf(b))[queueId('finalMaterials', 'r9')]);
});

test('settings, audioBlobs and the sync stores are never stamped or queued', async () => {
  const b = createMemoryBackend();
  await b.batch([put('settings', { key: 'x', value: 1 }), put('audioBlobs', { id: 'a1', voiceNoteId: 'v' })]);
  assert.equal((await b.get('settings', 'x')).modifiedAt, undefined);
  assert.equal(await b.sync.pendingCount(), 0);
  assert.ok(!isSyncable('settings') && !isSyncable('audioBlobs') && !isSyncable('syncQueue') && isSyncable('battles'));
});

test('a failing batch applies nothing: neither the data nor its queue entry', async () => {
  const b = createMemoryBackend();
  await assert.rejects(b.batch([put('battles', { id: 'b1' }), put('nope', { id: 'x' })]));
  assert.equal(await b.get('battles', 'b1'), undefined);
  assert.equal(await b.sync.pendingCount(), 0);
});

test('ack removes pushed entries but keeps one that was edited while the push was in flight', async () => {
  const b = createMemoryBackend();
  await b.batch([put('rounds', { id: 'r1', battleId: 'b' }), put('rounds', { id: 'r2', battleId: 'b' })]);
  const inFlight = await b.sync.getPending();
  await b.batch([put('rounds', { id: 'r1', battleId: 'b', name: 'edited during push' })]);
  await b.sync.ack(inFlight);
  const left = await queueOf(b);
  assert.deepEqual(Object.keys(left), ['rounds:r1'], 'r2 acked, r1 stays because it changed');
});

test('applyRemote writes cloud data WITHOUT stamping or queueing, and drops the stale queue entry', async () => {
  const b = createMemoryBackend();
  await b.batch([put('rounds', { id: 'r1', battleId: 'b', name: 'local' })]);
  assert.equal(await b.sync.pendingCount(), 1);
  await b.sync.applyRemote([put('rounds', { id: 'r1', battleId: 'b', name: 'from cloud', modifiedAt: '2030-01-01T00:00:00.000Z' })]);
  const rec = await b.get('rounds', 'r1');
  assert.equal(rec.name, 'from cloud');
  assert.equal(rec.modifiedAt, '2030-01-01T00:00:00.000Z', 'remote stamp is kept as-is');
  assert.equal(await b.sync.pendingCount(), 0, 'no echo: nothing re-queued');
  await b.sync.applyRemote([del('rounds', 'r1')]);
  assert.equal(await b.get('rounds', 'r1'), undefined);
  assert.equal(await b.sync.pendingCount(), 0);
});

test('clearAll empties data, queues tombstones for everything, and keeps sync bookkeeping', async () => {
  const b = createMemoryBackend();
  await b.sync.setMeta('deviceId', 'dev-1');
  await b.batch([put('battles', { id: 'b1' }), put('rounds', { id: 'r1', battleId: 'b1' }), put('settings', { key: 'k', value: 1 })]);
  await b.clearAll();
  assert.equal((await b.getAll('battles')).length, 0);
  const q = await queueOf(b);
  assert.equal(q['battles:b1'].deleted, true);
  assert.equal(q['rounds:r1'].deleted, true);
  assert.equal(await b.sync.getMeta('deviceId'), 'dev-1');
});

test('meta get/set round-trips with a fallback', async () => {
  const b = createMemoryBackend();
  assert.equal(await b.sync.getMeta('lastPulledAt', 'never'), 'never');
  await b.sync.setMeta('lastPulledAt', '2026-11-14T00:00:00.000Z');
  assert.equal(await b.sync.getMeta('lastPulledAt'), '2026-11-14T00:00:00.000Z');
});

test('account databases are named per user and fall back to the legacy name', () => {
  assert.equal(dbNameFor('abc-123'), 'baraha-abc-123');
  assert.notEqual(dbNameFor('u1'), dbNameFor('u2'));
  assert.equal(dbNameFor(undefined), 'baraha');
});

test('through the real store: creating, writing and deleting a battle is all tracked', async () => {
  const b = createMemoryBackend();
  store.setBackend(b);
  const { battle, rounds } = await store.createBattle({ title: 'Sync Test', opponentName: 'X' });
  await store.saveFinalMaterial(rounds[0].id, battle.id, 'first bar');
  let q = await queueOf(b);
  assert.ok(q[queueId('battles', battle.id)]);
  assert.equal(rounds.filter((r) => q[queueId('rounds', r.id)]).length, 4);
  assert.ok(q[queueId('finalMaterials', rounds[0].id)]);

  await b.sync.ack(await b.sync.getPending(1000));
  assert.equal(await b.sync.pendingCount(), 0);

  await store.deleteBattle(battle.id);
  q = await queueOf(b);
  assert.equal(q[queueId('battles', battle.id)].deleted, true);
  assert.ok(rounds.every((r) => q[queueId('rounds', r.id)]?.deleted === true), 'cascaded deletes are tombstoned too');
});

test('restoring a backup tombstones records that are not in it and re-queues the ones that are', async () => {
  const b = createMemoryBackend();
  store.setBackend(b);
  const keep = await store.createBattle({ title: 'Keep', opponentName: 'A' });
  const backup = await store.exportAll();
  const drop = await store.createBattle({ title: 'Drop', opponentName: 'B' });
  await b.sync.ack(await b.sync.getPending(1000));

  await store.restoreAll(backup);
  const q = await queueOf(b);
  assert.equal(q[queueId('battles', drop.battle.id)].deleted, true);
  assert.equal(q[queueId('battles', keep.battle.id)].deleted, false);
});
