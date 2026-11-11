import { h, toast, confirmDialog } from '../core/ui.js';
import { go } from '../core/router.js';
import { timeAgo, formatDate, getBattleCountdown } from '../core/util.js';
import * as store from '../core/store.js';
import { battleFormDialog } from './battle-form.js';
import { attachWallDrag } from '../components/wall-drag.js';

function makeThumbtackSvg(isPinned) {
  const span = document.createElement('span');
  span.className = 'card-pin-icon-wrap';
  span.innerHTML = `<svg viewBox="0 0 20 20" width="15" height="15" class="card-thumbtack-svg ${isPinned ? 'is-pinned' : ''}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3l10 10-2 2-3-1-4 4-1 1-2-2 1-1 4-4-1-3 2-2z" />
    <line x1="8" y1="12" x2="2" y2="18" stroke-width="2" />
    <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" />
  </svg>`;
  return span;
}


// Themed group-heading icons (same rough hand-drawn marker style as the card thumbtack)
function makeWallTagPinSvg() {
  const span = document.createElement('span');
  span.className = 'wall-tag-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3l10 10-2 2-3-1-4 4-1 1-2-2 1-1 4-4-1-3 2-2z" />
    <line x1="8" y1="12" x2="2" y2="18" stroke-width="2" />
    <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" />
  </svg>`;
  return span;
}

function makeWallTagBrickSvg(size = 15) {
  const span = document.createElement('span');
  span.className = 'wall-tag-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2.5 4.5h15v11h-15z" />
    <path d="M2.5 8.2h15M2.5 11.8h15" />
    <path d="M9.5 4.5v3.7M6 8.2v3.6M13.2 8.2v3.6M9.5 11.8v3.7" />
  </svg>`;
  return span;
}

function makeLocationPinSvg() {
  const span = document.createElement('span');
  span.className = 'card-meta-icon card-marker-icon-wrap';
  span.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" class="poster-footer-marker-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 1.5c-2.4 0-4.3 1.9-4.3 4.3 0 3.2 4.3 8.7 4.3 8.7s4.3-5.5 4.3-8.7c0-2.4-1.9-4.3-4.3-4.3z" />
    <circle cx="8" cy="5.8" r="1.5" fill="currentColor" />
  </svg>`;
  return span;
}

function makeClockSvg() {
  const span = document.createElement('span');
  span.className = 'card-meta-icon card-marker-icon-wrap';
  span.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" class="poster-footer-marker-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8" cy="8" r="6" />
    <polyline points="8 4.2 8 8 10.8 9.8" stroke-width="1.8" />
  </svg>`;
  return span;
}

