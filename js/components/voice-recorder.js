import { h, toast } from '../core/ui.js';
import * as store from '../core/store.js';

/**
 * Mic recorder + audio-file import panel. Shared by the per-battle Voice Notes
 * tab and the global Voice Inbox, so every recording goes through the same
 * `store.createVoiceNote` path and lands in the one voiceNotes store.
 *
 * @param {object}   opts
 * @param {()=>{battleId?:string|null, roundId?:string|null}} [opts.getContext]  where new recordings attach
 * @param {()=>string} [opts.nextTitle]  default title for a new take
 * @param {(vn:object)=>void} [opts.onSaved]  called after a recording/import is stored
 * @returns {{ el: HTMLElement, stop: () => void, isRecording: () => boolean, start: () => void }}
 */
export function createVoiceRecorder({ getContext = () => ({}), nextTitle = null, onSaved = () => {} } = {}) {
  let mediaRecorder = null;
  let audioChunks = [];
  let recordTimer = null;
  let recordStartTime = 0;
  let pausedElapsed = 0;
  let isRecording = false;

  const timerEl = h('span', { class: 'record-timer' }, '00:00');
  const statusEl = h('span', { class: 'small muted' }, 'Ready to record');

  const startBtn = h('button', { class: 'primary small-btn', type: 'button' }, 'Record Mic');
  const pauseBtn = h('button', { class: 'ghost small-btn', type: 'button', style: 'display:none;' }, 'Pause');
  const resumeBtn = h('button', { class: 'ghost small-btn', type: 'button', style: 'display:none;' }, 'Resume');
  const stopBtn = h('button', { class: 'ghost danger small-btn', type: 'button', style: 'display:none;' }, 'Stop');

  const fileInput = h('input', {
    type: 'file', accept: 'audio/*', style: 'display: none;',
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const title = file.name.replace(/\.[^/.]+$/, '');
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/webm' });
      const { battleId = null, roundId = null } = getContext();
      const vn = await store.createVoiceNote({
        title, description: `Imported audio: ${file.name}`, durationMs: 0,
        battleId, roundId, blob, mimeType: file.type || 'audio/webm',
      });
      toast('Audio file imported');
      onSaved(vn);
    },
  });
  const uploadBtn = h('button', { class: 'ghost small-btn', type: 'button', onclick: () => fileInput.click() }, 'Import Audio File');

  const updateTimer = () => {
    const secs = Math.floor((Date.now() - recordStartTime + pausedElapsed) / 1000);
    timerEl.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  };

  function resetUI() {
    clearInterval(recordTimer);
    timerEl.textContent = '00:00';
    statusEl.textContent = 'Ready to record';
    statusEl.classList.remove('recording-indicator');
    startBtn.style.display = 'inline-block';
    pauseBtn.style.display = resumeBtn.style.display = stopBtn.style.display = 'none';
    isRecording = false;
  }

  async function start() {
    if (isRecording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Microphone recording is not supported in this browser.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorder = rec;
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const durationMs = Date.now() - recordStartTime + pausedElapsed;
        const blob = new Blob(audioChunks, { type: rec.mimeType || 'audio/webm' });
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const title = nextTitle ? nextTitle(time) : `Take (${time})`;
        const { battleId = null, roundId = null } = getContext();
        resetUI();
        const vn = await store.createVoiceNote({ title, durationMs, battleId, roundId, blob, mimeType: blob.type });
        toast('Voice note saved');
        onSaved(vn);
      };
      rec.start(250);
      recordStartTime = Date.now();
      pausedElapsed = 0;
      isRecording = true;
      recordTimer = setInterval(updateTimer, 500);
      startBtn.style.display = 'none';
      pauseBtn.style.display = stopBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
      statusEl.textContent = 'Recording delivery...';
      statusEl.classList.add('recording-indicator');
    } catch (err) {
      console.error(err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast('Microphone access denied. Please allow microphone permissions in browser settings.', 'error');
      } else {
        toast(`Could not access microphone: ${err.message}`, 'error');
      }
    }
  }

  function pause() {
    if (mediaRecorder?.state !== 'recording') return;
    mediaRecorder.pause();
    pausedElapsed += Date.now() - recordStartTime;
    clearInterval(recordTimer);
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'inline-block';
    statusEl.textContent = 'Recording paused';
  }

  function resume() {
    if (mediaRecorder?.state !== 'paused') return;
    mediaRecorder.resume();
    recordStartTime = Date.now();
    recordTimer = setInterval(updateTimer, 500);
    resumeBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
    statusEl.textContent = 'Recording delivery...';
  }

  function stop() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      clearInterval(recordTimer);
      mediaRecorder.stop();
    }
  }

  startBtn.onclick = start; pauseBtn.onclick = pause; resumeBtn.onclick = resume; stopBtn.onclick = stop;

  const el = h('div', { class: 'recorder-box' },
    h('div', { class: 'row', style: 'justify-content: space-between; align-items:center;' },
      h('div', { class: 'row', style: 'align-items:center; gap: 12px;' }, timerEl, statusEl),
      h('div', { class: 'row', style: 'align-items:center; gap: 8px;' }, startBtn, pauseBtn, resumeBtn, stopBtn, uploadBtn, fileInput)));

  return { el, start, stop, isRecording: () => isRecording };
}
