// Stage 2 sync engine: two simulated devices + a fake Supabase server (same rules as supabase/001_sync_records.sql).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryBackend } from './memory-backend.js';
import { createSync } from '../js/core/sync.js';
import { setBackend, setAudioFetcher, fetchAudio, exportZipBackup } from '../js/core/store.js';
import { readZip } from '../js/core/zip.js';

const ms = (v) => Date.parse(v);
const put = (store, value) => ({ op: 'put', store, value });
const del = (store, key) => ({ op: 'delete', store, key });

/** Fake of the Supabase pieces sync.js uses: rpc('sync_push') and from('sync_records').select()... */
function createFakeServer() {
  const rows = new Map(); // `${user}|${store}|${id}` -> row
  let tick = Date.parse('2030-01-01T00:00:00Z');
  const fail = { rpc: null, select: null, upload: null };
  const objects = new Map(); // fake Storage: 'bucket/path' -> { blob, opts }
  const calls = { rpc: 0, select: 0 };
  const fmt = (t) => new Date(t).toISOString().replace('Z', '+00:00'); // like Postgres
  function clientFor(userId) {
    return {
      async rpc(name, { records }) {
        calls.rpc++;
        if (fail.rpc) return { error: { message: fail.rpc } };
        assert.equal(name, 'sync_push');
        for (const r of records) {
          const key = `${userId}|${r.store}|${r.id}`;
          const cur = rows.get(key);
          if (cur && !(ms(r.updated_at) > ms(cur.updated_at))) continue; // newest edit wins
          rows.set(key, { user_id: userId, store: r.store, id: r.id, data: r.data, updated_at: fmt(ms(r.updated_at)), deleted: !!r.deleted, device_id: r.device_id, server_updated_at: fmt(tick++) });
        }
        return { error: null };
      },
      storage: {
        from(bucket) {
          return {
            async upload(path, blob, opts) {
              if (fail.upload) return { data: null, error: { message: fail.upload } };
              objects.set(`${bucket}/${path}`, { blob, opts });
              return { data: { path }, error: null };
            },
            async download(path) {
              const o = objects.get(`${bucket}/${path}`);
              return o ? { data: o.blob, error: null } : { data: null, error: { message: 'Object not found' } };
            },
            async remove(paths) { for (const p of paths) objects.delete(`${bucket}/${p}`); return { data: [], error: null }; },
          };
        },
      },
      from() {
        const f = { filters: [], orders: [], range: null };
        const b = {
          select() { return b; },
          eq(c, v) { f.filters.push((r) => r[c] === v); return b; },
          gte(c, v) { f.filters.push((r) => ms(r[c]) >= ms(v)); return b; },
          order(c) { f.orders.push(c); return b; },
          range(a, z) { f.range = [a, z]; return b; },
          then(res, rej) {
            calls.select++;
            if (fail.select) return Promise.resolve({ data: null, error: { message: fail.select } }).then(res, rej);
            let out = [...rows.values()].filter((r) => f.filters.every((fn) => fn(r)));
            out.sort((x, y) => ms(x.server_updated_at) - ms(y.server_updated_at) || x.store.localeCompare(y.store) || x.id.localeCompare(y.id));
            if (f.range) out = out.slice(f.range[0], f.range[1] + 1);
            return Promise.resolve({ data: structuredClone(out), error: null }).then(res, rej);
          },
        };
        return b;
      },
    };
  }
  return { clientFor, rows, fail, calls, objects };
}

async function device(server, { user = 'u1', clock = Date.parse('2030-06-01T10:00:00Z'), name = 'dev' } = {}) {
  const t = { ms: clock };
  const backend = createMemoryBackend({ now: () => t.ms });
  await backend.sync.setMeta('deviceId', name);
  const sync = createSync({ backend, client: server.clientFor(user), userId: user, now: () => t.ms, overlapMs: 10_000, pollMs: 1e9, debounceMs: 1e9 });
  // start() without the initial cycle noise: mark started via start()
  await sync.start();
  return { backend, sync, t, advance: (n) => { t.ms += n; } };
}
const texts = async (b) => (await b.getAll('finalMaterials')).map((r) => r.text);
const drafts = async (b) => (await b.getAll('drafts')).filter((d) => d.tags?.includes('conflict'));

