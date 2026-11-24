import { h, toast, confirmDialog, formDialog, download, skeleton } from '../core/ui.js';
import { go } from '../core/router.js';
import { backButton } from '../components/back-button.js';
import { createVoiceRecorder } from '../components/voice-recorder.js';
import { voicePlayer } from '../components/voice-player.js';
import { blobFor } from '../components/audio-player.js';
import { formatDate } from '../core/util.js';
import { decorate, filterAndSort, formatDuration, SORTS, NO_BATTLE } from '../core/voice-library.js';
import * as store from '../core/store.js';

/**
 * Voice Inbox — every recording in one place.
 * It reads the same `voiceNotes` store the per-battle Voice Notes tab writes to, so
 * recordings appear here automatically and deleting here removes the original.
 */
export async function voiceInboxView(container) {
  let all = [];            // decorated notes
  let battles = [];
  const state = { query: '', sort: 'newest' };
  const players = [];      // live players, destroyed on re-render / leave

  const listEl = h('div', { class: 'stack voice-inbox-list' }, skeleton(3, 'skeleton-card'));
  const countEl = h('span', { class: 'small muted' });

  const recorder = createVoiceRecorder({
    getContext: () => ({ battleId: null, roundId: null }),
    nextTitle: (time) => `Voice memo ${all.length + 1} (${time})`,
    onSaved: () => reload(),
  });

  const searchInput = h('input', {
    type: 'search', placeholder: 'Search by name or battle…', 'aria-label': 'Search recordings',
    oninput: (e) => { state.query = e.target.value; renderList(); },
  });
  const sortSelect = h('select', {
    'aria-label': 'Sort recordings',
    onchange: (e) => { state.sort = e.target.value; renderList(); },
  }, Object.entries(SORTS).map(([k, s]) => h('option', { value: k }, s.label)));

  async function reload() {
    [battles, all] = [await store.listBattles(), null];
    all = decorate(await store.getVoiceNotes(), battles);
    renderList();
  }

  function destroyPlayers() { players.splice(0).forEach((p) => p.destroy()); }

  async function renameNote(vn) {
    const titleInput = h('input', { type: 'text', value: vn.title, 'aria-label': 'Name' });
    const battleSel = h('select', { 'aria-label': 'Battle' },
      h('option', { value: '' }, NO_BATTLE),
      battles.map((b) => h('option', { value: b.id, selected: b.id === vn.battleId }, b.title || 'Untitled battle')));
    const ok = await formDialog({
      title: 'Rename Recording', confirmLabel: 'Save',
      body: h('div', { class: 'stack form' },
        h('label', {}, 'Name', titleInput),
        h('label', {}, 'Battle', battleSel)),
    });
    if (!ok) return;
    const fields = { title: titleInput.value.trim() || vn.title };
    const newBattle = battleSel.value || null;
    if (newBattle !== (vn.battleId || null)) { fields.battleId = newBattle; fields.roundId = null; }
    await store.updateVoiceNote(vn.id, fields);
    toast('Recording updated');
    reload();
  }

  async function deleteNote(vn) {
    const ok = await confirmDialog({
      title: 'Delete recording?',
      message: `Delete "${vn.title}"? The original recording is removed too. This cannot be undone.`,
      danger: true, confirmLabel: 'Delete',
    });
    if (!ok) return;
    await store.deleteVoiceNote(vn.id);
    toast('Recording deleted');
    reload();
  }

  async function downloadNote(vn, audioRec) {
    try {
      const rec = await blobFor(audioRec, vn.id);
      const ext = (rec.mimeType || '').includes('wav') ? 'wav' : 'webm';
      download(`${vn.title}.${ext}`, rec.blob);
    } catch (e) { toast(e.message || 'Audio is not available yet', 'error'); }
  }

  async function card(vn) {
    const audioRec = await store.getAudioBlob(vn.id);
    const player = voicePlayer({ audioRec, voiceNoteId: vn.id, durationMs: vn.durationMs });
    players.push(player);
    const battleLabel = vn.battleId
      ? h('a', { href: `#/battle/${vn.battleId}`, class: 'vi-battle', title: 'Open battle' }, vn.battleName)
      : h('span', { class: 'vi-battle muted' }, vn.battleName);
    return h('div', { class: 'card cassette-audio-card voice-note-card voice-inbox-card', 'data-id': vn.id },
      h('div', { class: 'cassette-header' },
        h('div', { class: 'grow' },
          h('div', { class: 'row', style: 'align-items: baseline; gap: 8px; flex-wrap: wrap;' },
            h('b', { class: 'cassette-title' }, vn.title),
            h('span', { class: 'tag', style: 'font-family: var(--font-write); font-size: 11px;' }, formatDuration(vn.durationMs))),
          h('div', { class: 'small faint', style: 'margin-top: 4px;' },
            `${formatDate(vn.recordedAt, true)} · `, battleLabel)),
        h('div', { class: 'row', style: 'gap: 6px; flex-wrap: wrap;' },
          h('button', { class: 'ghost small-btn', type: 'button', onclick: () => renameNote(vn) }, 'Rename'),
          audioRec ? h('button', { class: 'ghost small-btn', type: 'button', title: 'Download audio file', onclick: () => downloadNote(vn, audioRec) }, 'Download') : null,
          h('button', { class: 'ghost danger small-btn', type: 'button', onclick: () => deleteNote(vn) }, 'Delete'))),
      audioRec ? player.el : h('div', { class: 'small muted' }, 'No audio attached.'));
  }

  async function renderList() {
    if (!all) return;
    destroyPlayers();
    const rows = filterAndSort(all, state);
    countEl.textContent = all.length ? `${rows.length} of ${all.length}` : '';
    if (!all.length) {
      listEl.replaceChildren(h('div', { class: 'empty-state-wrap empty fade-in' },
        h('div', { class: 'empty-state-icon' }, '🎙️'),
        h('div', { class: 'empty-state-title' }, 'No voice recordings yet.'),
        h('button', { class: 'primary', type: 'button', onclick: () => recorder.start() }, 'Record your first voice memo')));
      return;
    }
    if (!rows.length) {
      listEl.replaceChildren(h('div', { class: 'empty-state-wrap empty fade-in' },
        h('div', { class: 'empty-state-title' }, 'No recordings match your search.')));
      return;
    }
    const cards = await Promise.all(rows.map(card));
    listEl.replaceChildren(...cards);
    cards.forEach((c) => c.classList.add('fade-in'));
  }

  container.replaceChildren(
    h('div', { class: 'voice-module stack' },
      h('div', { class: 'page-head' },
        h('div', { class: 'page-head-main' }, backButton(), h('h1', {}, 'Voice Inbox'))),
      recorder.el,
      h('div', { class: 'voice-inbox-toolbar row' }, searchInput, sortSelect, countEl),
      listEl));

  await reload();
  return {
    destroy: () => { if (recorder.isRecording()) recorder.stop(); destroyPlayers(); },
  };
}
