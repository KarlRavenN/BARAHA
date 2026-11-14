// In-memory backend with the same interface as the IndexedDB backend (js/core/db.js).
// Used ONLY by tests. Batches are atomic: if any op throws, nothing is applied.
import { STORES, SYNC_STORES, KEY_PATHS } from '../js/core/db.js';
import { withSyncTracking } from '../js/core/sync-tracking.js';

const ALL_STORES = { ...STORES, ...SYNC_STORES };

/**
 * By default the backend is wrapped with sync tracking, exactly like production, so every
 * existing test also exercises stamping + queueing. Pass { track: false } for the raw one.
 */
export function createMemoryBackend({ track = true, now } = {}) {
  const raw = createRawMemoryBackend();
  return track ? withSyncTracking(raw, KEY_PATHS, now) : raw;
}

function createRawMemoryBackend() {
  const data = Object.fromEntries(Object.keys(ALL_STORES).map((n) => [n, new Map()]));
  const clone = (v) => (v === undefined ? v : structuredClone(v));
  return {
    kind: 'memory',
    async get(store, key) { return clone(data[store].get(key)); },
    async getAll(store) { return [...data[store].values()].map(clone); },
    async getAllByIndex(store, index, value) {
      return [...data[store].values()].filter((r) => r[index] === value).map(clone);
    },
    async batch(ops) {
      const snapshot = new Map(Object.keys(data).map((n) => [n, new Map(data[n])]));
      try {
        for (const o of ops) {
          if (!data[o.store]) throw new Error(`No such store ${o.store}`);
          if (o.op === 'put') data[o.store].set(o.value[ALL_STORES[o.store].keyPath], clone(o.value));
          else if (o.op === 'delete') {
            const cur = data[o.store].get(o.key);
            if (o.ifModifiedAt === undefined || (cur && cur.modifiedAt === o.ifModifiedAt)) data[o.store].delete(o.key);
          }
          else throw new Error(`Unknown op ${o.op}`);
        }
      } catch (e) {
        for (const n of Object.keys(data)) data[n] = snapshot.get(n);
        throw e;
      }
    },
    async clearAll() { Object.keys(STORES).forEach((n) => data[n].clear()); }, // like production: sync stores survive
  };
}