test('a battle created on device A shows up on device B (and nothing is echoed back)', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch([put('battles', { id: 'b1', title: 'Yoraven vs Bat', updatedAt: 'x' }), put('rounds', { id: 'r1', battleId: 'b1', name: 'Round 1' })]);
  await A.sync.syncNow({ force: true });
  await B.sync.syncNow({ force: true });
  assert.equal((await B.backend.get('battles', 'b1')).title, 'Yoraven vs Bat');
  assert.equal((await B.backend.get('rounds', 'r1')).name, 'Round 1');
  assert.equal(await B.backend.sync.pendingCount(), 0, 'pulled data must not be queued again');
  assert.equal(A.sync.getStatus().state, 'idle');
});

test('edits and deletions propagate both ways', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch([put('battles', { id: 'b1', title: 'v1' })]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  B.advance(5000);
  await B.backend.batch([put('battles', { id: 'b1', title: 'v2 from B' })]);
  await B.sync.syncNow({ force: true }); await A.sync.syncNow({ force: true });
  assert.equal((await A.backend.get('battles', 'b1')).title, 'v2 from B');
  A.advance(20000);
  await A.backend.batch([del('battles', 'b1')]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  assert.equal(await B.backend.get('battles', 'b1'), undefined, 'deletion reaches the other device');
  assert.equal(await B.backend.sync.pendingCount(), 0);
});

test('two devices edit the same round offline: newest wins and the older text is kept as a conflict copy', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'base' })]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  // both go offline and edit
  A.advance(60_000); B.advance(120_000);
  await A.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'A wrote this first' })]);
  await B.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'B wrote this later' })]);
  await A.sync.syncNow({ force: true });   // A reaches the server first
  await B.sync.syncNow({ force: true });   // B is newer, so B wins on the server
  await A.sync.syncNow({ force: true });   // A pulls B's version
  assert.deepEqual(await texts(A.backend), ['B wrote this later']);
  assert.deepEqual(await texts(B.backend), ['B wrote this later']);
  const copies = await drafts(A.backend);
  assert.equal(copies.length, 1, 'A keeps its older text as a conflict copy');
  assert.equal(copies[0].content, 'A wrote this first');
  // the copy syncs too, so no writing is lost anywhere
  await B.sync.syncNow({ force: true });
  assert.equal((await drafts(B.backend)).length, 1);
});

test('when the OTHER device is older, this device keeps its text and saves the other text as a copy', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'base' })]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  A.advance(60_000); B.advance(200_000);
  await A.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'A older' })]);
  await B.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'B newer' })]);
  await B.sync.syncNow({ force: true });   // newer edit reaches the server first
  await A.sync.syncNow({ force: true });   // A's older edit loses on the server; A pulls B's
  assert.deepEqual(await texts(A.backend), ['B newer']);
  assert.equal((await drafts(A.backend))[0].content, 'A older');
});

test('an edit made while a sync is pulling is never overwritten', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch([put('battles', { id: 'b1', title: 'base' })]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  B.advance(10_000);
  await B.backend.batch([put('battles', { id: 'b1', title: 'remote edit' })]);
  await B.sync.syncNow({ force: true });
  // A edits LOCALLY exactly while its pull is applying (after the row was read, before it is applied)
  const realApply = A.backend.sync.applyRemote;
  A.backend.sync.applyRemote = async (ops) => {
    A.advance(1);
    await A.backend.batch([put('battles', { id: 'b1', title: 'typed during sync' })]);
    return realApply(ops);
  };
  A.advance(20_000);
  await A.sync.syncNow({ force: true });
  assert.equal((await A.backend.get('battles', 'b1')).title, 'typed during sync');
  A.backend.sync.applyRemote = realApply;
  await A.sync.syncNow({ force: true });
  assert.equal((await A.backend.get('battles', 'b1')).title, 'typed during sync', 'and it still wins afterwards');
});

test('a device with a SLOW clock still wins when it edits after seeing the other edit', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A', clock: Date.parse('2030-06-01T12:00:00Z') });
  const B = await device(s, { name: 'B', clock: Date.parse('2030-06-01T09:00:00Z') }); // 3 hours behind
  await A.backend.batch([put('battles', { id: 'b1', title: 'from fast clock' })]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  B.advance(60_000); // B edits a minute later in real life, but its clock is still hours earlier
  await B.backend.batch([put('battles', { id: 'b1', title: 'B edited after seeing A' })]);
  await B.sync.syncNow({ force: true }); await A.sync.syncNow({ force: true });
  assert.equal((await A.backend.get('battles', 'b1')).title, 'B edited after seeing A');
});

