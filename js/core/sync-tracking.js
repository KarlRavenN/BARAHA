// Change tracking for cloud sync (Stage 1: local foundations, no network).
//
// Wraps a storage backend so that EVERY write made through backend.batch():
//   1. stamps the record with `modifiedAt` (strictly increasing, ISO string)
//   2. records the change in the `syncQueue` store in the SAME atomic transaction,
//      so the data and its pending-sync entry can never disagree
//   3. turns deletes into tombstones in the queue (the record itself is removed locally)
//
// `modifiedAt` is deliberately NOT `updatedAt`: updatedAt drives the order of The Wall,
// so stamping it on every write (pin, drag...) would reshuffle the posters.
//
// Stage 2 (sync.js) uses the `sync` API: getPending / ack / applyRemote / meta.

/** Stores that are never synced as records. */
export const SYNC_EXCLUDED = new Set([
  'syncQueue', // the queue itself
  'syncMeta',  // per-device bookkeeping
  'audioBlobs', // Stage 3 (goes to Supabase Storage, not the JSON table)
  'settings',  // mixes per-device prefs and local migration flags; opt-in allowlist later
]);

export const isSyncable = (store) => !SYNC_EXCLUDED.has(store);
export const queueId = (store, id) => `${store}:${id}`;

/**
 * Stores whose records also carry `baseModifiedAt` (the version the edit was built on) and
 * `modifiedBy` (the device that wrote it). sync.js uses them to tell a normal update apart from
 * two devices editing the same text at the same time (then the older text is kept as a copy).
 */
const BASE_TRACKED = new Set(['finalMaterials']);

/** Timestamps further than this in the future (vs this device's clock) are not trusted by observe(). */
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/**
 * @param raw       a backend with get/getAll/getAllByIndex/batch/clearAll
 * @param keyPaths  { storeName: keyPath } for every data store
 * @param now       optional clock (ms) for tests
 */
