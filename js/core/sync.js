// Cloud sync engine (Stage 2: text data). Offline-first: the app always reads and writes the
// LOCAL database; this module copies changes to/from Supabase in the background.
//
//   push:  local changes (syncQueue) -> RPC sync_push (server keeps the newest edit per record)
//   pull:  rows changed on the server since our cursor -> applied locally
//
// Rules that protect your writing:
//   * Last write wins PER RECORD, using modifiedAt stamps. Stamps are kept causally ordered
//     across devices (sync-tracking observe()), so a slow device clock cannot silently lose.
//   * If two devices edited the same round's text while apart, the older text is NEVER dropped:
//     it is saved as a "Conflict copy" draft on the device that notices.
//   * Remote data is applied with a conditional write, so an edit you make while a sync is
//     running is never overwritten.
//   * Pulled data is not re-queued (no echo loops).
//   * Nothing here can break saving: all errors are caught, the app keeps working offline.
//
// Stage 3 (this file) also syncs voice notes: the note's details go to the table like any record,
// the AUDIO FILE goes to a private Supabase Storage bucket ("audio", path <userId>/<audioId>).
// Audio is immutable (recorded once), so it never conflicts. Other devices receive a placeholder
// and download the file only when it is played (store.fetchAudio). Stage 4 adds Realtime.

import { uid } from './util.js';
import { KEY_PATHS } from './db.js';

/** The stores Stage 2 synced. Kept so devices that already ran the one-time upload of old records
 *  for these stores only do it for the stores added later. */
const STAGE2_STORES = [
  'battles', 'rounds', 'finalMaterials', 'drafts', 'schemes', 'schemeDrafts',
  'rhymes', 'opponents', 'opponentNotes', 'pronunciations', 'pinnedBars',
];
/** Synced stores. The line-checker corpus (referenceLines, scans, scanMatches) stays local. */
export const SYNCED_STORES = [...STAGE2_STORES, 'voiceNotes', 'audioBlobs'];

const AUDIO_BUCKET = 'audio';

const ms = (v) => Date.parse(v);
const isoOf = (v) => new Date(Date.parse(v)).toISOString();
const MAX_PUSH_CHARS = 1_500_000; // keep each request comfortably small