function makeSearchMagnifierSvg() {
  const span = document.createElement('span');
  span.className = 'wall-search-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 18 18" width="15" height="15" class="wall-search-marker-svg" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="7.5" cy="7.5" r="5" />
    <line x1="11.5" y1="11.5" x2="16" y2="16" stroke-width="2.2" />
  </svg>`;
  return span;
}

export async function dashboardView(root) {
  const d = await store.getDashboardData();
  const allBattles = d.activeBattles || [];
  const archivedBattles = d.archivedBattles || [];

  async function quickCreateBattle() {
    const v = await battleFormDialog();
    if (!v) return;
    const { battle, rounds } = await store.createBattle(v);
    toast('Battle created');
    const firstRoundId = rounds[0]?.id || '1';
    go(`/battle/${battle.id}/${firstRoundId}/final`);
  }

  // Dropdown menu for Battle Cards on The Wall
  function openCardMenu(e, battle) {
    e.stopPropagation();
    e.preventDefault();

    const existing = document.querySelector('.card-menu-dropdown');
    if (existing) {
      const wasSame = existing.dataset.battleId === battle.id;
      existing.remove();
      if (wasSame) return;
    }

    const triggerBtn = e.currentTarget;
    const rect = triggerBtn.getBoundingClientRect();

    const menu = h('div', {
      class: 'card-menu-dropdown',
      'data-battle-id': battle.id,
      style: `position: fixed; top: ${rect.bottom + 6}px; right: ${Math.max(12, window.innerWidth - rect.right)}px; z-index: 1200;`,
    });

    const pinItem = h('button', {
      class: 'menu-item-btn',
      onclick: async (ev) => {
        ev.stopPropagation();
        menu.remove();
        await store.toggleBattlePin(battle.id);
        toast(battle.pinned ? 'Unpinned from wall' : 'Pinned to wall top');
        dashboardView(root);
      },
    }, battle.pinned ? 'Unpin from Wall' : 'Pin to Wall');

    const statusOptions = ['Writing', 'Completed', 'Dropped'];
    const statusSubmenu = h('div', { class: 'menu-status-options' },
      ...statusOptions.map((st) => h('button', {
        class: `menu-sub-item ${battle.status === st ? 'active' : ''}`,
        onclick: async (ev) => {
          ev.stopPropagation();
          menu.remove();
          await store.updateBattle(battle.id, { status: st });
          toast(`Status set to ${st}`);
          dashboardView(root);
        },
      },
        h('span', { class: `status-indicator-dot status-${st.toLowerCase()}` }),
        st
      ))
    );

    const changeStatusItem = h('div', { class: 'menu-item has-sub' },
      h('div', { class: 'menu-item-row' },
        h('span', {}, 'Change Status'),
        h('span', { class: 'arrow' }, '▶')
      ),
      statusSubmenu
    );

    const editItem = h('button', {
      class: 'menu-item-btn',
      onclick: async (ev) => {
        ev.stopPropagation();
        menu.remove();
        const updated = await battleFormDialog(battle);
        if (updated) {
          await store.updateBattle(battle.id, updated);
          toast('Battle updated');
          dashboardView(root);
        }
      },
    }, 'Edit Battle');

    const archiveItem = h('button', {
      class: 'menu-item-btn',
      onclick: async (ev) => {
        ev.stopPropagation();
        menu.remove();
        const ok = await confirmDialog({
          title: 'Archive battle',
          message: `Archive "${battle.title}"? You can view or restore it anytime from the Archive tab on The Wall.`,
          confirmLabel: 'Archive battle',
        });
        if (ok) {
          await store.setArchived(battle.id, true);
          toast('Battle moved to Archive');
          dashboardView(root);
        }
      },
    }, 'Archive');

    menu.append(pinItem, changeStatusItem, editItem, archiveItem);
    document.body.append(menu);

    const closeMenu = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== triggerBtn) {
        menu.remove();
        document.removeEventListener('pointerdown', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', closeMenu), 10);
  }

  // Active Battle Poster Card on "THE WALL"
  const renderBattlePoster = (b) => {
    const opponentText = b.opponentName ? b.opponentName : 'Opponent TBA';
    const leagueText = (b.league || 'BATTLE RAP').toUpperCase();
    const statusText = (b.status || 'Writing').toUpperCase();
    const statusClass = (b.status || 'Writing').toLowerCase();
    const bRounds = (b.rounds || []).filter((x) => x.kind !== 'draft');
    const firstRoundId = b.rounds?.[0]?.id || '1';

    const pinBtn = h('button', {
      class: `card-pin-btn ${b.pinned ? 'is-pinned' : ''}`,
      title: b.pinned ? 'Unpin from wall' : 'Pin to top',
      'aria-label': b.pinned ? 'Unpin battle' : 'Pin battle',
      onclick: async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await store.toggleBattlePin(b.id);
        toast(b.pinned ? 'Unpinned from wall' : 'Pinned to wall top');
        dashboardView(root);
      },
    }, makeThumbtackSvg(b.pinned));

    const cardMenuBtn = h('button', {
      class: 'card-menu-btn',
      title: 'Battle options',
      'aria-label': `Menu for ${b.title}`,
      onclick: (e) => openCardMenu(e, b),
    }, '≣');

    const roundIndicators = bRounds.map((r, idx) => {
      const isCompleted = !!r.completed;
      let label = `R${idx + 1}`;
      if (r.name) {
        const m = r.name.match(/^Round\s*(\d+)$/i);
        if (m) {
          label = `R${m[1]}`;
        } else {
          label = r.name.replace(/\s+/g, '').slice(0, 4).toUpperCase();
        }
      }
      return h('a', {
        class: `round-stencil-indicator ${isCompleted ? 'completed sprayed' : 'in-progress'}`,
        href: `#/battle/${b.id}/${r.id}/final`,
        title: `${r.name || 'Round ' + (idx + 1)}: ${isCompleted ? 'Completed (Click to edit)' : 'Writing'}`,
        onclick: (e) => e.stopPropagation(),
      },
        h('span', { class: 'round-stencil-text' }, label),
        isCompleted ? h('span', { class: 'spray-burst-paint' }) : null
      );
    });

    const isCompleted = b.status === 'Completed';
    const isDropped = b.status === 'Dropped';

    // Stable pseudo-random angle (-2.8deg to +2.8deg) based on battle id hash
    function getStableAngle(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
      const normalized = ((Math.abs(hash) % 56) - 28) / 10; // -2.8 to +2.8
      return normalized === 0 ? 1.5 : normalized;
    }

    // Battle Countdown Stamp: active battles only with battleDate
    let countdownStampEl = null;
    if (!b.archived && !isCompleted && !isDropped && b.battleDate) {
      const countdown = getBattleCountdown(b.battleDate);
      if (countdown) {
        const rot = getStableAngle(b.id || b.title);
        countdownStampEl = h('div', {
          class: `card-countdown-stamp urgency-${countdown.urgency}`,
          style: `transform: rotate(${rot}deg);`,
          title: `Battle date: ${formatDate(b.battleDate)} (${countdown.label})`,
        }, countdown.label);
      }
    }

    return h('div', {
      class: `battle-poster-card battle-wall-card dashboard-card-item item ${b.pinned ? 'is-pinned-card' : ''} status-${statusClass} ${isCompleted ? 'card-dimmed-completed' : ''} ${isDropped ? 'card-dimmed-dropped' : ''}`,
      'data-battle-id': b.id,
      'data-status': b.status || 'Writing',
      title: `Open ${b.title}`,
      onclick: () => go(`/battle/${b.id}/${firstRoundId}/final`),
    },
      // Worn masking tape on the poster
      h('div', { class: 'card-masking-tape', 'aria-hidden': 'true' }),

      // Top row: Pin on far left, Status, Stamp, Last edited & Menu on right
      h('div', { class: 'card-top-row' },
        h('div', { class: 'card-status-col' },
          pinBtn,
          h('span', { class: `battle-status-badge status-${statusClass}` }, statusText)
        ),
        countdownStampEl,
        h('div', { class: 'card-time-menu-col' },
          h('span', { class: 'card-edited-time faint' }, `Edited ${timeAgo(b.lastOpenedAt || b.updatedAt)}`),
          cardMenuBtn
        )
      ),

      // Main Title: dominates the card
      h('div', { class: 'card-main-title' }, b.title),

      // Secondary: Opponent and League
      h('div', { class: 'card-sub-info' },
        h('div', { class: 'card-opponent-line' }, `vs ${opponentText}`),
        h('div', { class: 'card-league-line' }, leagueText)
      ),

      // Round Progress: Non-draft rounds rough stencil with spray paint effect
      h('div', { class: 'card-rounds-row' },
        ...roundIndicators
      ),

      // Divider
      h('div', { class: 'card-divider' }),

      // Footer: Location and Date with custom hand-marker SVGs
      h('div', { class: 'card-footer-vertical' },
        h('div', { class: 'card-footer-loc-line' },
          makeLocationPinSvg(),
          h('span', { class: 'card-footer-location' }, (b.location || 'VENUE TBA').toUpperCase())
        ),
        h('div', { class: 'card-footer-date-line' },
          makeClockSvg(),
          h('span', { class: 'card-footer-date' }, b.battleDate ? formatDate(b.battleDate) : (b.createdAt ? formatDate(b.createdAt) : 'DATE TBA'))
        )
      )
    );
  };

  // Archived Battle Poster Card (No drag, no pin; Restore and Delete forever actions)
  const renderArchivedPoster = (b) => {
    const opponentText = b.opponentName ? b.opponentName : 'Opponent TBA';
    const leagueText = (b.league || 'BATTLE RAP').toUpperCase();
    const statusClass = (b.status || 'Writing').toLowerCase();
    const firstRoundId = b.rounds?.[0]?.id || '1';

    const restoreBtn = h('button', {
      class: 'ghost small-btn restore-card-btn',
      title: `Restore "${b.title}" to The Wall`,
      onclick: async (e) => {
        e.stopPropagation();
        await store.setArchived(b.id, false);
        toast(`Restored "${b.title}" to The Wall`);
        dashboardView(root);
      },
    }, '↶ Restore');

    const deleteForeverBtn = h('button', {
      class: 'ghost small-btn danger delete-forever-btn',
      title: `Permanently delete "${b.title}"`,
      onclick: async (e) => {
        e.stopPropagation();
        const ok = await confirmDialog({
          title: 'Delete battle forever',
          message: `Permanently delete "${b.title}"? All rounds and written material will be removed. This cannot be undone.`,
          confirmLabel: 'Delete forever',
          danger: true,
        });
        if (ok) {
          await store.deleteBattle(b.id);
          toast('Battle permanently deleted');
          dashboardView(root);
        }
      },
    }, '✕ Delete forever');

    return h('div', {
      class: `battle-poster-card battle-wall-card archived-poster-card item status-${statusClass} card-dimmed-completed`,
      'data-battle-id': b.id,
      title: `Archived: ${b.title}`,
      onclick: () => go(`/battle/${b.id}/${firstRoundId}/final`),
    },
      h('div', { class: 'card-masking-tape', 'aria-hidden': 'true' }),
      h('div', { class: 'card-top-row' },
        h('div', { class: 'card-status-col' },
          h('span', { class: 'battle-status-badge status-archived' }, 'ARCHIVED')
        ),
        h('div', { class: 'card-time-menu-col' },
          h('span', { class: 'card-edited-time faint' }, `Archived · ${timeAgo(b.updatedAt)}`)
        )
      ),
      h('div', { class: 'card-main-title' }, b.title),
      h('div', { class: 'card-sub-info' },
        h('div', { class: 'card-opponent-line' }, `vs ${opponentText}`),
        h('div', { class: 'card-league-line' }, leagueText)
      ),
      h('div', { class: 'card-divider' }),
      h('div', { class: 'card-footer-vertical' },
        h('div', { class: 'card-footer-loc-line' },
          makeLocationPinSvg(),
          h('span', { class: 'card-footer-location' }, (b.location || 'VENUE TBA').toUpperCase())
        ),
        h('div', { class: 'card-footer-date-line' },
          makeClockSvg(),
          h('span', { class: 'card-footer-date' }, b.battleDate ? formatDate(b.battleDate) : (b.createdAt ? formatDate(b.createdAt) : 'DATE TBA'))
        )
      ),
      h('div', { class: 'archived-card-actions-row' },
        restoreBtn,
        deleteForeverBtn
      )
    );
  };

  // Stats line under THE WALL: battles · schemes · voice takes (drafts removed)
  const subtleStatsSummary = h('div', { class: 'small faint dashboard-summary-bar' },
    `${d.totals.battles} battle${d.totals.battles === 1 ? '' : 's'} (${d.totals.activeBattles} active) · ${d.totals.schemes} schemes · ${d.totals.voiceNotes} voice takes`
  );

  // Filter state
  let currentSearchQuery = '';
  let currentStatusFilter = 'All';

  // Toolbar search input + clear button
  const searchInput = h('input', {
    type: 'text',
    class: 'wall-search-input',
    placeholder: 'Search battle',
    'aria-label': 'Search battle',
  });

  const clearSearchBtn = h('button', {
    class: 'wall-search-clear-btn',
    title: 'Clear search',
    style: 'display: none;',
    onclick: () => {
      searchInput.value = '';
      currentSearchQuery = '';
      clearSearchBtn.style.display = 'none';
      applyFilter();
      searchInput.focus();
    },
  }, '✕');

  searchInput.addEventListener('input', () => {
    currentSearchQuery = searchInput.value.trim().toLowerCase();
    clearSearchBtn.style.display = currentSearchQuery ? 'inline-flex' : 'none';
    applyFilter();
  });

  // Global Keyboard shortcuts: Ctrl+K or / to focus search silently
  const onSearchShortcut = (e) => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === '/' && !isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  };
  window.addEventListener('keydown', onSearchShortcut);

  // Status Filter Chips: All / Writing / Completed / Dropped | Archive (count)
  const statusChips = ['All', 'Writing', 'Completed', 'Dropped'].map((st) =>
    h('button', {
      class: `wall-filter-chip ${st === currentStatusFilter ? 'active' : ''}`,
      'data-status': st,
      onclick: (e) => {
        currentStatusFilter = st;
        chipContainer.querySelectorAll('.wall-filter-chip').forEach((c) => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        applyFilter();
      },
    }, st)
  );

  const archiveChip = h('button', {
    class: `wall-filter-chip wall-archive-chip ${currentStatusFilter === 'Archive' ? 'active' : ''}`,
    'data-status': 'Archive',
    onclick: (e) => {
      currentStatusFilter = 'Archive';
      chipContainer.querySelectorAll('.wall-filter-chip').forEach((c) => c.classList.remove('active'));
      e.currentTarget.classList.add('active');
      applyFilter();
    },
  }, `Archive (${archivedBattles.length})`);

  const chipContainer = h('div', { class: 'wall-status-chips-wrap' },
    ...statusChips,
    h('span', { class: 'wall-chips-separator', 'aria-hidden': 'true' }),
    archiveChip
  );

  const searchBoxWrap = h('div', { class: 'wall-search-box-wrap' },
    makeSearchMagnifierSvg(),
    searchInput,
    clearSearchBtn
  );

  const activeCountBadge = h('span', { class: 'active-posters-count small faint' },
    `${allBattles.length} Active Poster${allBattles.length === 1 ? '' : 's'}`
  );

  const newBattleBtn = h('button', {
    class: 'primary new-battle-btn',
    onclick: quickCreateBattle,
  }, '+ New battle');

  const toolbarRow = h('div', { class: 'wall-toolbar-row' },
    h('div', { class: 'wall-search-left-col' },
      searchBoxWrap,
      chipContainer
    ),
    h('div', { class: 'wall-toolbar-right-col' },
      newBattleBtn,
      activeCountBadge
    )
  );

  // Grids for Pinned and Others
  const pinnedGrid = h('div', { class: 'poster-wall-grid pinned-grid' });
  const othersGrid = h('div', { class: 'poster-wall-grid others-grid' });

  const pinnedSectionHeader = h('div', { class: 'wall-group-header' },
    h('span', { class: 'wall-group-tag' }, makeWallTagPinSvg(), 'PINNED TO THE WALL')
  );
  const othersSectionHeader = h('div', { class: 'wall-group-header' },
    h('span', { class: 'wall-group-tag' }, makeWallTagBrickSvg(), 'POSTERS')
  );
  const archiveSectionHeader = h('div', { class: 'wall-group-header' },
    h('span', { class: 'wall-group-tag' }, '📦 ARCHIVED FLYERS')
  );

  const emptyFilterMsg = h('div', { class: 'wall-empty-filter-wrap empty' },
    makeSearchMagnifierSvg(),
    h('div', { class: 'empty-state-title' }, 'Nothing on the wall matches that'),
    h('div', { class: 'empty-state-desc faint' }, 'Try checking a different status or searching by opponent, league or venue.')
  );

  const emptyArchiveMsg = h('div', { class: 'empty-state-wrap empty' },
    h('div', { class: 'empty-state-icon' }, '📦'),
    h('div', { class: 'empty-state-title' }, 'Archive is empty'),
    h('div', { class: 'empty-state-desc faint' }, 'Completed or retired battles you archive from card menus will hang here.')
  );

  const emptyWallMsg = h('div', { class: 'empty-state-wrap empty' },
    h('div', { class: 'empty-state-icon wall-empty-brick' }, makeWallTagBrickSvg(44)),
    h('div', { class: 'empty-state-title' }, "The wall's empty"),
    h('div', { class: 'empty-state-desc' }, 'Tape up your first battle flyer. Create your battle structure and write your bars.'),
    h('button', { class: 'primary', onclick: quickCreateBattle }, 'New battle')
  );

  const wallCardsContainer = h('div', { class: 'wall-cards-container' });

  function isFilterActive() {
    return Boolean(currentSearchQuery) || currentStatusFilter !== 'All';
  }

  function matchesQuery(b) {
    if (!currentSearchQuery) return true;
    const text = [
      b.title,
      b.opponentName,
      b.league,
      b.location,
      b.status,
    ].filter(Boolean).join(' ').toLowerCase();
    return text.includes(currentSearchQuery);
  }

  function applyFilter() {
    // 1. Archive View
    if (currentStatusFilter === 'Archive') {
      const filteredArchived = archivedBattles.filter(matchesQuery);
      activeCountBadge.textContent = currentSearchQuery
        ? `${filteredArchived.length} Archived Poster${filteredArchived.length === 1 ? '' : 's'} found`
        : `${archivedBattles.length} Archived Poster${archivedBattles.length === 1 ? '' : 's'}`;

      if (archivedBattles.length === 0) {
        wallCardsContainer.replaceChildren(emptyArchiveMsg);
        return;
      }
      if (filteredArchived.length === 0) {
        wallCardsContainer.replaceChildren(emptyFilterMsg);
        return;
      }
      othersGrid.replaceChildren(...filteredArchived.map(renderArchivedPoster));
      wallCardsContainer.replaceChildren(archiveSectionHeader, othersGrid);
      return;
    }

    // 2. Active The Wall Views
    if (allBattles.length === 0) {
      wallCardsContainer.replaceChildren(emptyWallMsg);
      activeCountBadge.textContent = '0 Posters';
      return;
    }

    const filtered = allBattles.filter((b) => {
      if (currentStatusFilter !== 'All' && b.status !== currentStatusFilter) {
        return false;
      }
      return matchesQuery(b);
    });

    activeCountBadge.textContent = isFilterActive()
      ? `${filtered.length} Poster${filtered.length === 1 ? '' : 's'} found`
      : `${allBattles.length} Active Poster${allBattles.length === 1 ? '' : 's'}`;

    if (filtered.length === 0) {
      wallCardsContainer.replaceChildren(emptyFilterMsg);
      return;
    }

    const pinned = filtered.filter((b) => b.pinned);
    const unpinned = filtered.filter((b) => !b.pinned);

    pinnedGrid.replaceChildren(...pinned.map(renderBattlePoster));
    othersGrid.replaceChildren(...unpinned.map(renderBattlePoster));

    const children = [];
    if (pinned.length > 0) {
      children.push(pinnedSectionHeader, pinnedGrid);
      if (unpinned.length > 0) {
        children.push(othersSectionHeader, othersGrid);
      }
    } else {
      children.push(othersGrid);
    }

    wallCardsContainer.replaceChildren(...children);
  }

  // Initial render of cards
  applyFilter();

  // Attach Drag & Drop handlers (active only for non-archive unpinned & pinned)
  const pinnedDrag = attachWallDrag(pinnedGrid, {
    isPinned: true,
    isSearchActive: isFilterActive,
    onReorder: async (orderedIds) => {
      const now = new Date().toISOString();
      const updates = orderedIds.map((id, index) => ({
        id,
        pinOrder: index,
        wallOrderedAt: now,
      }));
      await store.updateBattlesOrder(updates);
      toast('Pinned wall order updated');
    },
  });

  const othersDrag = attachWallDrag(othersGrid, {
    isPinned: false,
    isSearchActive: isFilterActive,
    onReorder: async (orderedIds) => {
      if (currentStatusFilter === 'Archive') return; // no drag in archive
      const now = new Date().toISOString();
      const updates = orderedIds.map((id, index) => ({
        id,
        wallOrder: index,
        wallOrderedAt: now,
      }));
      await store.updateBattlesOrder(updates);
      toast('Wall order updated');
    },
  });

  // Mount into page view
  root.replaceChildren(h('div', { class: 'page dashboard-page' },
    h('div', { class: 'wall-header-section' },
      h('div', { class: 'wall-title-area' },
        h('div', { class: 'wall-logo-row' },
          h('div', { class: 'brand-tag header-brand-tag' },
            h('b', {}, 'BAR', h('span', { class: 'brand-accent' }, 'A'), 'HA')
          ),
          h('span', { class: 'wall-venue-subtitle faint' }, 'UNDERGROUND VENUE · WRITER STUDIO')
        ),
        h('h1', { class: 'the-wall-huge-banner' }, 'THE WALL'),
        subtleStatsSummary
      )
    ),

    toolbarRow,
    wallCardsContainer
  ));

  return {
    destroy: () => {
      window.removeEventListener('keydown', onSearchShortcut);
      pinnedDrag.destroy();
      othersDrag.destroy();
    },
  };
}
