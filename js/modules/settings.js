import { h, toast, confirmDialog, download } from '../core/ui.js';
import { backButton } from '../components/back-button.js';
import * as store from '../core/store.js';
import { watchSyncStatus, requestSync, SYNC_LABELS, timeAgoText } from '../core/sync-ui.js';

async function storageLine() {
  try {
    if (!navigator.storage?.estimate) return 'Not available in this browser';
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return `${(usage / 1048576).toFixed(2)} MB used of about ${(quota / 1048576).toFixed(0)} MB · persistent storage: ${persisted ? 'granted' : 'not granted'}`;
  } catch { return 'Not available in this browser'; }
}

function shortcutsDialog() {
  const rows = [
    ['Global search', 'Ctrl + /'],
    ['Highlight selected text', 'Ctrl + H'],
    ['Focus Rhyme Bank search', 'Ctrl + Shift + R'],
    ['Focus mode (Esc to exit)', 'Alt + F'],
    ['Find in this round', 'Ctrl + F'],
    ['Undo / Redo', 'Ctrl + Z / Ctrl + Y'],
    ['Select several pieces of text (desktop)', 'Ctrl + click and drag'],
  ];
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey, true); trigger?.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const closeBtn = h('button', { type: 'button', class: 'primary', onclick: close }, 'Close');
  const scrim = h('div', { class: 'scrim', onmousedown: (e) => { if (e.target === scrim) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts' },
      h('h2', {}, 'Keyboard shortcuts'),
      h('div', { class: 'shortcut-list' }, ...rows.map(([what, keys]) =>
        h('div', {}, h('span', { class: 'small muted' }, what), h('span', { class: 'tag' }, keys)))),
      h('div', { class: 'actions' }, closeBtn)));
  const trigger = document.activeElement;
  (document.getElementById('overlay') || document.body).append(scrim);
  document.addEventListener('keydown', onKey, true);
  closeBtn.focus();
}

