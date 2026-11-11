// In-memory backend with the same interface as the IndexedDB backend (js/core/db.js).
// Used ONLY by tests. Batches are atomic: if any op throws, nothing is applied.
import { STORES } from '../js/core/db.js';

export function createMemoryBackend() {
  const data = Object.fromEntries(Object.keys(STORES).map((n) => [n, new Map()]));
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
          if (o.op === 'put') data[o.store].set(o.value[STORES[o.store].keyPath], clone(o.value));
          else if (o.op === 'delete') data[o.store].delete(o.key);
          else throw new Error(`Unknown op ${o.op}`);
        }
      } catch (e) {
        for (const n of Object.keys(data)) data[n] = snapshot.get(n);
        throw e;
      }
    },
    async clearAll() { Object.values(data).forEach((m) => m.clear()); },
  };
}
