import { h, toast, download, confirmDialog, formDialog } from '../core/ui.js';
import { go } from '../core/router.js';
import * as store from '../core/store.js';
import { mountTextEditor } from '../components/text-editor.js';
import { mountRhymeBank } from '../components/rhyme-bank.js';
import { mountFindBar } from '../components/find-bar.js';
import { schemesView } from './schemes.js';
import { voiceNotesView } from './voice-notes.js';
import { openGenericContextMenu } from '../components/context-menu.js';
import { iconSvg } from '../components/icons.js';

const SUPPORTING_TABS = [
  { key: 'rhymes', label: 'Rhymes' },
  { key: 'schemes', label: 'Schemes' },
  { key: 'voice', label: 'Voice Notes' },
];

/**
 * Two-Workspace Studio:
 * Workspace A (Left): Full height writing area + docked Find Bar
 * Workspace B (Right): Supporting Workspace Drawer (Rhymes default, Schemes, Voice Notes)
 * Flexible custom round tabs [Round 1] [Round 2] [Round 3] [Draft] [+] with drag reorder & context menu
 */
export async function workspaceView(root, { id, round, section = 'rhymes' }) {
  const battle = await store.getBattle(id);
  if (!battle) {
    go('/');
    toast('That battle no longer exists', 'error');
    return null;
  }

  // Load and sort rounds for this battle
  const rounds = await store.getRounds(id);
  if (!rounds || rounds.length === 0) {
    // If no rounds exist, ensure migration/defaults
    await store.migrateRoundsAndDrafts();
    return workspaceView(root, { id, round, section });
  }

  // Resolve current active round: match by ID first, then fallback to numeric index
  let activeRound = rounds.find((x) => x.id === round);
  if (!activeRound) {
    const roundIdx = parseInt(round, 10) - 1;
    if (!isNaN(roundIdx) && roundIdx >= 0 && roundIdx < rounds.length) {
      activeRound = rounds[roundIdx];
    } else {
      activeRound = rounds[0];
    }
  }

  store.touchOpened(id).catch(() => {});

  // Retrieve saved preferences for layout
  const cachedWidth = localStorage.getItem('baraha_supporting_width');
  const savedWidthSetting = await store.getSetting('workspace_supporting_width');
  const resolvedWidth = (savedWidthSetting && typeof savedWidthSetting === 'object' && 'value' in savedWidthSetting)
    ? savedWidthSetting.value
    : (savedWidthSetting ?? cachedWidth);
  let panelWidth = Number(resolvedWidth) || 380;
  if (panelWidth < 260) panelWidth = 260;

  const cachedCollapsed = localStorage.getItem('baraha_supporting_collapsed');
  const savedCollapsedSetting = await store.getSetting('workspace_supporting_collapsed');
  const resolvedCollapsed = (savedCollapsedSetting && typeof savedCollapsedSetting === 'object' && 'value' in savedCollapsedSetting)
    ? savedCollapsedSetting.value
    : (savedCollapsedSetting !== null && savedCollapsedSetting !== undefined ? savedCollapsedSetting : (cachedCollapsed === 'true'));
  const isMobileViewport = () => window.innerWidth <= 768;
  // On phones the supporting tools are a bottom sheet that starts closed (opened with the floating Tools button).
  let isPanelCollapsed = isMobileViewport() ? true : !!resolvedCollapsed;

  // Initial supporting tab: rhymes (default), schemes, voice
  const savedTabSetting = await store.getSetting('workspace_supporting_tab');
  const resolvedTab = (savedTabSetting && typeof savedTabSetting === 'object' && 'value' in savedTabSetting)
    ? savedTabSetting.value
    : savedTabSetting;
  const validKeys = SUPPORTING_TABS.map((t) => t.key);
  let activeSupportingTab = validKeys.includes(section)
    ? section
    : (validKeys.includes(resolvedTab) ? resolvedTab : 'rhymes');

  let editorInstance = null;
  let activeSupportingModule = null;
  let findBarInstance = null;

  // Header Elements
  // Inline SVG: the old ⭳ text glyph is missing from most phone fonts, so the button looked empty.
  const exportIcon = h('span', { class: 'ws-export-icon', 'aria-hidden': 'true' });
  exportIcon.innerHTML = iconSvg('export', 20);
  const exportTxtBtn = h('button', {
    class: 'ghost small-btn ws-export-btn',
    title: 'Export complete battle script to .txt',
    'aria-label': 'Export Script (.txt)',
    onclick: async () => {
      try {
        const txt = await store.exportBattleTxt(id);
        download(`${battle.title.replace(/[^\w-]/g, '_')}_script.txt`, txt);
        toast('Battle script exported');
      } catch (e) {
        toast(`Export failed: ${e.message}`, 'error');
      }
    },
  }, exportIcon, h('span', { class: 'ws-export-label' }, 'Export Script (.txt)'));

  const togglePanelBtn = h('button', {
    class: 'ghost small-btn ws-toggle-panel-btn',
    title: 'Toggle Supporting Workspace Panel',
    onclick: () => toggleSupportingPanel(),
  }, isPanelCollapsed ? 'Show Supporting Tools ◨' : 'Hide Supporting Tools ◫');

  // Add Round action
  async function promptAddRound() {
    const existing = await store.getRounds(id);
    const nonDraftCount = existing.filter((x) => x.kind !== 'draft').length;
    const defaultName = `Round ${nonDraftCount + 1}`;

    const nameInput = h('input', {
      type: 'text',
      value: defaultName,
      placeholder: 'Enter round name',
      'aria-label': 'Round name',
    });

    const ok = await formDialog({
      title: 'Add New Round',
      confirmLabel: 'Add Round',
      body: h('div', { class: 'stack form' },
        h('label', {}, 'Round Name', nameInput)
      ),
    });

    if (!ok) return;
    const newName = nameInput.value.trim() || defaultName;
    const newRound = await store.createRound(id, { name: newName });
    toast(`Created ${newRound.name}`);
    go(`/battle/${id}/${newRound.id}/final`);
  }

  // Rename Round action
  async function promptRenameRound(targetRound) {
    const nameInput = h('input', {
      type: 'text',
      value: targetRound.name,
      placeholder: 'Enter round name',
      'aria-label': 'Round name',
    });

    const ok = await formDialog({
      title: 'Rename Round',
      confirmLabel: 'Save Name',
      body: h('div', { class: 'stack form' },
        h('label', {}, 'Round Name', nameInput)
      ),
    });

    if (!ok) return;
    const newName = nameInput.value.trim();
    if (!newName) return;
    await store.renameRound(targetRound.id, newName);
    toast(`Renamed to "${newName}"`);
    go(`/battle/${id}/${targetRound.id}/final`);
  }

  // Delete Round action
  async function confirmDeleteRound(targetRound) {
    const currentRounds = await store.getRounds(id);
    if (currentRounds.length <= 1) {
      toast('A battle must always keep at least 1 round.', 'error');
      return;
    }

    const ok = await confirmDialog({
      title: `Delete "${targetRound.name}"?`,
      message: `Are you sure you want to delete ${targetRound.name}? This will permanently delete its written material. Attached schemes and voice notes will become unassigned. This cannot be undone.`,
      confirmLabel: 'Delete round',
      danger: true,
    });

    if (!ok) return;
    await store.deleteRound(targetRound.id);
    toast(`Deleted ${targetRound.name}`);
    const remaining = await store.getRounds(id);
    const fallback = remaining[0];
    go(`/battle/${id}/${fallback.id}/final`);
  }

  // Round Tabs Bar with drag-and-drop reordering & right-click context menu
  const roundTabsContainer = h('div', { class: 'tabs workspace-round-tabs', role: 'tablist' });

  function renderRoundTabs() {
    const tabEls = rounds.map((rItem) => {
      const isCurrent = rItem.id === activeRound.id;
      const tabEl = h('a', {
        class: `tab round-tab-item ${isCurrent ? 'active' : ''} ${rItem.kind === 'draft' ? 'tab-draft-kind' : ''}`,
        role: 'tab',
        'data-round-id': rItem.id,
        href: `#/battle/${id}/${rItem.id}/final`,
        title: `${rItem.name} (Right-click for options, Drag to reorder)`,
        oncontextmenu: (e) => {
          openGenericContextMenu(e, [
            {
              label: 'Rename',
              action: () => promptRenameRound(rItem),
            },
            {
              label: 'Delete Round',
              danger: true,
              disabled: rounds.length <= 1,
              action: () => confirmDeleteRound(rItem),
            },
          ], rItem.name);
        },
      },
        h('span', { class: 'tab-name-text' }, rItem.name)
      );

      // Pointer drag to reorder tabs
      // On touch devices: requires long-press (~350ms).
      // If released without moving after long-press, open context menu.
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let capturedPointerId = null;
      let touchTimer = null;
      let longPressFired = false;
      let hasMovedDuringLongPress = false;
      let pointerType = 'mouse';

      tabEl.setAttribute('draggable', 'false'); // prevent browser's native element drag

      tabEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // primary click only
        startX = e.clientX;
        startY = e.clientY;
        isDragging = false;
        longPressFired = false;
        hasMovedDuringLongPress = false;
        pointerType = e.pointerType || 'mouse';
        capturedPointerId = e.pointerId;

        if (pointerType === 'touch') {
          touchTimer = setTimeout(() => {
            longPressFired = true;
            try { navigator.vibrate?.(35); } catch (_) {}
            tabEl.classList.add('is-tab-dragging');
            try { tabEl.setPointerCapture(e.pointerId); } catch (_) {}
          }, 350);
        } else {
          try { tabEl.setPointerCapture(e.pointerId); } catch (_) {}
        }
      });

      // Once a long-press starts a drag, stop the strip from scrolling under the finger
      tabEl.addEventListener('touchmove', (e) => {
        if (longPressFired) e.preventDefault();
      }, { passive: false });

      tabEl.addEventListener('pointermove', (e) => {
        if (capturedPointerId === null) return;
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);

        if (pointerType === 'touch') {
          if (!longPressFired) {
            // Cancel long-press if user scrolls horizontally or vertically before 350ms
            if (dist > 8) {
              if (touchTimer) clearTimeout(touchTimer);
              touchTimer = null;
            }
            return;
          }
          if (dist > 8) {
            hasMovedDuringLongPress = true;
            isDragging = true;
          }
        } else {
          if (!isDragging && Math.abs(e.clientX - startX) > 5) {
            isDragging = true;
            tabEl.classList.add('is-tab-dragging');
          }
        }

        if (!isDragging) return;

        // While captured, elementFromPoint still works for siblings
        try { tabEl.releasePointerCapture(e.pointerId); } catch (_) {}
        const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('.round-tab-item');
        try { tabEl.setPointerCapture(e.pointerId); } catch (_) {}

        if (targetEl && targetEl !== tabEl && targetEl.parentElement === roundTabsContainer) {
          const targetRect = targetEl.getBoundingClientRect();
          const insertAfter = e.clientX > targetRect.left + targetRect.width / 2;
          if (insertAfter) {
            roundTabsContainer.insertBefore(tabEl, targetEl.nextElementSibling);
          } else {
            roundTabsContainer.insertBefore(tabEl, targetEl);
          }
        }
      });

      tabEl.addEventListener('pointerup', async (e) => {
        if (touchTimer) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }

        if (capturedPointerId === null) return;
        try { tabEl.releasePointerCapture(e.pointerId); } catch (_) {}
        capturedPointerId = null;

        // Touch long-press without moving -> open context menu (touch alternative to right-click)
        if (pointerType === 'touch' && longPressFired && !hasMovedDuringLongPress) {
          tabEl.classList.remove('is-tab-dragging');
          e.preventDefault();
          openGenericContextMenu(e, [
            {
              label: 'Rename',
              action: () => promptRenameRound(rItem),
            },
            {
              label: 'Delete Round',
              danger: true,
              disabled: rounds.length <= 1,
              action: () => confirmDeleteRound(rItem),
            },
          ], rItem.name);
          return;
        }

        if (isDragging) {
          isDragging = false;
          tabEl.classList.remove('is-tab-dragging');
          const orderedIds = Array.from(
            roundTabsContainer.querySelectorAll('.round-tab-item')
          ).map((el) => el.dataset.roundId);
          await store.reorderRounds(id, orderedIds);
          toast('Round order saved');
          e.preventDefault();
        }
      });

      tabEl.addEventListener('pointercancel', (e) => {
        if (touchTimer) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }
        if (capturedPointerId === null) return;
        try { tabEl.releasePointerCapture(e.pointerId); } catch (_) {}
        capturedPointerId = null;
        isDragging = false;
        tabEl.classList.remove('is-tab-dragging');
      });

      // Suppress click-navigation if drag or long-press was engaged
      tabEl.addEventListener('click', (e) => {
        if (isDragging || longPressFired) e.preventDefault();
      });

      return tabEl;
    });

    const addRoundBtn = h('button', {
      class: 'add-round-plus-btn',
      title: 'Add new round (+)',
      'aria-label': 'Add new round',
      onclick: promptAddRound,
    }, '+');

    roundTabsContainer.replaceChildren(...tabEls, addRoundBtn);

    // Scroll the strip so the active round is centred (no page scroll side effects)
    requestAnimationFrame(() => {
      const active = roundTabsContainer.querySelector('.round-tab-item.active');
      if (!active) return;
      const cr = roundTabsContainer.getBoundingClientRect();
      const ar = active.getBoundingClientRect();
      roundTabsContainer.scrollLeft += (ar.left + ar.width / 2) - (cr.left + cr.width / 2);
    });
  }

  // Mouse wheel scrolls the strip sideways when there are more rounds than fit
  roundTabsContainer.addEventListener('wheel', (e) => {
    if (roundTabsContainer.scrollWidth <= roundTabsContainer.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      roundTabsContainer.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });

  renderRoundTabs();

  // Breadcrumb & Head
  const headerEl = h('div', { class: 'workspace-header' },
    h('div', { class: 'crumbs' },
      h('a', { href: '#/' }, 'The Wall'), h('i', {}, '/'),
      h('span', {}, battle.title), h('i', {}, '/'),
      h('span', {}, activeRound.name)),
    h('div', { class: 'page-head workspace-head' },
      h('div', {},
        h('h1', { class: 'workspace-title' }, battle.title),
        h('span', { class: 'muted' }, [battle.opponentName && `vs ${battle.opponentName}`, battle.league].filter(Boolean).join(' · ') || 'Battle Workspace')),
      h('div', { class: 'row', style: 'gap: 8px;' },
        exportTxtBtn,
        togglePanelBtn)),
    roundTabsContainer);

  // Workspace A Containers (Full height writing column; pinned bar panel & compact rhyme bar removed)
  const editorHost = h('div', { class: 'editor-host' });
  const reopenPill = h('button', {
    class: 'workspace-reopen-pill',
    title: 'Open Supporting Tools (Rhymes, Schemes, Voice)',
    style: isPanelCollapsed ? 'display: inline-flex;' : 'display: none;',
    onclick: () => toggleSupportingPanel(false),
  }, h('span', { class: 'pill-label-desktop' }, '« Supporting Tools'),
     h('span', { class: 'pill-label-mobile' }, h('span', { class: 'pill-mobile-icon', 'aria-hidden': 'true' }, '≣'), ' Rhymes & Tools'));

  const workspaceMain = h('div', { class: 'workspace-main' },
    reopenPill,
    editorHost);

  // Vertical Draggable Divider
  const divider = h('div', {
    class: 'workspace-divider',
    title: 'Drag to resize supporting workspace',
    id: 'workspaceDivider',
  }, h('div', { class: 'divider-handle' }));

  // Workspace B Containers (Supporting panel with Rhymes default tab)
  const supportingTabsEl = h('div', { class: 'supporting-tabs' });
  const supportingDragHandle = h('div', { class: 'supporting-mobile-handle', 'aria-hidden': 'true' });
  const supportingCollapseBtn = h('button', {
    class: 'ghost-mini supporting-collapse-btn',
    title: 'Collapse Supporting Tools panel',
    onclick: () => toggleSupportingPanel(true),
  }, '»');

  const supportingHead = h('div', { class: 'supporting-head' },
    supportingDragHandle,
    supportingTabsEl,
    supportingCollapseBtn);

  const supportingContent = h('div', { class: 'supporting-content' });

  // Mobile Bottom Sheet Backdrop
  const mobileSheetBackdrop = h('div', {
    class: 'workspace-sheet-backdrop',
    onclick: () => toggleSupportingPanel(true),
  });

  const workspaceSupporting = h('div', {
    class: `workspace-supporting ${isPanelCollapsed ? 'is-collapsed' : ''}`,
    style: isPanelCollapsed ? 'display: none;' : `width: ${panelWidth}px;`,
  }, supportingHead, supportingContent);

  const splitWrapper = h('div', { class: 'workspace-split' },
    workspaceMain,
    divider,
    mobileSheetBackdrop,
    workspaceSupporting);

  function renderSupportingTabs() {
    supportingTabsEl.replaceChildren(...SUPPORTING_TABS.map((t) =>
      h('button', {
        class: `supporting-tab ${t.key === activeSupportingTab ? 'active' : ''}`,
        onclick: () => switchSupportingTab(t.key),
      }, t.label)));
  }

  async function switchSupportingTab(tabKey) {
    activeSupportingTab = tabKey;
    renderSupportingTabs();
    store.setSetting('workspace_supporting_tab', tabKey).catch(() => {});

    if (activeSupportingModule && activeSupportingModule.destroy) {
      try { await activeSupportingModule.destroy(); } catch (e) { console.error(e); }
      activeSupportingModule = null;
    }

    supportingContent.replaceChildren();

    // Rhymes tab uses its own internal scrolling so the top bar stays pinned
    if (tabKey === 'rhymes') {
      supportingContent.classList.add('tab-rhymes-active');
    } else {
      supportingContent.classList.remove('tab-rhymes-active');
    }

    if (tabKey === 'rhymes') {
      activeSupportingModule = mountRhymeBank(supportingContent, {
        battleId: id,
        roundId: activeRound.id,
        onInsertWord: (word) => {
          if (editorInstance) editorInstance.insertText(word + ' ');
        },
      });
    } else if (tabKey === 'schemes') {
      activeSupportingModule = await schemesView(supportingContent, {
        battleId: id,
        roundId: activeRound.id,
        editor: editorInstance,
      });
    } else if (tabKey === 'voice') {
      activeSupportingModule = await voiceNotesView(supportingContent, {
        battleId: id,
        roundId: activeRound.id,
      });
    }
  }

  async function toggleSupportingPanel(forceCollapse = null) {
    if (forceCollapse !== null) {
      isPanelCollapsed = forceCollapse;
    } else {
      isPanelCollapsed = !isPanelCollapsed;
    }

    if (isPanelCollapsed) {
      workspaceSupporting.classList.add('is-collapsed');
      workspaceSupporting.style.display = 'none';
      divider.style.display = 'none';
      mobileSheetBackdrop.classList.remove('active');
      reopenPill.style.display = 'inline-flex';
      togglePanelBtn.textContent = 'Show Supporting Tools ◨';
    } else {
      workspaceSupporting.classList.remove('is-collapsed');
      workspaceSupporting.style.display = '';
      if (window.innerWidth > 768) {
        workspaceSupporting.style.width = `${panelWidth}px`;
        divider.style.display = 'flex';
      } else {
        workspaceSupporting.style.width = '';
        divider.style.display = 'none';
        mobileSheetBackdrop.classList.add('active');
      }
      reopenPill.style.display = 'none';
      togglePanelBtn.textContent = 'Hide Supporting Tools ◫';
      if (!supportingContent.firstChild) {
        await switchSupportingTab(activeSupportingTab);
      }
    }
    // Don't let the phone bottom-sheet state overwrite the desktop panel preference.
    if (!isMobileViewport()) {
      try { localStorage.setItem('baraha_supporting_collapsed', String(isPanelCollapsed)); } catch {}
      await store.setSetting('workspace_supporting_collapsed', isPanelCollapsed);
    }
  }

  // Draggable divider implementation
  let isResizing = false;
  let startResizeX = 0;
  let startWidth = 0;

  function onMouseDown(e) {
    if (e.button !== 0) return;
    isResizing = true;
    startResizeX = e.clientX;
    startWidth = workspaceSupporting.getBoundingClientRect().width;
    document.body.classList.add('is-resizing');
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!isResizing) return;
    const splitRect = splitWrapper.getBoundingClientRect();
    const deltaX = startResizeX - e.clientX;
    let newWidth = startWidth + deltaX;

    const minWidth = 260;
    const maxWidth = Math.max(minWidth, splitRect.width * 0.55);

    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    panelWidth = Math.round(newWidth);
    workspaceSupporting.style.width = `${panelWidth}px`;
    try { localStorage.setItem('baraha_supporting_width', String(panelWidth)); } catch {}
  }

  function onMouseUp() {
    if (!isResizing) return;
    isResizing = false;
    document.body.classList.remove('is-resizing');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    try { localStorage.setItem('baraha_supporting_width', String(panelWidth)); } catch {}
    store.setSetting('workspace_supporting_width', panelWidth).catch(() => {});
  }

  divider.addEventListener('mousedown', onMouseDown);

  // Mount Text Editor (Draft round has isDraft: true to omit Mark Completed button)
  const isDraftRound = activeRound.kind === 'draft';
  editorInstance = mountTextEditor(editorHost, {
    label: `${activeRound.name}`,
    placeholder: isDraftRound
      ? 'Write draft ideas, scratchpad notes, bars, and concept angles here…'
      : `Write ${activeRound.name} here…\n\nPreserve rhymes, Taglish, flow markers, and punches. What you type is saved faithfully.`,
    battleId: id,
    roundId: activeRound.id,
    roundNumber: activeRound.number || 1,
    isDraft: isDraftRound,
    load: async () => (await store.getFinalMaterial(activeRound.id))?.text ?? '',
    save: (text) => store.saveFinalMaterial(activeRound.id, id, text),
    onRhymeSearch: (query) => {
      if (activeSupportingTab !== 'rhymes') {
        switchSupportingTab('rhymes');
      }
      if (activeSupportingModule && activeSupportingModule.search) {
        activeSupportingModule.search(query);
      }
    },
    onSaveRhyme: (query) => {
      if (activeSupportingModule && activeSupportingModule.openSaveDialog) {
        activeSupportingModule.openSaveDialog(query);
      }
    },
    onOpenFindBar: () => {
      if (findBarInstance) findBarInstance.open();
    },
  });

  await editorInstance.ready;
  editorInstance.focus();

  // Mount Find in Round bar (Ctrl+F) docked inside the writing area
  const editorAreaEl = editorHost.querySelector('.editor-area') || editorHost;
  const richEditorEl = editorHost.querySelector('.editor.rich-editor') || editorHost;
  findBarInstance = mountFindBar(workspaceMain, richEditorEl);

  // Global Workspace Keyboard Shortcuts (Ctrl+F for Find Bar, Ctrl+/ for Search)
  const onGlobalShortcuts = (e) => {
    // Ctrl + F / Cmd + F: Open scoped Find in Round bar
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      findBarInstance.open();
    }
    // Ctrl + / : Global Search
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      location.hash = '#/search';
    }
  };
  window.addEventListener('keydown', onGlobalShortcuts);

  // Render initial Workspace B tabs and content
  renderSupportingTabs();
  if (!isPanelCollapsed) {
    await switchSupportingTab(activeSupportingTab);
  }

  root.replaceChildren(h('div', { class: 'page workspace-studio' },
    headerEl,
    splitWrapper));

  return {
    destroy: async () => {
      divider.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onGlobalShortcuts);
      document.body.classList.remove('is-resizing');

      if (findBarInstance && findBarInstance.destroy) {
        findBarInstance.destroy();
      }
      if (editorInstance && editorInstance.destroy) {
        await editorInstance.destroy();
      }
      if (activeSupportingModule && activeSupportingModule.destroy) {
        await activeSupportingModule.destroy();
      }
    },
  };
}
