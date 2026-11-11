import { h, toast, confirmDialog, formDialog } from '../core/ui.js';
import { formatDate } from '../core/util.js';
import * as store from '../core/store.js';

export async function opponentFormDialog(initial = {}) {
  const isEdit = !!initial.id;
  const nameInput = h('input', { type: 'text', value: initial.name || '', placeholder: 'Enter opponent name', 'aria-label': 'Opponent name' });
  const locationInput = h('input', { type: 'text', value: initial.location || '', placeholder: 'Enter location' });
  const leagueInput = h('input', { type: 'text', value: initial.league || '', placeholder: 'Enter league' });
  const backgroundInput = h('textarea', { rows: 3, placeholder: 'Enter style and background' }, initial.background || '');
  const prevBattlesInput = h('textarea', { rows: 2, placeholder: 'Enter previous battles' }, initial.previousBattles || '');
  const notableLinesInput = h('textarea', { rows: 2, placeholder: 'Enter notable lines' }, initial.notableLines || '');
  const weaknessesInput = h('textarea', { rows: 2, placeholder: 'Enter weaknesses' }, initial.weaknesses || '');
  const contradictionsInput = h('textarea', { rows: 2, placeholder: 'Enter contradictions' }, initial.contradictions || '');
  const anglesInput = h('textarea', { rows: 3, placeholder: 'Enter attack angles' }, initial.personalAngles || '');
  const rebuttalsInput = h('textarea', { rows: 2, placeholder: 'Enter rebuttals' }, initial.rebuttals || '');
  const linksInput = h('textarea', { rows: 2, placeholder: 'Enter reference links' }, (initial.links || []).join('\n'));

  const body = h('div', { class: 'stack form' },
    h('label', {}, 'Opponent Name *', nameInput),
    h('div', { class: 'grid2' },
      h('label', {}, 'Location / Origin', locationInput),
      h('label', {}, 'League / Affiliation', leagueInput)),
    h('label', {}, 'Style & Background', backgroundInput),
    h('label', {}, 'Notable Previous Battles', prevBattlesInput),
    h('label', {}, 'Famous Lines & Habits', notableLinesInput),
    h('div', { class: 'grid2' },
      h('label', {}, 'Known Weaknesses', weaknessesInput),
      h('label', {}, 'Contradictions & Hypocrisies', contradictionsInput)),
    h('label', {}, 'Possible Personal Angles', anglesInput),
    h('label', {}, 'Prepared Rebuttals & Counters', rebuttalsInput),
    h('label', {}, 'Reference Video / Web Links (one per line)', linksInput));

  const ok = await formDialog({
    title: isEdit ? `Edit Opponent: ${initial.name}` : 'New Opponent Profile',
    confirmLabel: isEdit ? 'Save Profile' : 'Create Profile',
    body,
  });
  if (!ok) return null;

  return {
    name: nameInput.value.trim(),
    location: locationInput.value.trim(),
    league: leagueInput.value.trim(),
    background: backgroundInput.value.trim(),
    previousBattles: prevBattlesInput.value.trim(),
    notableLines: notableLinesInput.value.trim(),
    weaknesses: weaknessesInput.value.trim(),
    contradictions: contradictionsInput.value.trim(),
    personalAngles: anglesInput.value.trim(),
    rebuttals: rebuttalsInput.value.trim(),
    links: linksInput.value.split('\n').map((l) => l.trim()).filter(Boolean),
  };
}

