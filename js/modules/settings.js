import { h, toast, confirmDialog, download } from '../core/ui.js';
import * as store from '../core/store.js';
import { SCHEMA_VERSION } from '../core/db.js';

export async function settingsView(root) {
  let storage = 'Not available in this browser';
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      storage = `${(usage / 1048576).toFixed(2)} MB used of about ${(quota / 1048576).toFixed(0)} MB · persistent storage: ${persisted ? 'granted' : 'not granted'}`;
    }
  } catch { /* ignore */ }

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

  root.replaceChildren(h('div', { class: 'page stack' },
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', {}, 'Settings'),
        h('p', { class: 'small muted' }, 'Configure workspace appearance, shortcuts, offline storage, and data backup.')
      )
    ),

    // 1. Appearance Section
    h('section', { class: 'settings-section' },
      h('div', { class: 'section-title' }, '1. Appearance & Theme'),
      h('div', { class: 'card', style: 'padding: 16px 20px;' },
        h('div', { class: 'row', style: 'justify-content: space-between; align-items:center;' },
          h('div', {},
            h('b', {}, 'Underground Hip-Hop Studio (V3 Edition)'),
            h('p', { class: 'small muted', style: 'margin: 4px 0 0;' }, 'Authentic concrete & poster texture, spray accents, and distressed battle flyer aesthetic.')
          ),
          h('span', { class: 'tag red' }, 'Active')
        )
      )
    ),

    // 2. Editor & Shortcuts Section
    h('section', { class: 'settings-section' },
      h('div', { class: 'section-title' }, '2. Editor & Shortcuts'),
      h('div', { class: 'card', style: 'padding: 16px 20px;' },
        h('div', { class: 'stack', style: 'gap: 8px;' },
          h('div', { class: 'row', style: 'justify-content: space-between;' },
            h('span', { class: 'small muted' }, 'Global Search Quick Open:'),
            h('span', { class: 'tag' }, 'Ctrl + /')
          ),
          h('div', { class: 'row', style: 'justify-content: space-between;' },
            h('span', { class: 'small muted' }, 'Highlight Selected Bar:'),
            h('span', { class: 'tag' }, 'Ctrl + H')
          ),
          h('div', { class: 'row', style: 'justify-content: space-between;' },
            h('span', { class: 'small muted' }, 'Focus Rhyme Bank Search:'),
            h('span', { class: 'tag' }, 'Ctrl + Shift + R')
          ),
          h('div', { class: 'row', style: 'justify-content: space-between;' },
            h('span', { class: 'small muted' }, 'Toggle Distraction-Free Focus:'),
            h('span', { class: 'tag' }, 'Alt + F  (Esc to exit)')
          )
        )
      )
    ),

    // 3. Storage Section
    h('section', { class: 'settings-section' },
      h('div', { class: 'section-title' }, '3. Storage & Offline Persistence'),
      h('div', { class: 'card', style: 'padding: 16px 20px;' },
        h('b', {}, 'Local Browser Database (IndexedDB)'),
        h('p', { class: 'muted small', style: 'margin: 6px 0 0;' }, storage),
        h('p', { class: 'small faint', style: 'margin: 4px 0 0;' }, 'All data, rhymes, drafts, and recordings remain 100% on your machine. Zero external API leaks.')
      )
    ),

    // 4. Backup and Restore Section
    h('section', { class: 'settings-section' },
      h('div', { class: 'section-title' }, '4. Backup and Restore'),
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
          fileInput
        )
      )
    ),

    // 5. About Section
    h('section', { class: 'settings-section' },
      h('div', { class: 'section-title' }, '5. About BARAHA'),
      h('div', { class: 'card', style: 'padding: 16px 20px;' },
        h('div', { class: 'row', style: 'gap: 8px; align-items: baseline;' },
          h('h3', { style: 'margin: 0; font-family: var(--font-display); font-size: 20px;' }, 'BARAHA V3'),
          h('span', { class: 'tag red' }, 'Underground Battle Rap Edition')
        ),
        h('p', { class: 'small muted', style: 'margin: 6px 0 0;' }, 'Engineered specifically for battle rap preparation, rhyme scheme structuring, opponent research, and live cadence recording.'),
        h('p', { class: 'small faint', style: 'margin: 4px 0 0;' }, `Database schema v${SCHEMA_VERSION} · FlipTop / KOTD / URL Inspired Workspace · 100% Offline`)
      )
    )
  ));
}