export function createSync({
  backend,
  client,
  userId,
  stores = SYNCED_STORES,
  now = () => Date.now(),
  pageSize = 500,
  pushBatch = 50,
  overlapMs = 10_000, // re-read a short window on every pull; applying a row twice is harmless
  pollMs = 30_000,
  debounceMs = 2_500,
  isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
  isDisabled = () => {
    try { return globalThis.localStorage?.getItem('baraha_sync') === 'off'; } catch { return false; }
  },
} = {}) {
  const storeSet = new Set(stores);
  const status = { state: 'idle', pending: 0, lastSyncedAt: null, error: null };
  const statusCbs = new Set();
  const appliedCbs = new Set();
  let started = false;
  let running = null;
  let again = false;
  let failures = 0;
  let nextTryAt = 0;
  let pollTimer = null;
  let debounceTimer = null;
  const cleanups = [];

  const setStatus = (patch) => {
    Object.assign(status, patch);
    statusCbs.forEach((cb) => { try { cb({ ...status }); } catch { /* ignore */ } });
  };
  const countPending = async () =>
    (await backend.sync.getPending(100_000)).filter((e) => storeSet.has(e.store)).length;

  // ---------- push ----------
  async function push() {
    const deviceId = await backend.sync.getMeta('deviceId', null);
    for (let guard = 0; guard < 200; guard++) {
      const pending = (await backend.sync.getPending(5000)).filter((e) => storeSet.has(e.store));
      if (!pending.length) return;

      // Text first, audio files last: a slow upload must not hold back your writing.
      pending.sort((a, b) => (a.store === 'audioBlobs') - (b.store === 'audioBlobs') || ms(a.modifiedAt) - ms(b.modifiedAt));
      const entries = [];
      const records = [];
      let chars = 0;
      for (const e of pending) {
        if (entries.length >= pushBatch) break;
        const isAudio = e.store === 'audioBlobs';
        if (isAudio && entries.length) break; // send the text first; each audio file goes in a request of its own
        let row;
        if (e.store === 'audioBlobs') {
          row = await audioRow(e, deviceId);
        } else {
          let rec = null;
          if (!e.deleted) rec = await backend.get(e.store, e.id);
          row = rec
            ? { store: e.store, id: e.id, data: rec, updated_at: rec.modifiedAt || e.modifiedAt, deleted: false, device_id: deviceId }
            : { store: e.store, id: e.id, data: null, updated_at: e.modifiedAt, deleted: true, device_id: deviceId };
        }
        const size = JSON.stringify(row).length;
        if (entries.length && chars + size > MAX_PUSH_CHARS) break;
        chars += size;
        entries.push(e);
        records.push(row);
        if (isAudio) break;
      }
      const { error } = await client.rpc('sync_push', { records });
      if (error) throw new Error(error.message || 'Could not upload changes');
      await backend.sync.ack(entries);
    }
  }

  // ---------- audio (Supabase Storage) ----------
  const audioPath = (id) => `${userId}/${id}`;
  const friendly = (e, fallback) => {
    const m = e?.message || fallback;
    return /size|quota|limit|exceed/i.test(m) ? `${m} (cloud audio storage may be full or the recording too big)` : m;
  };

  /** Uploads the audio file (or removes it when the note was deleted) and returns the table row. */
  async function audioRow(e, deviceId) {
    const bucket = client.storage.from(AUDIO_BUCKET);
    const path = audioPath(e.id);
    const rec = e.deleted ? null : await backend.get('audioBlobs', e.id);
    if (!rec) {
      const { error } = await bucket.remove([path]);
      if (error) throw new Error(friendly(error, 'Could not remove audio'));
      return { store: 'audioBlobs', id: e.id, data: null, updated_at: e.modifiedAt, deleted: true, device_id: deviceId };
    }
    if (rec.blob) {
      const { error } = await bucket.upload(path, rec.blob, { contentType: rec.mimeType || 'audio/webm', upsert: true });
      if (error) throw new Error(friendly(error, 'Could not upload audio'));
    }
    const { blob, remote, ...meta } = rec; // the Blob itself never goes into JSON
    return {
      store: 'audioBlobs', id: e.id,
      data: { ...meta, path, size: blob ? blob.size : (meta.size ?? null) },
      updated_at: rec.modifiedAt || e.modifiedAt, deleted: false, device_id: deviceId,
    };
  }

  /** Used by store.fetchAudio(): downloads one recording's file. */
  async function downloadAudio(rec) {
    const { data, error } = await client.storage.from(AUDIO_BUCKET).download(rec.path || audioPath(rec.id));
    if (error) throw new Error(friendly(error, 'Could not download audio'));
    return data;
  }

  // ---------- pull ----------
  // The copy's id is derived from the round + the losing version, so two devices that both
  // notice the same conflict write the SAME draft instead of two duplicates.
  async function saveConflictCopy({ text, battleId, roundId, version, which }) {
    if (!String(text ?? '').trim()) return;
    const t = new Date(now()).toISOString();
    await backend.batch([{
      op: 'put',
      store: 'drafts',
      value: {
        id: `conflict-${roundId}-${version || t}`,
        title: 'Conflict copy: older version of a round',
        content: text,
        category: 'Random Idea',
        status: 'In Progress',
        battleId: battleId ?? null,
        roundId: roundId ?? null,
        tags: ['conflict'],
        notes: `Saved automatically: two devices edited this round while apart. The newer edit was kept as the round text. This is the older text (${which}).`,
        createdAt: t,
        updatedAt: t,
      },
    }]);
  }

  async function pull() {
    const applied = new Set();
    const myDevice = await backend.sync.getMeta('deviceId', null);
    const cursor = await backend.sync.getMeta('pullCursor', null);
    const from = cursor ? new Date(Math.max(0, ms(cursor) - overlapMs)).toISOString() : null;
    let maxServer = cursor;
    let maxUpdated = null;

    for (let offset = 0; ; offset += pageSize) {
      let q = client.from('sync_records')
        .select('store,id,data,updated_at,deleted,server_updated_at')
        .eq('user_id', userId);
      if (from) q = q.gte('server_updated_at', from);
      const { data: rows, error } = await q
        .order('server_updated_at', { ascending: true })
        .order('store', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message || 'Could not download changes');

      const ops = [];
      for (const r of rows) {
        if (!maxServer || ms(r.server_updated_at) > ms(maxServer)) maxServer = r.server_updated_at;
        if (!maxUpdated || ms(r.updated_at) > ms(maxUpdated)) maxUpdated = r.updated_at;
        if (!storeSet.has(r.store)) continue;
        if (!r.deleted && (!r.data || r.data[KEY_PATHS[r.store]] !== r.id)) continue; // malformed row

        backend.sync.observe(r.updated_at); // keep our next stamps later than anything we have seen
        const local = await backend.get(r.store, r.id);
        const entry = await backend.sync.getEntry(r.store, r.id);
        const lt = local?.modifiedAt ?? null;
        const qt = entry?.modifiedAt ?? null;
        const localT = Math.max(lt ? ms(lt) : -Infinity, qt ? ms(qt) : -Infinity);
        const remoteT = ms(r.updated_at);

        // Two devices edited the same round's text without seeing each other? Decided by ancestry:
        // an edit that was built on the version we already have is a normal update, anything else is
        // a conflict, and then the loser's text is kept as a copy so nothing is ever lost.
        if (r.store === 'finalMaterials' && local && !r.deleted && (local.text ?? '') !== (r.data.text ?? '')) {
          if (remoteT > localT) {
            // The other device's edit will replace ours. Conflict if it was NOT built on our version
            // and our version was written on this device.
            if (local.modifiedBy && local.modifiedBy === myDevice && r.data.baseModifiedAt !== local.modifiedAt) {
              await saveConflictCopy({ text: local.text, battleId: local.battleId, roundId: local.roundId, version: local.modifiedAt, which: 'from this device' });
            }
          } else if (qt && r.data.modifiedBy !== myDevice && local.baseModifiedAt !== isoOf(r.updated_at)) {
            // Our unsynced edit is newer and was not built on theirs: ours wins, theirs is kept as a copy.
            await saveConflictCopy({ text: r.data.text, battleId: r.data.battleId, roundId: r.data.roundId, version: isoOf(r.updated_at), which: 'from your other device' });
          }
        }

        if (localT >= remoteT) continue; // our version is newer or identical: keep it (push handles the rest)

        if (r.deleted) {
          if (local || entry) ops.push({ op: 'delete', store: r.store, key: r.id, expectLocal: lt, expectQueue: qt });
        } else {
          const value = { ...r.data, modifiedAt: isoOf(r.updated_at) };
          if (r.store === 'audioBlobs') { value.blob = null; value.remote = true; } // file is downloaded when played
          ops.push({ op: 'put', store: r.store, value, expectLocal: lt, expectQueue: qt });
        }
        applied.add(r.store);
      }
      if (ops.length) await backend.sync.applyRemote(ops);
      if (rows.length < pageSize) break;
    }

    if (maxServer && maxServer !== cursor) await backend.sync.setMeta('pullCursor', maxServer);
    if (maxUpdated) {
      const prev = await backend.sync.getMeta('hlc', null);
      if (!prev || ms(maxUpdated) > ms(prev)) await backend.sync.setMeta('hlc', isoOf(maxUpdated));
    }
    return applied;
  }

  // ---------- one full cycle ----------
  async function cycle(force) {
    if (isDisabled()) return setStatus({ state: 'disabled', pending: await countPending() });
    if (!isOnline()) return setStatus({ state: 'offline', pending: await countPending() });
    if (!force && now() < nextTryAt) return undefined;
    setStatus({ state: 'syncing', error: null });
    try {
      // Pull FIRST: if the server holds another device's text that our upload is about to replace,
      // we must see it (and keep a copy) before the server's newest-wins rule overwrites it.
      const applied = await pull();
      await push();
      failures = 0;
      nextTryAt = 0;
      setStatus({ state: 'idle', pending: await countPending(), lastSyncedAt: new Date(now()).toISOString(), error: null });
      if (applied.size) appliedCbs.forEach((cb) => { try { cb(applied); } catch { /* ignore */ } });
    } catch (e) {
      failures += 1;
      nextTryAt = now() + Math.min(300_000, 5_000 * 2 ** (failures - 1));
      console.warn('[sync]', e?.message || e);
      setStatus({ state: 'error', pending: await countPending(), error: e?.message || String(e) });
    }
    return undefined;
  }

  function syncNow({ force = false } = {}) {
    if (!started) return Promise.resolve();
    if (running) { again = true; return running; }
    running = (async () => {
      try { do { again = false; await cycle(force); } while (again); } finally { running = null; }
    })();
    return running;
  }

  // Records created before sync existed have no stamp and no queue entry: queue them once.
  // Per store, so stores added later (voice notes in Stage 3) are also picked up on devices that
  // already ran this once for the earlier stores.
  async function backfill() {
    let done = await backend.sync.getMeta('backfilledStores', null);
    if (!done) done = (await backend.sync.getMeta('backfilled', false)) ? [...STAGE2_STORES] : [];
    for (const store of stores) {
      if (done.includes(store)) continue;
      const missing = (await backend.getAll(store)).filter((r) => !r.modifiedAt);
      const chunk = store === 'audioBlobs' ? 10 : 200; // audio records hold whole files
      for (let i = 0; i < missing.length; i += chunk) {
        await backend.batch(missing.slice(i, i + chunk).map((value) => ({ op: 'put', store, value })));
      }
      done = [...done, store];
      await backend.sync.setMeta('backfilledStores', done);
    }
  }

  function schedule() {
    countPending().then((pending) => setStatus({ pending })).catch(() => {});
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => syncNow(), debounceMs);
    debounceTimer.unref?.();
  }

  async function start() {
    if (started) return;
    if (typeof client?.rpc !== 'function' || typeof client?.from !== 'function') {
      return setStatus({ state: 'disabled' }); // e.g. a stub client in tests
    }
    started = true;
    const hlc = await backend.sync.getMeta('hlc', null);
    if (hlc) backend.sync.observe(hlc);
    await backfill();
    cleanups.push(backend.sync.onChange(schedule));
    if (typeof window !== 'undefined') {
      const onVisible = () => { if (document.visibilityState === 'visible') syncNow({ force: true }); };
      const onOnline = () => syncNow({ force: true });
      const onOffline = () => countPending().then((pending) => setStatus({ state: 'offline', pending })).catch(() => {});
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      cleanups.push(() => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      });
    }
    pollTimer = setInterval(() => syncNow(), pollMs);
    pollTimer.unref?.();
    return syncNow({ force: true });
  }

  function stop() {
    started = false;
    clearInterval(pollTimer);
    clearTimeout(debounceTimer);
    cleanups.splice(0).forEach((fn) => fn());
  }

  return {
    start,
    stop,
    syncNow,
    downloadAudio,
    getStatus: () => ({ ...status }),
    onStatus(cb) { statusCbs.add(cb); return () => statusCbs.delete(cb); },
    onApplied(cb) { appliedCbs.add(cb); return () => appliedCbs.delete(cb); },
  };
}