test('a broken clock far in the future does not poison the other devices', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A', clock: Date.parse('2030-06-01T10:00:00Z') });
  const B = await device(s, { name: 'B', clock: Date.parse('2040-01-01T00:00:00Z') }); // 10 years ahead
  await B.backend.batch([put('battles', { id: 'b1', title: 'from a broken clock' })]);
  await B.sync.syncNow({ force: true }); await A.sync.syncNow({ force: true });
  A.advance(1000);
  await A.backend.batch([put('battles', { id: 'b2', title: 'normal' })]);
  const stamp = (await A.backend.get('battles', 'b2')).modifiedAt;
  assert.ok(ms(stamp) < Date.parse('2031-01-01'), 'our stamps must not jump 10 years ahead');
});

test('stores that stay local (line-checker data) are not uploaded and do not count as pending', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  await A.backend.batch([put('referenceLines', { id: 'l1', text: 'x' }), put('scans', { id: 's1' }), put('battles', { id: 'b1', title: 'ok' })]);
  await A.sync.syncNow({ force: true });
  assert.deepEqual([...s.rows.values()].map((r) => r.store), ['battles']);
  assert.equal(A.sync.getStatus().pending, 0);
  assert.equal(await A.backend.sync.pendingCount(), 2, 'they stay queued, local only');
});

test('offline: nothing is lost, status says offline, and it catches up when back online', async () => {
  const s = createFakeServer();
  let online = false;
  const A = await device(s, { name: 'A' });
  A.sync.stop();
  const backend = A.backend;
  const sync = createSync({ backend, client: s.clientFor('u1'), userId: 'u1', now: () => A.t.ms, isOnline: () => online, pollMs: 1e9, debounceMs: 1e9 });
  await sync.start();
  await backend.batch([put('battles', { id: 'b1', title: 'written offline' })]);
  await sync.syncNow({ force: true });
  assert.equal(sync.getStatus().state, 'offline');
  assert.equal(sync.getStatus().pending, 1);
  assert.equal(s.rows.size, 0);
  online = true;
  await sync.syncNow({ force: true });
  assert.equal(sync.getStatus().state, 'idle');
  assert.equal(s.rows.size, 1);
});

test('server errors keep the queue, report an error, and recover with backoff', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  s.fail.rpc = 'boom';
  await A.backend.batch([put('battles', { id: 'b1', title: 'x' })]);
  await A.sync.syncNow({ force: true });
  assert.equal(A.sync.getStatus().state, 'error');
  assert.equal(await A.backend.sync.pendingCount(), 1, 'nothing dropped on failure');
  const rpcBefore = s.calls.rpc;
  await A.sync.syncNow(); // not forced: inside the backoff window, so no new request
  assert.equal(s.calls.rpc, rpcBefore);
  s.fail.rpc = null;
  await A.sync.syncNow({ force: true });
  assert.equal(A.sync.getStatus().state, 'idle');
  assert.equal(await A.backend.sync.pendingCount(), 0);
});

test('large histories download in pages and different accounts never see each other', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A', user: 'u1' });
  const ops = [];
  for (let i = 0; i < 1200; i++) ops.push(put('rhymes', { id: `r${i}`, battleId: 'b', text: `line ${i}` }));
  for (let i = 0; i < ops.length; i += 100) await A.backend.batch(ops.slice(i, i + 100));
  await A.sync.syncNow({ force: true });
  const B = await device(s, { name: 'B', user: 'u1' });
  assert.equal((await B.backend.getAll('rhymes')).length, 1200);
  const other = await device(s, { name: 'C', user: 'u2' });
  assert.equal((await other.backend.getAll('rhymes')).length, 0, 'another account sees nothing');
});

test('records that existed before sync (no stamp, no queue entry) are uploaded once', async () => {
  const s = createFakeServer();
  const backend = createMemoryBackend({ track: false });
  // build a tracked view over the same raw data by writing unstamped records first
  await backend.batch([put('battles', { id: 'old1', title: 'legacy' })]);
  const tracked = createMemoryBackend({ now: () => Date.parse('2030-06-01T10:00:00Z') });
  await tracked.sync.setMeta('deviceId', 'A');
  // emulate legacy data inside the tracked backend's raw store: write through applyRemote-less path
  await tracked.applyRemote?.call?.(tracked, []);
  await tracked.sync.applyRemote([{ op: 'put', store: 'battles', value: { id: 'old1', title: 'legacy' } }]);
  assert.equal((await tracked.get('battles', 'old1')).modifiedAt, undefined);
  const sync = createSync({ backend: tracked, client: s.clientFor('u1'), userId: 'u1', now: () => Date.parse('2030-06-01T10:00:00Z'), pollMs: 1e9, debounceMs: 1e9 });
  await sync.start();
  assert.equal([...s.rows.values()].filter((r) => r.id === 'old1').length, 1);
});

