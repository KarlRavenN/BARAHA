import { h, toast, confirmDialog, formDialog, download } from '../core/ui.js';
import { debounce } from '../core/util.js';
import * as store from '../core/store.js';
import { openContextMenu } from '../components/context-menu.js';
import { lineCheckerDialog } from './line-checker.js';
import {
  sanitizeRichContent,
  htmlToPlainText,
  plainTextToHtml,
  applyHighlight,
  removeHighlight,
  clearAllHighlights,
  attachHighlightBoundaryHandler,
} from '../components/rich-editor.js';

export async function schemeFormDialog(initial = {}, { battleId = null, roundId = null } = {}) {
  const isEdit = !!initial.id;
  const titleInput = h('input', { type: 'text', value: initial.title || '', placeholder: 'Enter scheme title', 'aria-label': 'Scheme title' });
  const topicInput = h('input', { type: 'text', value: initial.topic || '', placeholder: 'Enter topic', 'aria-label': 'Scheme topic' });
  const angleInput = h('input', { type: 'text', value: initial.angle || '', placeholder: 'Enter angle', 'aria-label': 'Scheme angle' });
  const wordAssocInput = h('input', { type: 'text', value: (initial.wordAssociations || []).join(', '), placeholder: 'Enter word associations', 'aria-label': 'Word associations' });
  const referencesInput = h('textarea', { rows: 2, placeholder: 'Enter references' }, (initial.references || []).join('\n'));
  const punchlinesInput = h('textarea', { rows: 2, placeholder: 'Enter punchlines' }, (initial.punchlines || []).join('\n'));
  const draftBarsInput = h('textarea', { rows: 4, placeholder: 'Enter draft bars' }, (initial.draftBars || []).join('\n'));
  const notesInput = h('textarea', { rows: 2, placeholder: 'Enter delivery notes' }, initial.supportingNotes || '');

  const body = h('div', { class: 'stack form' },
    h('label', {}, 'Scheme Title', titleInput),
    h('div', { class: 'grid2' },
      h('label', {}, 'Main Topic', topicInput),
      h('label', {}, 'Angle / Core Concept', angleInput)),
    h('label', {}, 'Word Associations & Keywords (comma-separated)', wordAssocInput),
    h('label', {}, 'References & Context (one per line)', referencesInput),
    h('label', {}, 'Punchline Ideas (one per line)', punchlinesInput),
    h('label', {}, 'Draft Sequence / Bars', draftBarsInput),
    h('label', {}, 'Supporting & Delivery Notes', notesInput));

  const ok = await formDialog({
    title: isEdit ? 'Edit Scheme' : 'Build New Scheme',
    confirmLabel: isEdit ? 'Save Scheme' : 'Create Scheme',
    body,
  });
  if (!ok) return null;

  return {
    title: titleInput.value.trim(),
    topic: topicInput.value.trim(),
    angle: angleInput.value.trim(),
    status: initial.status || 'Drafting',
    wordAssociations: wordAssocInput.value.split(',').map((w) => w.trim()).filter(Boolean),
    references: referencesInput.value.split('\n').map((r) => r.trim()).filter(Boolean),
    punchlines: punchlinesInput.value.split('\n').map((p) => p.trim()).filter(Boolean),
    draftBars: draftBarsInput.value.split('\n').filter((b) => b.trim()),
    supportingNotes: notesInput.value.trim(),
    battleId: initial.battleId || battleId,
    roundId: initial.roundId || roundId,
  };
}

function getSchemePreview(scheme) {
  if (scheme.angle && scheme.angle.trim()) return `Angle: ${scheme.angle.trim()}`;
  if (scheme.topic && scheme.topic.trim()) return `Topic: ${scheme.topic.trim()}`;
  if (scheme.draftBars && scheme.draftBars.length) {
    const firstBar = scheme.draftBars.find((b) => b && b.trim());
    if (firstBar) return firstBar.trim();
  }
  if (scheme.supportingNotes && scheme.supportingNotes.trim()) return scheme.supportingNotes.trim();
  return 'No angle or bars defined yet';
}

