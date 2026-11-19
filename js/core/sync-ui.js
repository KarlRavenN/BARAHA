// Small helpers so pages (Settings, Profile, account menu) can show sync status and ask for a sync
// without knowing about the sync engine. main.js owns the engine and publishes status/events.

export const getSyncStatus = () => window.__barahaSyncStatus || null;

/** Calls cb(status) now and on every change. Returns an unsubscribe function. */
export function watchSyncStatus(cb) {
  const on = (e) => cb(e.detail);
  document.addEventListener('baraha:sync-status', on);
  const s = getSyncStatus();
  if (s) cb(s);
  return () => document.removeEventListener('baraha:sync-status', on);
}

/** Ask the engine to sync now. Resolves when that sync cycle is finished (or at once if sync is not running). */
export async function requestSync() {
  const detail = { promise: null };
  window.dispatchEvent(new CustomEvent('baraha:sync-now', { detail }));
  try { await detail.promise; } catch { /* the status object carries the error */ }
  return getSyncStatus();
}

/** Friendly "5 min ago" style text. */
export function timeAgoText(iso) {
  if (!iso) return 'not yet';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const SYNC_LABELS = {
  idle: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline (changes are saved on this device)',
  error: 'Problem syncing (will retry)',
  disabled: 'Sync is off on this device',
};
