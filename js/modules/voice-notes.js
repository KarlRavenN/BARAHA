import { h, toast, confirmDialog, formDialog, download } from '../core/ui.js';
import { formatDate } from '../core/util.js';
import * as store from '../core/store.js';

export async function voiceNotesView(container, { battleId = null, roundId = null, isGlobalInbox = false } = {}) {
  let notes = await store.getVoiceNotes({ battleId, roundId, unassignedOnly: isGlobalInbox });

  // Recorder state
  let mediaRecorder = null;
  let audioChunks = [];
  let recordTimer = null;
  let recordStartTime = 0;
  let pausedElapsed = 0;
  let isRecording = false;
  let isPaused = false;

  const timerEl = h('span', { class: 'record-timer' }, '00:00');
  const recordStatusEl = h('span', { class: 'small muted' }, 'Ready to record');

  const startBtn = h('button', { class: 'primary small-btn' }, 'Record Mic');
  const pauseBtn = h('button', { class: 'ghost small-btn', style: 'display:none;' }, 'Pause');
  const resumeBtn = h('button', { class: 'ghost small-btn', style: 'display:none;' }, 'Resume');
  const stopBtn = h('button', { class: 'ghost danger small-btn', style: 'display:none;' }, 'Stop');

  const fileInput = h('input', {
    type: 'file',
    accept: 'audio/*',
    style: 'display: none;',
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;

      const title = file.name.replace(/\.[^/.]+$/, '');
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/webm' });
      await store.createVoiceNote({
        title,
        description: `Imported audio: ${file.name}`,
        durationMs: 0,
        battleId,
        roundId,
        blob,
        mimeType: file.type || 'audio/webm',
      });
      toast('Audio file imported');
      reload();
    },
  });

  const uploadBtn = h('button', {
    class: 'ghost small-btn',
    onclick: () => fileInput.click(),
  }, 'Import Audio File');

  const listEl = h('div', { class: 'stack' });

  async function reload() {
    notes = await store.getVoiceNotes({ battleId, roundId, unassignedOnly: isGlobalInbox });
    renderList();
  }

  function updateTimerDisplay() {
    const elapsed = Date.now() - recordStartTime + pausedElapsed;
    const totalSecs = Math.floor(elapsed / 1000);
    const mins = String(Math.floor(totalSecs / 60)).padStart(2, '0');
    const secs = String(totalSecs % 60).padStart(2, '0');
    timerEl.textContent = `${mins}:${secs}`;
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Microphone recording is not supported in this browser.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const totalDuration = Date.now() - recordStartTime + pausedElapsed;
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });

        const title = `Take ${notes.length + 1} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
        await store.createVoiceNote({
          title,
          durationMs: totalDuration,
          battleId,
          roundId,
          blob,
          mimeType: blob.type,
        });

        toast('Voice note saved');
        resetRecorderUI();
        reload();
      };

      mediaRecorder.start(250); // Slice every 250ms
      recordStartTime = Date.now();
      pausedElapsed = 0;
      isRecording = true;
      isPaused = false;

      recordTimer = setInterval(updateTimerDisplay, 500);

      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
      stopBtn.style.display = 'inline-block';
      recordStatusEl.textContent = 'Recording delivery...';
      recordStatusEl.classList.add('recording-indicator');
    } catch (err) {
      console.error(err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast('Microphone access denied. Please allow microphone permissions in browser settings.', 'error');
      } else {
        toast(`Could not access microphone: ${err.message}`, 'error');
      }
    }
  }

  function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
      pausedElapsed += Date.now() - recordStartTime;
      clearInterval(recordTimer);
      isPaused = true;
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block';
      recordStatusEl.textContent = 'Recording paused';
    }
  }

  function resumeRecording() {
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
      recordStartTime = Date.now();
      recordTimer = setInterval(updateTimerDisplay, 500);
      isPaused = false;
      resumeBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-block';
      recordStatusEl.textContent = 'Recording delivery...';
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      clearInterval(recordTimer);
      mediaRecorder.stop();
    }
  }

  function resetRecorderUI() {
    clearInterval(recordTimer);
    timerEl.textContent = '00:00';
    recordStatusEl.textContent = 'Ready to record';
    recordStatusEl.classList.remove('recording-indicator');
    startBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    isRecording = false;
    isPaused = false;
  }

  startBtn.onclick = startRecording;
  pauseBtn.onclick = pauseRecording;
  resumeBtn.onclick = resumeRecording;
  stopBtn.onclick = stopRecording;

  async function renderVoiceCard(vn) {
    const audioRec = await store.getAudioBlob(vn.id);
    let audioEl = null;

    if (audioRec && audioRec.blob) {
      const url = URL.createObjectURL(audioRec.blob);
      audioEl = h('audio', {
        controls: true,
        src: url,
        preload: 'metadata',
        style: 'width: 100%; margin-top: 8px;',
      });
    }

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
          audioRec && audioRec.blob ? h('button', {
            class: 'ghost small-btn',
            title: 'Download audio file',
            onclick: () => {
              const ext = audioRec.mimeType.includes('wav') ? 'wav' : 'webm';
              download(`${vn.title}.${ext}`, audioRec.blob);
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

  const recorderPanel = h('div', { class: 'recorder-box' },
    h('div', { class: 'row', style: 'justify-content: space-between; align-items:center;' },
      h('div', { class: 'row', style: 'align-items:center; gap: 12px;' },
        timerEl,
        recordStatusEl),
      h('div', { class: 'row', style: 'align-items:center; gap: 8px;' },
        startBtn, pauseBtn, resumeBtn, stopBtn, uploadBtn, fileInput)));

  container.replaceChildren(
    h('div', { class: 'voice-module stack' },
      recorderPanel,
      listEl)
  );

  renderList();
  return {
    destroy: () => {
      if (isRecording) stopRecording();
    },
  };
}