export async function opponentsView(root) {
  let opponents = await store.listOpponents();
  let selectedOpponentId = opponents.length ? opponents[0].id : null;

  const sidebarEl = h('div', { class: 'opponents-sidebar' });
  const detailEl = h('div', { class: 'opponents-detail grow' });

  async function reload() {
    opponents = await store.listOpponents();
    if (!opponents.some((o) => o.id === selectedOpponentId)) {
      selectedOpponentId = opponents.length ? opponents[0].id : null;
    }
    render();
  }

  async function renderDetail(op) {
    if (!op) {
      detailEl.replaceChildren(
        h('div', { class: 'empty-state-wrap empty' },
          h('div', { class: 'empty-state-icon' }, '🎯'),
          h('div', { class: 'empty-state-title' }, 'Investigation Board Clean'),
          h('div', { class: 'empty-state-desc' }, 'Select a rival dossier from the left or create a new profile to catalogue tendencies, chokes, and attack angles.')
        )
      );
      return;
    }

    const notes = await store.getOpponentNotes(op.id);

    const notesListEl = h('div', { class: 'stack', style: 'margin-top: 10px;' });
    if (notes.length) {
      notesListEl.replaceChildren(
        ...notes.map((n) =>
          h('div', { class: 'item', style: 'background: var(--surface-2); border-radius: 4px; padding: 8px 10px;' },
            h('div', { class: 'grow' },
              h('div', { class: 'text', style: 'font-family: var(--font-write); font-size: 13px;' }, n.body),
              h('div', { class: 'small faint' }, formatDate(n.createdAt, true))),
            h('button', {
              class: 'ghost danger-text small-btn',
              title: 'Delete note',
              onclick: async () => {
                await store.deleteOpponentNote(n.id);
                toast('Note deleted');
                renderDetail(op);
              },
            }, '×')))
      );
    } else {
      notesListEl.replaceChildren(h('div', { class: 'small faint' }, 'No timestamps or intel notes recorded yet.'));
    }

    const addNoteBtn = h('button', {
      class: 'ghost small-btn',
      onclick: async () => {
        const bodyInput = h('textarea', { rows: 3, placeholder: 'Enter research notes' });
        const ok = await formDialog({
          title: `Add Research Note for ${op.name}`,
          confirmLabel: 'Save Note',
          body: h('div', { class: 'stack form' },
            h('label', {}, 'Research Note', bodyInput)),
        });
        if (ok && bodyInput.value.trim()) {
          await store.addOpponentNote(op.id, bodyInput.value.trim());
          toast('Note added');
          renderDetail(op);
        }
      },
    }, '+ Add Note');

    const metaParts = [op.league && `LEAGUE: ${op.league}`, op.location && `ORIGIN: ${op.location}`].filter(Boolean).join(' · ') || 'DOSSIER ACTIVE';

    detailEl.replaceChildren(
      h('div', { class: 'dossier-header-card' },
        h('div', { class: 'dossier-stamp' }, 'CONFIDENTIAL CASE FILE // DOSSIER'),
        h('div', { class: 'row', style: 'justify-content: space-between; align-items: flex-end;' },
          h('div', {},
            h('h2', { class: 'dossier-target-name' }, op.name),
            h('div', { class: 'small muted', style: 'letter-spacing: 0.05em;' }, metaParts)
          ),
          h('div', { class: 'row', style: 'gap: 8px;' },
            h('button', {
              class: 'ghost small-btn',
              onclick: async () => {
                const updated = await opponentFormDialog(op);
                if (updated) {
                  await store.updateOpponent(op.id, updated);
                  toast('Opponent profile updated');
                  reload();
                }
              },
            }, 'Edit Profile'),
            h('button', {
              class: 'ghost danger small-btn',
              onclick: async () => {
                const ok = await confirmDialog({
                  title: 'Delete Opponent Profile?',
                  message: `Delete profile and notes for "${op.name}"?`,
                  danger: true,
                  confirmLabel: 'Delete Permanently',
                });
                if (ok) {
                  await store.deleteOpponent(op.id);
                  toast('Opponent deleted');
                  reload();
                }
              },
            }, 'Delete')
          )
        )
      ),

      h('div', { class: 'investigation-board-grid' },
        op.personalAngles ? h('section', { class: 'investigation-card priority research-box highlight' },
          h('div', { class: 'investigation-card-title danger-head' }, '🎯 Primary Attack Angles'),
          h('p', { class: 'pre-text' }, op.personalAngles)) : null,

        op.weaknesses ? h('section', { class: 'investigation-card research-box' },
          h('div', { class: 'investigation-card-title' }, '⚠️ Vulnerabilities & Chokes'),
          h('p', { class: 'pre-text' }, op.weaknesses)) : null,

        op.contradictions ? h('section', { class: 'investigation-card research-box' },
          h('div', { class: 'investigation-card-title' }, '⚖️ Contradictions & Hypocrisies'),
          h('p', { class: 'pre-text' }, op.contradictions)) : null,

        op.rebuttals ? h('section', { class: 'investigation-card research-box' },
          h('div', { class: 'investigation-card-title' }, '🛡️ Anticipated Bars & Rebuttals'),
          h('p', { class: 'pre-text' }, op.rebuttals)) : null,

        op.background ? h('section', { class: 'investigation-card research-box' },
          h('div', { class: 'investigation-card-title' }, '🎙️ Persona & Battle Style'),
          h('p', { class: 'pre-text' }, op.background)) : null,

        op.notableLines ? h('section', { class: 'investigation-card research-box' },
          h('div', { class: 'investigation-card-title' }, '💬 Trademark Schemes & Slogans'),
          h('p', { class: 'pre-text' }, op.notableLines)) : null,

        op.links && op.links.length ? h('section', { class: 'investigation-card research-box' },
          h('div', { class: 'investigation-card-title' }, '🎬 Video Footage & Surveillance'),
          h('ul', { class: 'bullet-list' }, op.links.map((l) =>
            h('li', {}, h('a', { href: l, target: '_blank', rel: 'noopener noreferrer' }, l))))) : null,

        h('section', { class: 'investigation-card research-box', style: 'grid-column: 1 / -1;' },
          h('div', { class: 'row', style: 'justify-content: space-between; align-items:center;' },
            h('div', { class: 'investigation-card-title' }, '📝 Agent Case Notes & Timestamps'),
            addNoteBtn),
          notesListEl)
      )
    );
  }

  function renderSidebar() {
    const addBtn = h('button', {
      class: 'primary small-btn',
      style: 'width: 100%; margin-bottom: 12px;',
      onclick: async () => {
        const v = await opponentFormDialog();
        if (v) {
          const op = await store.createOpponent(v);
          selectedOpponentId = op.id;
          toast('Opponent profile created');
          reload();
        }
      },
    }, '+ Add Opponent');

    const items = opponents.map((o) =>
      h('button', {
        class: `opponent-nav-item ${o.id === selectedOpponentId ? 'active' : ''}`,
        onclick: () => {
          selectedOpponentId = o.id;
          render();
        },
      },
      h('div', { class: 'title' }, o.name),
      h('div', { class: 'small muted' }, o.league || o.location || 'Profile'))
    );

    sidebarEl.replaceChildren(addBtn, h('div', { class: 'opponents-list' }, items));
  }

  function render() {
    renderSidebar();
    const curr = opponents.find((o) => o.id === selectedOpponentId);
    renderDetail(curr);
  }

  root.replaceChildren(
    h('div', { class: 'page stack' },
      h('div', { class: 'page-head' },
        h('h1', {}, 'Opponent Research'),
        h('p', { class: 'muted small' }, 'Study your rivals, catalog their tendencies and weaknesses, and formulate attack angles.')),
      h('div', { class: 'opponents-layout' },
        sidebarEl,
        detailEl))
  );

  render();
}
