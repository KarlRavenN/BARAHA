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
 * @param raw       a backend with get/getAll/getAllByIndex/batch/clearAll
 * @param keyPaths  { storeName: keyPath } for every data store
 * @param now       optional clock (ms) for tests
 */
export function withSyncTracking(raw, keyPaths, now = () => Date.now()) {
  let last = 0;
  // Strictly increasing so two writes in the same millisecond still order correctly.
  const stamp = () => {
    let n = now();
    if (n <= last) n = last + 1;
    last = n;
    return new Date(n).toISOString();
  };
  const keyOf = (store, value) => value?.[keyPaths[store]];

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
     */
    async applyRemote(ops) {
      const out = [];
      for (const o of ops) {
        out.push(o);
        const id = o.op === 'put' ? keyOf(o.store, o.value) : o.key;
        if (isSyncable(o.store) && id !== undefined) {
          out.push({ op: 'delete', store: 'syncQueue', key: queueId(o.store, id) });
        }
      }
      await raw.batch(out);
    },
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
          out.push({ ...o, value: { ...o.value, modifiedAt: t } });
          if (id !== undefined) queued.set(queueId(o.store, id), change(o.store, id, t, false));
        } else {
          out.push(o);
          queued.set(queueId(o.store, o.key), change(o.store, o.key, t, true));
        }
      }
      for (const e of queued.values()) out.push({ op: 'put', store: 'syncQueue', value: e });
      return raw.batch(out);
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
    },
  };
}