export function withSyncTracking(raw, keyPaths, now = () => Date.now()) {
  let last = 0;
  const listeners = new Set(); // notified after a local write that queued something
  const notify = () => listeners.forEach((cb) => { try { cb(); } catch { /* listener errors must never break a save */ } });
  // Strictly increasing so two writes in the same millisecond still order correctly.
  const stamp = () => {
    let n = now();
    if (n <= last) n = last + 1;
    last = n;
    return new Date(n).toISOString();
  };
  const keyOf = (store, value) => value?.[keyPaths[store]];
  let deviceIdCache = null;
  const getDeviceId = async () => {
    if (deviceIdCache === null) deviceIdCache = (await raw.get('syncMeta', 'deviceId'))?.value ?? null;
    return deviceIdCache;
  };

  const change = (store, id, modifiedAt, deleted) =>
    ({ qid: queueId(store, id), store, id: String(id), modifiedAt, deleted });

  const sync = {
    /** Oldest pending changes first. */
    async getPending(limit = 200) {
      const all = await raw.getAll('syncQueue');
      return all.sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt)).slice(0, limit);
    },
    async pendingCount() { return (await raw.getAll('syncQueue')).length; },
    /**
     * Remove entries that were pushed successfully. An entry is only removed if it has NOT
     * changed since it was read, so an edit made while a push was in flight stays queued.
     */
    async ack(entries) {
      if (!entries.length) return;
      await raw.batch(entries.map((e) => (
        { op: 'delete', store: 'syncQueue', key: e.qid, ifModifiedAt: e.modifiedAt })));
    },
    /**
     * Write data that came FROM the cloud. Not stamped and not queued (no echo loop), and
     * any pending local change for the same records is dropped, because the caller (sync.js)
     * has already decided the remote version wins.
     * ops: [{op:'put', store, value} | {op:'delete', store, key}]
     *
     * Race-safe form (used by sync.js): add `expectLocal` (the local record's modifiedAt when it
     * was read, or null if it did not exist) and `expectQueue` (the queue entry's modifiedAt, or
     * null). The write is applied INSIDE the transaction only if the local record is still exactly
     * that version, so an edit made while a sync was running is never overwritten, and its queue
     * entry is kept. Ops without `expectLocal` are applied unconditionally.
     */
    async applyRemote(ops) {
      const out = [];
      for (const o of ops) {
        const { expectLocal, expectQueue, ...rest } = o;
        const conditional = expectLocal !== undefined;
        out.push(conditional ? { ...rest, ifModifiedAt: expectLocal } : rest);
        const id = rest.op === 'put' ? keyOf(rest.store, rest.value) : rest.key;
        if (isSyncable(rest.store) && id !== undefined) {
          const dropQueue = { op: 'delete', store: 'syncQueue', key: queueId(rest.store, id) };
          if (!conditional) out.push(dropQueue);
          else if (expectQueue != null) out.push({ ...dropQueue, ifModifiedAt: expectQueue });
        }
      }
      await raw.batch(out);
    },
    /** The pending queue entry for one record, or null. */
    async getEntry(store, id) {
      return (await raw.get('syncQueue', queueId(store, id))) || null;
    },
    /**
     * Make every FUTURE stamp later than a timestamp that was seen from another device.
     * Without this, a device whose clock runs slow would lose every conflict even though it
     * edited after seeing the other edit. Absurdly far-future stamps (broken clocks) are ignored.
     */
    observe(iso) {
      const ms = Date.parse(iso);
      if (!Number.isNaN(ms) && ms <= now() + MAX_FUTURE_MS && ms > last) last = ms;
    },
    /** Called after each local write that queued a change. Returns an unsubscribe function. */
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async getMeta(key, fallback = null) {
      const row = await raw.get('syncMeta', key);
      return row ? row.value : fallback;
    },
    setMeta: (key, value) => raw.batch([{ op: 'put', store: 'syncMeta', value: { key, value } }]),
  };

  return {
    ...raw,
    sync,
    /** ops: [{op:'put', store, value} | {op:'delete', store, key}], applied atomically. */
    async batch(ops) {
      if (!ops.length) return;
      const t = stamp();
      const out = [];
      const queued = new Map(); // one queue entry per record; the last operation wins
      for (const o of ops) {
        if (!isSyncable(o.store) || (o.op !== 'put' && o.op !== 'delete')) { out.push(o); continue; }
        if (o.op === 'put') {
          const id = keyOf(o.store, o.value);
          const value = { ...o.value, modifiedAt: t };
          if (BASE_TRACKED.has(o.store) && id !== undefined) {
            const prev = await raw.get(o.store, id);
            value.baseModifiedAt = prev?.modifiedAt ?? null;
            value.modifiedBy = await getDeviceId();
          }
          out.push({ ...o, value });
          if (id !== undefined) queued.set(queueId(o.store, id), change(o.store, id, t, false));
        } else {
          out.push(o);
          queued.set(queueId(o.store, o.key), change(o.store, o.key, t, true));
        }
      }
      for (const e of queued.values()) out.push({ op: 'put', store: 'syncQueue', value: e });
      await raw.batch(out);
      if (queued.size) notify();
    },
    /**
     * Wipe all data. Order matters: clear first, then queue tombstones. If we crash in
     * between, the cloud still has the data (safe) instead of local being "empty but
     * un-queued" (which would be a silent divergence).
     */
    async clearAll() {
      const t = stamp();
      const tombstones = [];
      for (const store of Object.keys(keyPaths)) {
        if (!isSyncable(store)) continue;
        for (const r of await raw.getAll(store)) {
          tombstones.push({ op: 'put', store: 'syncQueue', value: change(store, keyOf(store, r), t, true) });
        }
      }
      await raw.clearAll();
      if (tombstones.length) await raw.batch(tombstones);
      if (tombstones.length) notify();
    },
  };
}
