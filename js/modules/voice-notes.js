import { h, toast, confirmDialog, formDialog, download } from '../core/ui.js';
import { backButton } from '../components/back-button.js';
import { formatDate } from '../core/util.js';
import * as store from '../core/store.js';
import { renderAudio, blobFor } from '../components/audio-player.js';
import { createVoiceRecorder } from '../components/voice-recorder.js';

export async function voiceNotesView(container, { battleId = null, roundId = null, isGlobalInbox = false } = {}) {
  let notes = await store.getVoiceNotes({ battleId, roundId, unassignedOnly: isGlobalInbox });

  const listEl = h('div', { class: 'stack' });

  async function reload() {
    notes = await store.getVoiceNotes({ battleId, roundId, unassignedOnly: isGlobalInbox });
    renderList();
  }

  // Shared recorder: recordings are saved to the same store the Voice Inbox reads
  const recorder = createVoiceRecorder({
    getContext: () => ({ battleId, roundId }),
    nextTitle: (time) => `Take ${notes.length + 1} (${time})`,
    onSaved: () => reload(),
  });

  async function renderVoiceCard(vn) {
    const audioRec = await store.getAudioBlob(vn.id);
    // Plays at once if recorded here; shows "Downloading audio…" first if it came from another device
    const audioEl = renderAudio(audioRec, vn.id, { style: 'width: 100%; margin-top: 8px;' });

    const durationSec = Math.round((vn.durationMs || 0) / 1000);
    const durStr = durationSec > 0 ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` : '0:00';

    return h('div', { class: 'card cassette-audio-card voice-note-card' },
      h('div', { class: 'cassette-header' },
        h('div', { class: 'grow' },
          h('div', { class: 'row', style: 'align-items: baseline; gap: 8px;' },
            h('span', { class: 'tag', style: 'font-size: 10px; background: rgba(196, 18, 18, 0.2); border-color: var(--red); color: var(--white);' }, 'AUDIO TAKE'),
            h('b', { class: 'cassette-title' }, vn.title),
            h('span', { class: 'tag', style: 'font-family: var(--font-write); font-size: 11px;' }, durStr)
          ),
          vn.description ? h('div', { class: 'small muted', style: 'margin-top: 2px;' }, vn.description) : null,
          h('div', { class: 'small faint', style: 'margin-top: 4px;' }, `Recorded ${formatDate(vn.recordedAt, true)}`)
        ),
        h('div', { class: 'row', style: 'gap: 6px;' },
          h('button', {
            class: 'ghost small-btn',
            onclick: async () => {
              const titleInput = h('input', { type: 'text', value: vn.title, 'aria-label': 'Title' });
              const descInput = h('input', { type: 'text', value: vn.description || '', 'aria-label': 'Description' });
              const ok = await formDialog({
                title: 'Rename Voice Note',
                confirmLabel: 'Save',
                body: h('div', { class: 'stack form' },
                  h('label', {}, 'Title', titleInput),
                  h('label', {}, 'Description / Note', descInput)),
              });
              if (ok) {
                await store.updateVoiceNote(vn.id, {
                  title: titleInput.value.trim() || vn.title,
                  description: descInput.value.trim(),
                });
                toast('Voice note updated');
                reload();
              }
            },
          }, 'Rename'),
          audioRec ? h('button', {
            class: 'ghost small-btn',
            title: 'Download audio file',
            onclick: async () => {
              try {
                const rec = await blobFor(audioRec, vn.id);
                const ext = (rec.mimeType || '').includes('wav') ? 'wav' : 'webm';
                download(`${vn.title}.${ext}`, rec.blob);
              } catch (e) { toast(e.message || 'Audio is not available yet', 'error'); }
            },
          }, 'Download') : null,
          h('button', {
            class: 'ghost danger small-btn',
            onclick: async () => {
              const ok = await confirmDialog({
                title: 'Delete Voice Note?',
                message: `Delete recording "${vn.title}"? This cannot be undone.`,
                danger: true,
                confirmLabel: 'Delete',
              });
              if (ok) {
                await store.deleteVoiceNote(vn.id);
                toast('Recording deleted');
                reload();
              }
            },
          }, 'Delete')
        )
      ),
      audioEl
    );
  }

  async function renderList() {
    if (!notes.length) {
      listEl.replaceChildren(
        h('div', { class: 'empty-state-wrap empty' },
          h('div', { class: 'empty-state-icon' }, '🎙️'),
          h('div', { class: 'empty-state-title' }, 'Tape Deck Empty'),
          h('div', { class: 'empty-state-desc' }, isGlobalInbox
            ? 'No unassigned audio takes recorded yet. Click "Record Mic" to capture your vocal flows.'
            : 'No flow takes recorded for this battle yet. Practice cadences and delivery.')
        )
      );
      return;
    }
    const cards = await Promise.all(notes.map(renderVoiceCard));
    listEl.replaceChildren(...cards);
  }

  container.replaceChildren(
    h('div', { class: 'voice-module stack' },
      isGlobalInbox && h('div', { class: 'page-head' },
        h('div', { class: 'page-head-main' }, backButton(), h('h1', {}, 'Voice Inbox'))),
      recorder.el,
      listEl)
  );

  renderList();
  return {
    destroy: () => {
      if (recorder.isRecording()) recorder.stop();
    },
  };
}