test('normal updates never create conflict copies (stale device, or edit built on the other edit)', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'v1' })]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  // A edits twice; B is merely stale (no edits of its own)
  A.advance(10_000); await A.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'v2' })]);
  A.advance(10_000); await A.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'v3' })]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  assert.deepEqual(await texts(B.backend), ['v3']);
  // B builds on A's edit after pulling it
  B.advance(60_000); await B.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'v4 by B' })]);
  await B.sync.syncNow({ force: true }); await A.sync.syncNow({ force: true });
  assert.deepEqual(await texts(A.backend), ['v4 by B']);
  assert.equal((await drafts(A.backend)).length + (await drafts(B.backend)).length, 0, 'no false conflicts');
});

test('a conflict produces exactly ONE copy even though both devices notice it', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'base' })]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  A.advance(60_000); B.advance(120_000);
  await A.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'A text' })]);
  await B.backend.batch([put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'B text' })]);
  for (let i = 0; i < 3; i++) { await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true }); }
  const onServer = [...s.rows.values()].filter((r) => r.store === 'drafts' && !r.deleted);
  assert.equal(onServer.length, 1);
  assert.equal(onServer[0].data.content, 'A text');
  assert.deepEqual(await texts(A.backend), ['B text']);
  assert.deepEqual(await texts(B.backend), ['B text']);
  assert.equal((await drafts(A.backend)).length, 1);
  assert.equal((await drafts(B.backend)).length, 1);
});

test('syncing again with nothing new changes nothing (no ping-pong)', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch([put('battles', { id: 'b1', title: 'x' }), put('finalMaterials', { roundId: 'r1', battleId: 'b1', text: 'hi' })]);
  for (let i = 0; i < 4; i++) { await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true }); }
  const snap = JSON.stringify([...s.rows.values()].map((r) => [r.id, r.server_updated_at]));
  for (let i = 0; i < 3; i++) { await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true }); }
  assert.equal(JSON.stringify([...s.rows.values()].map((r) => [r.id, r.server_updated_at])), snap, 'server rows untouched');
  assert.equal(await A.backend.sync.pendingCount() + await B.backend.sync.pendingCount(), 0);
});

// ---------------- Stage 3: voice notes + audio ----------------
const audioBlob = (text = 'fake-audio-bytes') => new Blob([text], { type: 'audio/webm' });
const putVoice = (id, audioId, text) => [
  put('voiceNotes', { id, title: `Take ${id}`, durationMs: 4000, recordedAt: '2030-06-01T10:00:00.000Z', battleId: 'b1', tags: [] }),
  put('audioBlobs', { id: audioId, voiceNoteId: id, mimeType: 'audio/webm', blob: audioBlob(text) }),
];

test('a voice note recorded on A: the file goes to Storage, B gets a placeholder (no Blob in the table)', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch(putVoice('v1', 'a1'));
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  assert.ok(s.objects.has('audio/u1/a1'), 'file uploaded to <userId>/<audioId>');
  assert.equal(s.objects.get('audio/u1/a1').opts.contentType, 'audio/webm');
  const row = [...s.rows.values()].find((r) => r.store === 'audioBlobs');
  assert.equal(row.data.blob, undefined, 'the Blob never goes into the JSON table');
  assert.equal(row.data.path, 'u1/a1');
  assert.equal(row.data.size, 'fake-audio-bytes'.length);
  assert.equal((await B.backend.get('voiceNotes', 'v1')).title, 'Take v1');
  const ph = await B.backend.get('audioBlobs', 'a1');
  assert.equal(ph.blob, null); assert.equal(ph.remote, true); assert.equal(ph.path, 'u1/a1');
  assert.equal(await B.backend.sync.pendingCount(), 0, 'a placeholder is not uploaded back');
  assert.equal(await A.backend.sync.pendingCount(), 0);
});

test('the audio is downloaded when played, kept on the device, and not uploaded again', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch(putVoice('v1', 'a1', 'hello flow'));
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  setBackend(B.backend); setAudioFetcher(B.sync.downloadAudio);
  const rec = await fetchAudio('v1');
  assert.equal(await rec.blob.text(), 'hello flow');
  const kept = await B.backend.get('audioBlobs', 'a1');
  assert.equal(kept.remote, false); assert.ok(kept.blob);
  assert.equal(await B.backend.sync.pendingCount(), 0, 'downloaded audio is not queued for upload');
  let calls = 0; setAudioFetcher(async () => { calls++; return null; });
  assert.equal((await fetchAudio('v1')).blob.size, 'hello flow'.length);
  assert.equal(calls, 0, 'second play uses the local copy');
  await B.sync.syncNow({ force: true }); await A.sync.syncNow({ force: true });
  assert.equal(s.objects.size, 1);
});

