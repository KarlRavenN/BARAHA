import { h } from '../core/ui.js';
import * as store from '../core/store.js';

/**
 * Audio player for a voice note.
 * - Recorded on this device: the player appears immediately.
 * - Recorded on another device (synced from the cloud): shows "Downloading audio…" while the file is
 *   fetched in the background, then the player. If it fails (offline), a Retry button is shown.
 *
 * @param audioRec   record from store.getAudioBlob(voiceNoteId), or null
 * @param voiceNoteId id of the voice note
 * @param style      inline style for the <audio> element
 * @param onUrl      called with each object URL created, so the caller can revoke it later
 * @returns an element, or null when the note has no audio at all
 */
export function renderAudio(audioRec, voiceNoteId, { style = '', onUrl = null } = {}) {
  const player = (blob) => {
    const url = URL.createObjectURL(blob);
    if (onUrl) onUrl(url);
    return h('audio', { controls: true, src: url, preload: 'metadata', style });
  };
  if (!audioRec) return null;
  if (audioRec.blob) return player(audioRec.blob);

  const box = h('div', { class: 'audio-loading small muted', role: 'status', style: 'margin-top: 6px;' }, 'Downloading audio…');
  async function load() {
    box.replaceChildren('Downloading audio…');
    try {
      const rec = await store.fetchAudio(voiceNoteId);
      if (!rec || !rec.blob) throw new Error('missing');
      box.replaceChildren(player(rec.blob));
    } catch {
      box.replaceChildren(
        'Audio is not on this device yet. ',
        h('button', { class: 'ghost-mini', type: 'button', onclick: load }, 'Retry'));
    }
  }
  load();
  return box;
}

/** Download-to-file helper that works for recordings that are still in the cloud. */
export async function blobFor(audioRec, voiceNoteId) {
  if (audioRec?.blob) return audioRec;
  return store.fetchAudio(voiceNoteId);
}
