import { h } from '../core/ui.js';
import { blobFor } from './audio-player.js';
import { formatDuration } from '../core/voice-library.js';

let nowPlaying = null; // only one recording plays at a time

/**
 * Custom Play / Pause / Stop player with a seek bar. The audio is resolved
 * lazily (so cloud-only recordings download on first Play).
 * @returns {{ el: HTMLElement, destroy: () => void }}
 */
export function voicePlayer({ audioRec, voiceNoteId, durationMs = 0 }) {
  let audio = null;
  let url = null;
  let loading = false;

  const playBtn = h('button', { type: 'button', class: 'ghost small-btn vp-play', 'aria-label': 'Play' }, 'Play');
  const stopBtn = h('button', { type: 'button', class: 'ghost small-btn vp-stop', 'aria-label': 'Stop', disabled: true }, 'Stop');
  const seek = h('input', { type: 'range', class: 'vp-seek', min: 0, max: 1000, value: 0, step: 1, 'aria-label': 'Seek', disabled: true });
  const timeEl = h('span', { class: 'vp-time small muted' }, `0:00 / ${formatDuration(durationMs)}`);
  const msgEl = h('span', { class: 'small muted vp-msg' });

  const paintTime = () => {
    const total = audio && isFinite(audio.duration) ? audio.duration * 1000 : durationMs;
    const cur = audio ? audio.currentTime * 1000 : 0;
    timeEl.textContent = `${formatDuration(cur)} / ${formatDuration(total)}`;
    if (total > 0) seek.value = String(Math.min(1000, Math.round((cur / total) * 1000)));
  };
  const setPlaying = (on) => {
    playBtn.textContent = on ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    playBtn.classList.toggle('is-playing', on);
  };
  const reset = () => { if (audio) { audio.pause(); audio.currentTime = 0; } setPlaying(false); stopBtn.disabled = true; paintTime(); };

  async function ensureAudio() {
    if (audio) return true;
    loading = true; msgEl.textContent = 'Loading audio…';
    try {
      const rec = await blobFor(audioRec, voiceNoteId);
      if (!rec?.blob) throw new Error('missing');
      url = URL.createObjectURL(rec.blob);
      audio = new Audio(url);
      audio.preload = 'metadata';
      audio.addEventListener('timeupdate', paintTime);
      audio.addEventListener('loadedmetadata', paintTime);
      audio.addEventListener('ended', () => { setPlaying(false); stopBtn.disabled = true; audio.currentTime = 0; paintTime(); });
      seek.disabled = false;
      msgEl.textContent = '';
      return true;
    } catch {
      msgEl.textContent = 'Audio is not on this device yet. Try again when online.';
      return false;
    } finally { loading = false; }
  }

  playBtn.onclick = async () => {
    if (loading) return;
    if (audio && !audio.paused) { audio.pause(); setPlaying(false); return; }
    if (!(await ensureAudio())) return;
    if (nowPlaying && nowPlaying !== api) nowPlaying.stop();
    nowPlaying = api;
    try { await audio.play(); setPlaying(true); stopBtn.disabled = false; } catch { msgEl.textContent = 'Could not play this recording.'; }
  };
  stopBtn.onclick = () => reset();
  seek.oninput = () => {
    if (!audio || !isFinite(audio.duration)) return;
    audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
    paintTime();
  };

  const api = {
    el: h('div', { class: 'voice-player row' }, playBtn, stopBtn, seek, timeEl, msgEl),
    stop: reset,
    destroy() {
      if (audio) { audio.pause(); audio.src = ''; audio = null; }
      if (url) { URL.revokeObjectURL(url); url = null; }
      if (nowPlaying === api) nowPlaying = null;
    },
  };
  return api;
}