test('without internet a cloud-only recording gives a clear message and stays a placeholder', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch(putVoice('v1', 'a1'));
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  setBackend(B.backend);
  setAudioFetcher(async () => { throw new Error('Failed to fetch'); });
  await assert.rejects(() => fetchAudio('v1'), /Failed to fetch/);
  setAudioFetcher(null);
  await assert.rejects(() => fetchAudio('v1'), /not downloaded yet/);
  assert.equal((await B.backend.get('audioBlobs', 'a1')).blob, null);
});

test('deleting a voice note removes the file from Storage and the note on the other device', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch(putVoice('v1', 'a1'));
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  A.advance(5000);
  await A.backend.batch([del('voiceNotes', 'v1'), del('audioBlobs', 'a1')]);
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  assert.equal(s.objects.size, 0, 'no orphan audio left in the cloud');
  assert.equal(await B.backend.get('voiceNotes', 'v1'), undefined);
  assert.equal(await B.backend.get('audioBlobs', 'a1'), undefined);
});

test('a failed upload keeps everything queued, never blocks the text, and recovers', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  s.fail.upload = 'The object exceeded the maximum allowed size';
  await A.backend.batch([put('battles', { id: 'b1', title: 'text goes first' }), ...putVoice('v1', 'a1')]);
  await A.sync.syncNow({ force: true });
  assert.equal(A.sync.getStatus().state, 'error');
  assert.match(A.sync.getStatus().error, /storage may be full|too big/);
  assert.equal([...s.rows.values()].filter((r) => r.store === 'battles').length, 1, 'the text still got through');
  assert.ok(await A.backend.get('audioBlobs', 'a1'), 'recording still on the device');
  s.fail.upload = null;
  await A.sync.syncNow({ force: true });
  assert.equal(A.sync.getStatus().state, 'idle');
  assert.ok(s.objects.has('audio/u1/a1'));
  assert.equal(await A.backend.sync.pendingCount(), 0);
});

test('recordings made BEFORE Stage 3 (unstamped, earlier stores already backfilled) are uploaded once', async () => {
  const s = createFakeServer();
  const t = { ms: Date.parse('2030-06-01T10:00:00Z') };
  const backend = createMemoryBackend({ now: () => t.ms });
  await backend.sync.setMeta('deviceId', 'A');
  await backend.sync.setMeta('backfilled', true); // what a Stage 2 device has stored
  // legacy records written without stamps (bypassing tracking)
  await backend.sync.applyRemote([
    { op: 'put', store: 'voiceNotes', value: { id: 'old', title: 'old take', recordedAt: 'x', tags: [] } },
    { op: 'put', store: 'audioBlobs', value: { id: 'oldA', voiceNoteId: 'old', mimeType: 'audio/webm', blob: audioBlob('old audio') } },
  ]);
  const sync = createSync({ backend, client: s.clientFor('u1'), userId: 'u1', now: () => t.ms, pollMs: 1e9, debounceMs: 1e9 });
  await sync.start();
  assert.ok(s.objects.has('audio/u1/oldA'));
  assert.deepEqual([...s.rows.values()].map((r) => r.store).sort(), ['audioBlobs', 'voiceNotes']);
  assert.deepEqual(await backend.sync.getMeta('backfilledStores'), [
    'battles', 'rounds', 'finalMaterials', 'drafts', 'schemes', 'schemeDrafts', 'rhymes', 'opponents', 'opponentNotes', 'pronunciations', 'pinnedBars', 'voiceNotes', 'audioBlobs']);
});

test('a backup taken on a device includes audio that was still only in the cloud', async () => {
  const s = createFakeServer();
  const A = await device(s, { name: 'A' });
  const B = await device(s, { name: 'B' });
  await A.backend.batch(putVoice('v1', 'a1', 'backup me'));
  await A.sync.syncNow({ force: true }); await B.sync.syncNow({ force: true });
  assert.equal((await B.backend.get('audioBlobs', 'a1')).blob, null, 'B only has a placeholder');
  setBackend(B.backend); setAudioFetcher(B.sync.downloadAudio);
  const zip = await exportZipBackup();
  const files = await readZip(zip);
  const audio = files.find((f) => f.name.startsWith('audio/v1.'));
  assert.ok(audio, 'the ZIP contains the recording');
  assert.equal(new TextDecoder().decode(audio.data), 'backup me');
});