export async function settingsView(root) {
  let storage = await storageLine();

  const fileInput = h('input', {
    type: 'file',
    accept: '.zip,.json,application/zip,application/json',
    style: 'display:none',
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;

      let parsed;
      let isZip = file.name.endsWith('.zip') || file.type.includes('zip');
      let unzippedFiles = null;

      try {
        if (isZip) {
          const { readZip } = await import('../core/zip.js');
          unzippedFiles = await readZip(file);
          const jsonFile = unzippedFiles.find((f) => f.name === 'backup.json');
          if (!jsonFile) {
            toast('Backup rejected: ZIP is missing backup.json', 'error');
            return;
          }
          parsed = JSON.parse(jsonFile.text());
        } else {
          parsed = JSON.parse(await file.text());
        }
      } catch {
        toast('Backup rejected: Not a valid JSON or ZIP backup file.', 'error');
        return;
      }

      const v = store.validateBackup(parsed);
      if (!v.ok) {
        toast(`Backup rejected: ${v.errors[0]}`, 'error');
        return;
      }

      const ok = await confirmDialog({
        title: 'Restore this backup?',
        danger: true,
        confirmLabel: 'Replace my data',
        message: `This will REPLACE all current BARAHA data with the contents of ${file.name} (${v.counts.battles || 0} battles). Export a backup of your current work first if you might need it.`,
      });
      if (!ok) return;

      try {
        const counts = await store.restoreBackupFromFile(file);
        toast(`Backup restored (${counts.battles || 0} battles)`);
        location.hash = '#/';
        location.reload();
      } catch (err) {
        toast(`Restore failed: ${err.message}`, 'error');
      }
    },
  });

  const englishToggle = h('input', {
    type: 'checkbox', role: 'switch', id: 'englishRhymesSwitch',
    'aria-label': 'English rhyme suggestions (online)',
    onchange: async (e) => {
      await store.setEnglishRhymesEnabled(e.target.checked);
      toast(e.target.checked ? 'English rhyme suggestions on' : 'English rhyme suggestions off');
    },
  });
  englishToggle.checked = await store.getEnglishRhymesEnabled();

  // ---- Storage ----
  const storageText = h('p', { class: 'muted small', style: 'margin: 6px 0 0;' }, storage);
  const persistBtn = h('button', {
    type: 'button', class: 'ghost',
    onclick: async () => {
      if (!navigator.storage?.persist) { toast('This browser cannot do persistent storage.', 'error'); return; }
      try {
        const granted = await navigator.storage.persist();
        toast(granted ? 'Persistent storage granted' : 'The browser did not grant persistent storage', granted ? 'info' : 'error');
      } catch { toast('Could not ask for persistent storage', 'error'); }
      storageText.textContent = await storageLine();
    },
  }, 'Request persistent storage');

  // ---- Cloud sync ----
  const syncDot = h('span', { class: 'sync-dot', 'aria-hidden': 'true' });
  const syncState = h('span', {}, 'Starting…');
  const syncLast = h('dd', {}, 'not yet');
  const syncPending = h('dd', {}, '0');
  const syncMsg = h('p', { class: 'small faint', style: 'margin: 0 0 10px;' });
  const syncBtn = h('button', {
    type: 'button', class: 'primary',
    onclick: async () => {
      syncBtn.disabled = true;
      await requestSync();
      syncBtn.disabled = false;
    },
  }, 'Sync now');
  function paintSync(st) {
    if (!st) return;
    syncDot.dataset.state = st.state;
    syncState.textContent = SYNC_LABELS[st.state] || st.state;
    syncLast.textContent = st.lastSyncedAt ? timeAgoText(st.lastSyncedAt) : 'not yet';
    syncPending.textContent = String(st.pending || 0);
    syncMsg.textContent = st.state === 'error' && st.error ? `Last problem: ${st.error}` : '';
    syncBtn.disabled = st.state === 'syncing';
  }
  const stopWatching = watchSyncStatus(paintSync);

  const helpBtn = h('button', {
    type: 'button', class: 'ghost help-btn', title: 'Keyboard shortcuts', 'aria-label': 'Keyboard shortcuts',
    onclick: shortcutsDialog,
  }, '?');

  root.replaceChildren(h('div', { class: 'page stack' },
    h('div', { class: 'page-head' },
      h('div', { class: 'settings-head', style: 'width:100%' },
        h('div', {},
          h('div', { class: 'page-head-main' }, backButton(), h('h1', {}, 'Settings')),
          h('p', { class: 'small muted' }, 'Rhyme engine, storage, cloud sync, and backup.')),
        helpBtn)),

    h('section', { class: 'settings-section' },
      h('div', { class: 'section-title' }, 'Rhyme Engine'),
      h('div', { class: 'card', style: 'padding: 16px 20px;' },
        h('div', { class: 'setting-row' },
          h('div', { class: 'setting-text' },
            h('label', { for: 'englishRhymesSwitch', style: 'color: var(--text); font-weight: 700; font-size: var(--fs-base); margin: 0;' }, 'English rhyme suggestions (online)'),
            h('p', { class: 'small muted', style: 'margin: 4px 0 0;' }, 'Adds a bigger English pool using the free Datamuse API (the data behind RhymeZone). Off by default. When on, only the single English word you search is sent, never your bars. Results are cached on this device. Filipino and Taglish always stay 100% offline.')),
          h('span', { class: 'switch' }, englishToggle, h('span', { class: 'track', 'aria-hidden': 'true' }))))),

    h('section', { class: 'settings-section' },
      h('div', { class: 'section-title' }, 'Storage'),
      h('div', { class: 'card', style: 'padding: 16px 20px;' },
        h('b', {}, 'Local Browser Database (IndexedDB)'),
        storageText,
        h('p', { class: 'small faint', style: 'margin: 4px 0 12px;' }, 'Your work is saved on this device first. Persistent storage asks the browser not to clear it when space runs low.'),
        persistBtn)),

    h('section', { class: 'settings-section' },
      h('div', { class: 'section-title' }, 'Cloud sync'),
      h('div', { class: 'card', style: 'padding: 16px 20px;' },
        h('dl', { class: 'sync-grid' },
          h('dt', {}, 'Status'), h('dd', {}, syncDot, syncState),
          h('dt', {}, 'Last synced'), syncLast,
          h('dt', {}, 'Waiting to upload'), syncPending),
        syncMsg,
        syncBtn)),

    h('section', { class: 'settings-section' },
      h('div', { class: 'section-title' }, 'Backup and Restore'),
      h('div', { class: 'card', style: 'padding: 16px 20px;' },
        h('p', { class: 'small muted', style: 'margin-bottom: 14px;' }, 'Export your entire workspace including all 3-round battle material, drafts, schemes, saved rhymes, and voice takes:'),
        h('div', { class: 'row', style: 'gap: 10px;' },
          h('button', {
            class: 'primary',
            onclick: async () => {
              try {
                const zipBlob = await store.exportZipBackup();
                download(`baraha-backup-full-${new Date().toISOString().slice(0, 10)}.zip`, zipBlob);
                toast('Full ZIP backup downloaded (includes audio)');
              } catch (e) {
                toast(`Backup failed: ${e.message}`, 'error');
              }
            },
          }, 'Export Full Backup (ZIP + Audio)'),
          h('button', {
            class: 'ghost',
            onclick: async () => {
              try {
                const b = await store.exportAll();
                download(`baraha-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 2));
                toast('JSON backup downloaded');
              } catch (e) {
                toast(`Backup failed: ${e.message}`, 'error');
              }
            },
          }, 'Export JSON Only'),
          h('button', {
            class: 'ghost',
            onclick: () => fileInput.click(),
          }, 'Restore from Backup (ZIP or JSON)…'),
          fileInput)))
  ));

  return { destroy: stopWatching };
}