export async function schemesView(container, { battleId, roundId, editor = null }) {
  let schemes = await store.listSchemes({ roundId });
  let currentMode = 'list'; // 'list' | 'editor'
  let activeScheme = null; // null for new, or scheme object
  let createdObjectUrls = []; // Track audio URLs for clean teardown

  // Scheme Voice Recorder State
  let mediaRecorder = null;
  let audioChunks = [];
  let recordTimer = null;
  let recordStartTime = 0;
  let pausedElapsed = 0;
  let isRecording = false;
  let isPaused = false;
  let mediaStream = null;

  async function reloadList() {
    const raw = await store.listSchemes({ roundId });
    // Guaranteed deduplication by ID
    schemes = Array.from(new Map(raw.map((s) => [s.id, s])).values());
    render();
  }

  function openEditor(scheme = null) {
    activeScheme = scheme;
    currentMode = 'editor';
    render();
  }

  function stopAndCleanupRecorder() {
    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch (e) { /* silent */ }
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    mediaRecorder = null;
    audioChunks = [];
    isRecording = false;
    isPaused = false;
  }

  function cleanupUrls() {
    for (const url of createdObjectUrls) {
      URL.revokeObjectURL(url);
    }
    createdObjectUrls = [];
  }

  async function backToList() {
    if (isRecording) {
      const ok = await confirmDialog({
        title: 'Stop Recording?',
        message: 'You have a recording in progress. Leaving will stop and discard this take. Continue?',
        danger: true,
        confirmLabel: 'Discard and Leave',
      });
      if (!ok) return;
    }
    stopAndCleanupRecorder();
    cleanupUrls();
    currentMode = 'list';
    activeScheme = null;
    reloadList();
  }

  function appendSchemeToFinal(schemeBars, schemeTitle) {
    const bars = (schemeBars || []).join('\n').trim();
    if (!bars) {
      toast('This scheme has no draft bars to export.', 'error');
      return;
    }
    const formatted = `\n[Scheme: ${schemeTitle || 'Untitled Scheme'}]\n${bars}\n`;
    if (editor && typeof editor.appendText === 'function') {
      editor.appendText(formatted);
      toast('Scheme bars appended to Final Material');
      return;
    }
    toast('Final editor is not accessible', 'error');
  }

  function insertSchemeAtCursor(schemeBars, schemeTitle) {
    const bars = (schemeBars || []).join('\n').trim();
    if (!bars) {
      toast('This scheme has no draft bars to insert.', 'error');
      return;
    }
    const formatted = `\n[Scheme: ${schemeTitle || 'Untitled Scheme'}]\n${bars}\n`;
    if (editor && typeof editor.insertText === 'function') {
      editor.insertText(formatted);
      toast('Scheme bars inserted at cursor');
    } else {
      appendSchemeToFinal(schemeBars, schemeTitle);
    }
  }

  // --- RENDER SCHEME CARD (LIST VIEW) ---
  function renderSchemeCard(s) {
    const preview = getSchemePreview(s);
    return h('div', {
      class: 'scheme-card clickable',
      onclick: () => openEditor(s),
    },
      h('div', { class: 'scheme-card-title' }, s.title || 'Untitled Scheme'),
      h('div', { class: 'scheme-card-preview' }, preview));
  }

  // --- RENDER INLINE SCHEME EDITOR ---
  function renderSchemeEditor() {
    const isNewRecord = () => !activeScheme || !activeScheme.id;
    const initialTitle = activeScheme ? (activeScheme.title || '') : '';
    const initialTopic = activeScheme ? (activeScheme.topic || '') : '';
    const initialAngle = activeScheme ? (activeScheme.angle || '') : '';
    const initialBars = activeScheme ? (activeScheme.draftBars || []).join('\n') : '';
    const initialAssoc = activeScheme ? (activeScheme.wordAssociations || []).join(', ') : '';
    const initialRefs = activeScheme ? (activeScheme.references || []).join('\n') : '';
    const initialPunches = activeScheme ? (activeScheme.punchlines || []).join('\n') : '';
    const initialNotes = activeScheme ? (activeScheme.supportingNotes || '') : '';

    let inFlightSave = null;

    const backBtn = h('button', {
      class: 'ghost small-btn inline-back-btn',
      title: 'Back to Schemes list',
      onclick: async () => {
        debouncedAutosave.cancel?.();
        await saveCurrentChanges();
        backToList();
      },
    }, '← Schemes');

    const saveBadge = h('span', { class: 'save-state faint small' }, 'Saved');

    const headEl = h('div', { class: 'inline-editor-head' },
      h('div', { class: 'row', style: 'align-items: center; gap: 8px;' },
        backBtn,
        h('h3', { class: 'inline-editor-title' }, isNewRecord() ? 'New Scheme' : (activeScheme.title || 'Edit Scheme'))),
      saveBadge);

    // Primary writing fields
    const titleInput = h('input', {
      type: 'text',
      class: 'inline-title-input',
      value: initialTitle,
      placeholder: 'Enter scheme title',
      'aria-label': 'Scheme title',
    });

    const topicInput = h('input', {
      type: 'text',
      value: initialTopic,
      placeholder: 'Enter topic',
      'aria-label': 'Scheme topic',
    });

    const angleInput = h('input', {
      type: 'text',
      value: initialAngle,
      placeholder: 'Enter angle',
      'aria-label': 'Scheme angle',
    });

    const draftBarsTextarea = h('div', {
      class: 'inline-content-textarea rich-field',
      contenteditable: 'true',
      'aria-label': 'Draft sequence bars',
      'data-placeholder': 'Enter draft sequence of bars…',
      spellcheck: 'false',
      tabindex: '0',
    });

    Object.defineProperty(draftBarsTextarea, 'value', {
      get() { return sanitizeRichContent(draftBarsTextarea.innerHTML); },
      set(val) {
        if ((val || '').includes('<mark') || (val || '').includes('<br>')) {
          draftBarsTextarea.innerHTML = sanitizeRichContent(val || '');
        } else {
          draftBarsTextarea.innerHTML = plainTextToHtml(val || '');
        }
      },
      configurable: true,
    });
    draftBarsTextarea.value = initialBars;

    draftBarsTextarea.addEventListener('paste', (e) => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (txt) document.execCommand('insertText', false, txt);
      debouncedAutosave();
    });

    // Attach boundary handler so pressing Space after a highlight types cleanly outside the mark
    attachHighlightBoundaryHandler(draftBarsTextarea, () => {
      debouncedAutosave();
    });

    draftBarsTextarea.addEventListener('contextmenu', (e) => {
      const sel = window.getSelection();
      const selected = sel ? sel.toString().trim() : '';
      if (!selected) return;
      e.preventDefault();

      const highlightOpts = {
        onHighlight: (color) => {
          const ok = applyHighlight(color, draftBarsTextarea);
          if (ok) {
            saveCurrentChanges();
            toast('Highlight applied');
          }
        },
        onRemoveHighlight: () => {
          const ok = removeHighlight(draftBarsTextarea);
          if (ok) {
            saveCurrentChanges();
            toast('Highlight removed');
          }
        },
        onClearAllHighlights: () => {
          clearAllHighlights(draftBarsTextarea);
          saveCurrentChanges();
          toast('Highlights cleared');
        },
      };

      const actions = [
        {
          label: `📌 Pin Bar "${selected.length > 20 ? selected.slice(0, 20) + '…' : selected}"`,
          action: async () => {
            await store.createPinnedBar({ text: selected, battleId, roundId, source: 'Scheme' });
            window.dispatchEvent(new CustomEvent('baraha:pinned-updated'));
            toast('Bar pinned');
          },
        },
        {
          label: `Find Rhymes for "${selected.length > 18 ? selected.slice(0, 18) + '…' : selected}"`,
          action: () => {
            if (editor && typeof editor.onRhymeSearch === 'function') {
              editor.onRhymeSearch(selected);
            } else {
              toast(`Selected "${selected}"`);
            }
          },
        },
        {
          label: 'Save Selection to Rhyme Bank',
          action: async () => {
            await store.createSavedRhyme({ text: selected, battleId, roundId, collection: 'Schemes' });
            toast(`Saved "${selected}" to Rhyme Bank`);
          },
        },
        {
          label: 'Check for Similar Lines (Line Checker)',
          action: () => {
            lineCheckerDialog(selected, { battleId, roundId });
          },
        },
      ];

      openContextMenu(e, selected, actions, highlightOpts);
    });

    // Secondary fields
    const wordAssocInput = h('input', {
      type: 'text',
      value: initialAssoc,
      placeholder: 'Enter word associations',
      'aria-label': 'Word associations',
    });

    const referencesTextarea = h('textarea', {
      rows: 2,
      placeholder: 'Enter references',
      'aria-label': 'References',
    }, initialRefs);

    const punchlinesTextarea = h('textarea', {
      rows: 2,
      placeholder: 'Enter punchlines',
      'aria-label': 'Punchlines',
    }, initialPunches);

    const notesTextarea = h('textarea', {
      rows: 2,
      placeholder: 'Enter delivery notes',
      'aria-label': 'Supporting notes',
    }, initialNotes);

    const linkedDraftsContainer = h('div', { class: 'linked-drafts' });

    async function refreshLinkedDrafts() {
      if (isNewRecord() || !activeScheme?.id) {
        linkedDraftsContainer.replaceChildren(h('span', { class: 'small faint' }, 'Save scheme to connect draft ideas.'));
        return;
      }
      const linked = await store.getSchemeDrafts(activeScheme.id);
      if (!linked.length) {
        linkedDraftsContainer.replaceChildren(
          h('span', { class: 'small faint' }, 'No draft ideas linked yet.'),
          h('button', {
            class: 'ghost small-btn',
            onclick: async () => {
              const allRoundDrafts = await store.listDrafts({ roundId });
              if (!allRoundDrafts.length) {
                toast('No draft ideas found in this round.', 'error');
                return;
              }
              const select = h('select', {}, allRoundDrafts.map((d) => h('option', { value: d.id }, d.title)));
              const ok = await formDialog({
                title: 'Connect Draft to Scheme',
                confirmLabel: 'Connect',
                body: h('div', { class: 'stack form' },
                  h('label', {}, 'Select Draft Idea', select)),
              });
              if (ok) {
                await store.linkDraftToScheme(activeScheme.id, select.value);
                toast('Draft connected');
                refreshLinkedDrafts();
              }
            },
          }, '+ Connect Draft')
        );
        return;
      }

      linkedDraftsContainer.replaceChildren(
        h('span', { class: 'small muted' }, 'Connected Drafts:'),
        ...linked.map((d) => h('div', { class: 'linked-draft-pill' },
          h('span', {}, d.title),
          h('button', {
            class: 'ghost-mini',
            title: 'Unlink from scheme',
            onclick: async () => {
              await store.unlinkDraftFromScheme(activeScheme.id, d.id);
              toast('Draft unlinked');
              refreshLinkedDrafts();
            },
          }, '×'))),
        h('button', {
          class: 'ghost-mini',
          title: 'Connect another draft',
          onclick: async () => {
            const allRoundDrafts = await store.listDrafts({ roundId });
            const select = h('select', {}, allRoundDrafts.map((d) => h('option', { value: d.id }, d.title)));
            const ok = await formDialog({
              title: 'Connect Draft to Scheme',
              confirmLabel: 'Connect',
              body: h('div', { class: 'stack form' },
                h('label', {}, 'Select Draft Idea', select)),
            });
            if (ok) {
              await store.linkDraftToScheme(activeScheme.id, select.value);
              toast('Draft connected');
              refreshLinkedDrafts();
            }
          },
        }, '+')
      );
    }
    refreshLinkedDrafts();

    const secondaryDetails = h('details', { class: 'inline-secondary-details' },
      h('summary', { class: 'inline-secondary-summary' }, 'Supporting elements & context'),
      h('div', { class: 'stack form', style: 'margin-top: 8px;' },
        h('label', {}, 'Word Associations & Keywords (comma-separated)', wordAssocInput),
        h('label', {}, 'References & Context (one per line)', referencesTextarea),
        h('label', {}, 'Punchlines & Payoffs (one per line)', punchlinesTextarea),
        h('label', {}, 'Delivery & Supporting Notes', notesTextarea),
        h('label', {}, 'Connected Draft Ideas', linkedDraftsContainer)));

    // --- VOICE / FLOW RECORDING SECTION ---
    const recordTimerEl = h('span', { class: 'record-timer' }, '00:00');
    const recordStatusEl = h('span', { class: 'small muted' }, 'Ready to record');
    const recordMicBtn = h('button', { class: 'primary small-btn' }, 'Record Mic');
    const pauseRecBtn = h('button', { class: 'ghost small-btn', style: 'display:none;' }, 'Pause');
    const resumeRecBtn = h('button', { class: 'ghost small-btn', style: 'display:none;' }, 'Resume');
    const stopRecBtn = h('button', { class: 'ghost danger small-btn', style: 'display:none;' }, 'Stop Take');

    const recordingsListEl = h('div', { class: 'scheme-recordings-list stack' });

    async function loadRecordings() {
      if (isNewRecord() || !activeScheme?.id) {
        recordingsListEl.replaceChildren(h('div', { class: 'empty small' }, 'Save this scheme to begin recording cadence & flow takes.'));
        return;
      }
      const notes = await store.getVoiceNotes({ schemeId: activeScheme.id });
      if (!notes.length) {
        recordingsListEl.replaceChildren(h('div', { class: 'empty small' }, 'No flow takes recorded yet for this scheme.'));
        return;
      }

      cleanupUrls();
      const rows = [];
      for (const vn of notes) {
        const audioRec = await store.getAudioBlob(vn.id);
        let audioEl = null;
        let blobUrl = null;
        if (audioRec && audioRec.blob) {
          blobUrl = URL.createObjectURL(audioRec.blob);
          createdObjectUrls.push(blobUrl);
          audioEl = h('audio', {
            controls: true,
            src: blobUrl,
            preload: 'metadata',
            style: 'width: 100%; height: 32px; margin-top: 4px;',
          });
        }

        const durationSec = Math.round((vn.durationMs || 0) / 1000);
        const durStr = durationSec > 0 ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` : '00:00';

        const row = h('div', { class: 'scheme-recording-row' },
          h('div', { class: 'row', style: 'justify-content: space-between; align-items: center;' },
            h('b', { style: 'font-size: 13px;' }, vn.title),
            h('span', { class: 'tag' }, durStr)),
          audioEl,
          h('div', { class: 'row', style: 'justify-content: flex-end; gap: 6px; margin-top: 4px;' },
            h('button', {
              class: 'ghost-mini',
              title: 'Rename this take',
              onclick: async () => {
                const nameInput = h('input', { type: 'text', value: vn.title, 'aria-label': 'Take name' });
                const ok = await formDialog({
                  title: 'Rename Flow Take',
                  confirmLabel: 'Rename',
                  body: h('div', { class: 'stack form' },
                    h('label', {}, 'Take Title', nameInput)),
                });
                if (ok && nameInput.value.trim()) {
                  await store.updateVoiceNote(vn.id, { title: nameInput.value.trim() });
                  toast('Take renamed');
                  loadRecordings();
                }
              },
            }, 'Rename'),
            blobUrl ? h('button', {
              class: 'ghost-mini',
              title: 'Download audio file',
              onclick: () => {
                download(`${vn.title.replace(/[^\w-]/g, '_')}.webm`, audioRec.blob);
              },
            }, 'Download') : null,
            h('button', {
              class: 'ghost-mini danger-text',
              title: 'Delete this take',
              onclick: async () => {
                const ok = await confirmDialog({
                  title: 'Delete Recording?',
                  message: `Delete take "${vn.title}"? This cannot be undone.`,
                  danger: true,
                  confirmLabel: 'Delete',
                });
                if (ok) {
                  await store.deleteVoiceNote(vn.id);
                  toast('Take deleted');
                  loadRecordings();
                }
              },
            }, 'Delete')));

        rows.push(row);
      }

      recordingsListEl.replaceChildren(...rows);
    }

    loadRecordings();

    function updateRecTimer() {
      const elapsed = Date.now() - recordStartTime + pausedElapsed;
      const totalSecs = Math.floor(elapsed / 1000);
      const mins = String(Math.floor(totalSecs / 60)).padStart(2, '0');
      const secs = String(totalSecs % 60).padStart(2, '0');
      recordTimerEl.textContent = `${mins}:${secs}`;
    }

    async function startRecording() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('Microphone recording is not supported in this browser.', 'error');
        return;
      }

      // Ensure scheme is saved first so we have schemeId
      const saved = await saveCurrentChanges();
      if (!saved) {
        toast('Please enter a Scheme Title before recording.', 'error');
        return;
      }

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

        mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          if (mediaStream) {
            mediaStream.getTracks().forEach((t) => t.stop());
            mediaStream = null;
          }
          const totalDuration = Date.now() - recordStartTime + pausedElapsed;
          const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });

          const existingCount = (await store.getVoiceNotes({ schemeId: activeScheme.id })).length;
          const takeTitle = `Flow Take ${existingCount + 1}`;

          await store.createVoiceNote({
            title: takeTitle,
            durationMs: totalDuration,
            battleId,
            roundId,
            schemeId: activeScheme.id,
            blob,
            mimeType: blob.type,
          });

          toast('Flow take saved');
          resetRecUI();
          loadRecordings();
        };

        mediaRecorder.start(250);
        recordStartTime = Date.now();
        pausedElapsed = 0;
        isRecording = true;
        isPaused = false;
        recordTimer = setInterval(updateRecTimer, 500);

        recordMicBtn.style.display = 'none';
        pauseRecBtn.style.display = 'inline-block';
        resumeRecBtn.style.display = 'none';
        stopRecBtn.style.display = 'inline-block';
        recordStatusEl.textContent = 'Recording delivery cadence…';
        recordStatusEl.classList.add('recording-indicator');
      } catch (err) {
        console.error(err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          toast('Microphone permission denied. Allow mic access in browser settings.', 'error');
        } else {
          toast(`Microphone error: ${err.message}`, 'error');
        }
      }
    }

    function pauseRecording() {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        pausedElapsed += Date.now() - recordStartTime;
        clearInterval(recordTimer);
        isPaused = true;
        pauseRecBtn.style.display = 'none';
        resumeRecBtn.style.display = 'inline-block';
        recordStatusEl.textContent = 'Recording paused';
      }
    }

    function resumeRecording() {
      if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        recordStartTime = Date.now();
        recordTimer = setInterval(updateRecTimer, 500);
        isPaused = false;
        resumeRecBtn.style.display = 'none';
        pauseRecBtn.style.display = 'inline-block';
        recordStatusEl.textContent = 'Recording delivery cadence…';
      }
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        clearInterval(recordTimer);
        mediaRecorder.stop();
      }
    }

    function resetRecUI() {
      clearInterval(recordTimer);
      recordTimerEl.textContent = '00:00';
      recordStatusEl.textContent = 'Ready to record';
      recordStatusEl.classList.remove('recording-indicator');
      recordMicBtn.style.display = 'inline-block';
      pauseRecBtn.style.display = 'none';
      resumeRecBtn.style.display = 'none';
      stopRecBtn.style.display = 'none';
      isRecording = false;
      isPaused = false;
    }

    recordMicBtn.onclick = startRecording;
    pauseRecBtn.onclick = pauseRecording;
    resumeRecBtn.onclick = resumeRecording;
    stopRecBtn.onclick = stopRecording;

    const voiceSection = h('div', { class: 'scheme-voice-section stack' },
      h('div', { class: 'section-title', style: 'margin: 0; color: var(--text); font-weight: 600;' }, 'Voice / Flow Recording'),
      h('div', { class: 'recorder-box', style: 'padding: 8px 12px; margin-bottom: 4px;' },
        h('div', { class: 'row', style: 'justify-content: space-between; align-items: center; margin-bottom: 6px;' },
          recordTimerEl,
          recordStatusEl),
        h('div', { class: 'row', style: 'gap: 6px;' },
          recordMicBtn,
          pauseRecBtn,
          resumeRecBtn,
          stopRecBtn)),
      recordingsListEl);

    // Save changes logic
    async function saveCurrentChanges() {
      // Mutex: if a save is already running, return the ongoing promise
      if (inFlightSave) return inFlightSave;

      const title = titleInput.value.trim() || 'Untitled Scheme';
      const topic = topicInput.value.trim();
      const angle = angleInput.value.trim();
      const draftBars = draftBarsTextarea.value.split('\n').filter((b) => b.trim());
      const wordAssociations = wordAssocInput.value.split(',').map((w) => w.trim()).filter(Boolean);
      const references = referencesTextarea.value.split('\n').map((r) => r.trim()).filter(Boolean);
      const punchlines = punchlinesTextarea.value.split('\n').map((p) => p.trim()).filter(Boolean);
      const supportingNotes = notesTextarea.value.trim();

      // Only save if meaningful content exists
      if (isNewRecord() && !titleInput.value.trim() && !topic && !angle && !draftBars.length) return null;

      saveBadge.className = 'save-state saving small';
      saveBadge.textContent = 'Saving…';

      inFlightSave = (async () => {
        try {
          if (isNewRecord()) {
            const created = await store.createScheme({
              title, topic, angle, draftBars, wordAssociations, references, punchlines, supportingNotes,
              battleId, roundId,
            });
            activeScheme = created;
            saveBadge.className = 'save-state saved small';
            saveBadge.textContent = 'Saved';
            setTimeout(() => {
              if (saveBadge.textContent === 'Saved') saveBadge.textContent = 'Saved just now';
            }, 2000);
            return created;
          } else {
            const updated = await store.updateScheme(activeScheme.id, {
              title, topic, angle, draftBars, wordAssociations, references, punchlines, supportingNotes,
            });
            activeScheme = updated;
            saveBadge.className = 'save-state saved small';
            saveBadge.textContent = 'Saved';
            setTimeout(() => {
              if (saveBadge.textContent === 'Saved') saveBadge.textContent = 'Saved just now';
            }, 2000);
            return updated;
          }
        } catch (err) {
          console.error(err);
          saveBadge.className = 'save-state failed small';
          saveBadge.textContent = 'Save failed';
          return null;
        } finally {
          inFlightSave = null;
        }
      })();

      return inFlightSave;
    }

    const debouncedAutosave = debounce(saveCurrentChanges, 600);

    // Auto-save on input / change / blur
    [titleInput, topicInput, angleInput, draftBarsTextarea, wordAssocInput, referencesTextarea, punchlinesTextarea, notesTextarea].forEach((el) => {
      el.addEventListener('input', () => {
        saveBadge.className = 'save-state saving small';
        saveBadge.textContent = 'Saving…';
        debouncedAutosave();
      });
      el.addEventListener('change', () => { saveCurrentChanges(); });
      el.addEventListener('blur', () => { saveCurrentChanges(); });
    });

    const deleteBtn = !isNewRecord() ? h('button', {
      class: 'ghost danger small-btn',
      onclick: async () => {
        const ok = await confirmDialog({
          title: 'Delete Scheme?',
          message: `Delete "${activeScheme.title}"? Connected draft ideas will not be deleted.`,
          danger: true,
          confirmLabel: 'Delete',
        });
        if (ok) {
          debouncedAutosave.cancel?.();
          await store.deleteScheme(activeScheme.id);
          toast('Scheme deleted');
          backToList();
        }
      },
    }, 'Delete') : null;

    const footActions = h('div', { class: 'inline-editor-foot' },
      saveBadge,
      deleteBtn);

    return h('div', { class: 'inline-editor stack' },
      headEl,
      titleInput,
      h('div', { class: 'grid2', style: 'gap: 8px;' },
        h('label', {}, 'Main Topic', topicInput),
        h('label', {}, 'Angle / Core Concept', angleInput)),
      h('label', {}, 'Draft Sequence / Bars', draftBarsTextarea),
      secondaryDetails,
      voiceSection,
      footActions);
  }

  // --- RENDER MAIN VIEW ---
  function render() {
    if (currentMode === 'editor') {
      container.replaceChildren(renderSchemeEditor());
      return;
    }

    const newSchemeBtn = h('button', {
      class: 'primary small-btn',
      onclick: () => openEditor(null),
    }, '+ New Scheme');

    const headBar = h('div', { class: 'page-head', style: 'margin-bottom: 8px;' },
      h('h3', { style: 'margin: 0; font-size: 15px;' }, 'Schemes'),
      newSchemeBtn);

    let searchQuery = '';
    const searchInput = h('input', {
      type: 'search',
      placeholder: 'Search schemes',
      class: 'inline-search-input',
      'aria-label': 'Search schemes',
      oninput: (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderCardList();
      },
    });

    const cardsContainer = h('div', { class: 'scheme-cards-list' });

    function renderCardList() {
      const filtered = schemes.filter((s) => {
        if (!searchQuery) return true;
        return (s.title || '').toLowerCase().includes(searchQuery)
          || (s.topic || '').toLowerCase().includes(searchQuery)
          || (s.angle || '').toLowerCase().includes(searchQuery)
          || (s.draftBars || []).some((b) => b.toLowerCase().includes(searchQuery))
          || (s.wordAssociations || []).some((w) => w.toLowerCase().includes(searchQuery));
      });

      cardsContainer.replaceChildren(
        ...(filtered.length ? filtered.map(renderSchemeCard)
          : [h('div', { class: 'empty' }, schemes.length ? 'No schemes match search.' : 'No schemes created yet. Click "+ New Scheme" to build a multi-bar angle.')])
      );
    }

    renderCardList();

    container.replaceChildren(
      h('div', { class: 'schemes-module stack' },
        headBar,
        searchInput,
        cardsContainer)
    );
  }

  render();
  return {
    destroy: () => {
      stopAndCleanupRecorder();
      cleanupUrls();
    },
  };
}
