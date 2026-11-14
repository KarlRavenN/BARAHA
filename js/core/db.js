// Storage backend + versioned schema for BARAHA.
//
// The rest of the app never touches IndexedDB directly: it talks to a "backend"
// object with a small async interface (get / getAll / getAllByIndex / batch / clear).
// This keeps domain logic testable (see tests/memory-backend.js) and lets a future
// sync layer wrap or replace the backend without rebuilding the app.
//
// IMPORTANT: every write resolves only after the IndexedDB transaction has
// completed (tx.oncomplete), so the UI can truthfully show "Saved".

import { withSyncTracking } from './sync-tracking.js';

/** Legacy single database (before accounts). Kept only as the fallback when no user id is given. */
export const DB_NAME = 'baraha';

/** One local database per signed-in account, so two accounts in one browser never share data. */
export const dbNameFor = (userId) => (userId ? `baraha-${userId}` : DB_NAME);

/**
 * Store definitions. keyPath + secondary indexes.
 * Only battles, rounds, finalMaterials and settings are used by the UI in v1;
 * the other stores are created now so later phases need no migration for them.
 * See docs/DATABASE_DOCUMENTATION.md.
 */
export const STORES = {
  battles:        { keyPath: 'id', indexes: ['status', 'archived', 'opponentId'] },
  rounds:         { keyPath: 'id', indexes: ['battleId'] },
  finalMaterials: { keyPath: 'roundId', indexes: ['battleId'] },
  drafts:         { keyPath: 'id', indexes: ['battleId', 'roundId', 'category', 'status'] },
  schemes:        { keyPath: 'id', indexes: ['battleId', 'roundId', 'status'] },
  schemeDrafts:   { keyPath: 'id', indexes: ['schemeId', 'draftId'] },
  rhymes:         { keyPath: 'id', indexes: ['battleId', 'roundId'] },
  voiceNotes:     { keyPath: 'id', indexes: ['battleId', 'roundId', 'draftId', 'schemeId'] },
  audioBlobs:     { keyPath: 'id', indexes: ['voiceNoteId'] },
  opponents:      { keyPath: 'id', indexes: ['name'] },
  opponentNotes:  { keyPath: 'id', indexes: ['opponentId'] },
  referenceLines: { keyPath: 'id', indexes: [] },
  scans:          { keyPath: 'id', indexes: ['battleId', 'roundId'] },
  scanMatches:    { keyPath: 'id', indexes: ['scanId'] },
  settings:       { keyPath: 'key', indexes: [] },
  pronunciations: { keyPath: 'id', indexes: ['word'] },
  pinnedBars:     { keyPath: 'id', indexes: ['battleId', 'roundId'] },
};

/**
 * Sync bookkeeping stores (see sync-tracking.js). Kept out of STORES on purpose:
 * STORES is the list of user data, and the v1 migration loops over it.
 *   syncQueue: one entry per changed record (qid = "store:id") waiting to be pushed
 *   syncMeta:  per-device values (deviceId, lastPulledAt)
 */
export const SYNC_STORES = {
  syncQueue: { keyPath: 'qid', indexes: ['store'] },
  syncMeta:  { keyPath: 'key', indexes: [] },
};

/**
 * Migrations. MIGRATIONS[n-1] upgrades the database from version n-1 to n.
 * Never edit an existing migration after release; append a new one and bump
 * the array length (SCHEMA_VERSION follows automatically).
 */
export const MIGRATIONS = [
  // v1: initial schema
  (idb) => {
    for (const [name, def] of Object.entries(STORES)) {
      const store = idb.createObjectStore(name, { keyPath: def.keyPath });
      for (const index of def.indexes) store.createIndex(index, index, { unique: false });
    }
  },
  // v2: add custom pronunciations store
  (idb) => {
    if (!idb.objectStoreNames.contains('pronunciations')) {
      const store = idb.createObjectStore('pronunciations', { keyPath: 'id' });
      store.createIndex('word', 'word', { unique: false });
    }
  },
  // v3: add pinnedBars store
  (idb) => {
    if (!idb.objectStoreNames.contains('pinnedBars')) {
      const store = idb.createObjectStore('pinnedBars', { keyPath: 'id' });
      store.createIndex('battleId', 'battleId', { unique: false });
      store.createIndex('roundId', 'roundId', { unique: false });
    }
  },
  // v4: sync bookkeeping stores
  (idb) => {
    for (const [name, def] of Object.entries(SYNC_STORES)) {
      if (idb.objectStoreNames.contains(name)) continue;
      const store = idb.createObjectStore(name, { keyPath: def.keyPath });
      for (const index of def.indexes) store.createIndex(index, index, { unique: false });
    }
  },
];
export const SCHEMA_VERSION = MIGRATIONS.length;

function openIdb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, SCHEMA_VERSION);
    req.onupgradeneeded = (e) => {
      for (let v = e.oldVersion; v < e.newVersion; v++) MIGRATIONS[v](req.result, req.transaction);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked: close other BARAHA tabs and reload.'));
  });
}

const reqToPromise = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const txDone = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error || new Error('Transaction aborted'));
});

/** { storeName: keyPath } for every user-data store. */
export const KEY_PATHS = Object.fromEntries(Object.entries(STORES).map(([n, d]) => [n, d.keyPath]));

/**
 * Create the IndexedDB-backed backend for one account.
 * Every write through it is stamped and queued for sync (see sync-tracking.js).
 */
export async function createIndexedDbBackend(userId) {
  const backend = withSyncTracking(await createRawIndexedDbBackend(dbNameFor(userId)), KEY_PATHS);
  if (!(await backend.sync.getMeta('deviceId'))) {
    await backend.sync.setMeta('deviceId', crypto.randomUUID());
  }
  return backend;
}

async function createRawIndexedDbBackend(name) {
  const idb = await openIdb(name);
  return {
    kind: 'indexeddb',
    async get(store, key) {
      return reqToPromise(idb.transaction(store).objectStore(store).get(key));
    },
    async getAll(store) {
      return reqToPromise(idb.transaction(store).objectStore(store).getAll());
    },
    async getAllByIndex(store, index, value) {
      return reqToPromise(idb.transaction(store).objectStore(store).index(index).getAll(value));
    },
    /** ops: [{op:'put', store, value} | {op:'delete', store, key}] applied atomically. */
    async batch(ops) {
      const names = [...new Set(ops.map((o) => o.store))];
      if (!names.length) return;
      const tx = idb.transaction(names, 'readwrite');
      for (const o of ops) {
        const s = tx.objectStore(o.store);
        if (o.op === 'put') s.put(o.value);
        else if (o.op === 'delete' && o.ifModifiedAt !== undefined) {
          // conditional delete (used to ack pushed sync entries): only if unchanged
          const g = s.get(o.key);
          g.onsuccess = () => { if (g.result && g.result.modifiedAt === o.ifModifiedAt) s.delete(o.key); };
        } else if (o.op === 'delete') s.delete(o.key);
        else throw new Error(`Unknown op ${o.op}`);
      }
      await txDone(tx);
    },
    async clearAll() {
      const names = Object.keys(STORES);
      const tx = idb.transaction(names, 'readwrite');
      names.forEach((n) => tx.objectStore(n).clear());
      await txDone(tx);
    },
  };
}
