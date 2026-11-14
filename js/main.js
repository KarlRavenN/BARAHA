import { createIndexedDbBackend } from './core/db.js';
import { setBackend, migrateRoundsAndDrafts } from './core/store.js';
import { route, startRouter } from './core/router.js';
import { h } from './core/ui.js';
import { dashboardView } from './modules/dashboard.js';
import { workspaceView } from './modules/workspace.js';
import { opponentsView } from './modules/opponents.js';
import { lineCheckerView } from './modules/line-checker.js';
import { searchView } from './modules/search.js';
import { voiceNotesView } from './modules/voice-notes.js';
import { settingsView } from './modules/settings.js';
import { mountAuthFlow } from './modules/auth-screens.js';
import { buildAccountMenu } from './components/account-menu.js';
import { getUser, onAuthChange } from './core/auth.js';

const view = document.getElementById('view');
const nav = document.getElementById('nav');

function makeNavIcon(svgStr) {
  const span = document.createElement('span');
  span.className = 'nav-icon-wrap';
  span.innerHTML = svgStr;
  return span;
}

const NAV_ICONS = {
  'The Wall': '<svg viewBox="0 0 20 20" class="nav-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h14v12H3z"/><path d="M3 9h14M8 4v5M13 9v7"/></svg>',
  Dashboard: '<svg viewBox="0 0 20 20" class="nav-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h14v12H3z"/><path d="M3 9h14M8 4v5M13 9v7"/></svg>',
  'Opponent Research': '<svg viewBox="0 0 20 20" class="nav-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3"/><circle cx="10" cy="10" r="2"/></svg>',
  'Line Checker': '<svg viewBox="0 0 20 20" class="nav-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h16M2 10h16M2 15h16M5 2v16M11 2v16M15 2v16"/></svg>',
  'Global Search': '<svg viewBox="0 0 20 20" class="nav-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4.5 4.5M6 8.5h5"/></svg>',
  'Voice Inbox': '<svg viewBox="0 0 20 20" class="nav-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="6" height="9" rx="3"/><path d="M4 9a6 6 0 0012 0M10 15v3M7 18h6"/></svg>',
  Settings: '<svg viewBox="0 0 20 20" class="nav-icon" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3a3.5 3.5 0 00-3.2 4.9L4 15.2a1.5 1.5 0 002.1 2.1l7.3-7.3A3.5 3.5 0 1014.5 3z"/></svg>',
};

const NAV = [
  { href: '#/', label: 'The Wall', match: (p) => p === '/' },
  { href: '#/opponents', label: 'Opponent Research', match: (p) => p.startsWith('/opponents') },
  { href: '#/line-checker', label: 'Line Checker', match: (p) => p.startsWith('/line-checker') },
  { href: '#/search', label: 'Global Search', match: (p) => p.startsWith('/search') },
  { href: '#/voice', label: 'Voice Inbox', match: (p) => p.startsWith('/voice') },
  { href: '#/settings', label: 'Settings', match: (p) => p.startsWith('/settings') },
];

// Current signed-in user, kept in sync by onAuthChange
let currentUser = null;

function drawNav(path) {
  let isDrawerOpen = false;

  const toggleDrawer = (forceState = null) => {
    isDrawerOpen = forceState !== null ? forceState : !isDrawerOpen;
    nav.classList.toggle('drawer-open', isDrawerOpen);
    let backdrop = document.getElementById('mobileNavBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'mobileNavBackdrop';
      backdrop.className = 'mobile-nav-backdrop';
      backdrop.onclick = () => toggleDrawer(false);
      (document.getElementById('app') || document.body).appendChild(backdrop);
    }
    backdrop.classList.toggle('active', isDrawerOpen);
  };

  const burgerBtn = h('button', {
    class: 'mobile-nav-burger-btn',
    title: 'Toggle Navigation Menu',
    'aria-label': 'Toggle Navigation',
    onclick: (e) => {
      e.stopPropagation();
      toggleDrawer();
    },
  }, '☰');

  const closeBtn = h('button', {
    class: 'mobile-nav-close-btn',
    title: 'Close Navigation',
    'aria-label': 'Close Navigation',
    onclick: () => toggleDrawer(false),
  }, '✕');

  // Account menu at the bottom of the nav
  const accountSection = currentUser
    ? h('div', { class: 'nav-account-wrap' },
        buildAccountMenu(currentUser, () => {
          // After sign out, reload to show auth gate
          window.location.reload();
        })
      )
    : null;

  nav.replaceChildren(
    h('div', { class: 'brand mobile-brand-bar' },
      h('a', { class: 'brand-tag brand-home-link', href: '#/', title: 'Go to The Wall', 'aria-label': 'BARAHA, go to The Wall', onclick: () => toggleDrawer(false) },
        h('b', {}, 'BAR', h('span', { class: 'brand-accent' }, 'A'), 'HA')
      ),
      burgerBtn
    ),
    h('div', { class: 'nav-drawer-header' },
      h('a', { class: 'brand-tag brand-home-link', href: '#/', title: 'Go to The Wall', 'aria-label': 'BARAHA, go to The Wall', onclick: () => toggleDrawer(false) },
        h('b', {}, 'BAR', h('span', { class: 'brand-accent' }, 'A'), 'HA')
      ),
      closeBtn
    ),
    h('div', { class: 'nav-links-wrap' },
      ...NAV.map((n) => h('a', {
        class: `nav-link ${n.match(path) ? 'active' : ''}`,
        href: n.href,
        onclick: () => toggleDrawer(false),
      },
      makeNavIcon(NAV_ICONS[n.label] || ''),
      h('span', { class: 'nav-label-text' }, n.label)))
    ),
    h('div', { class: 'nav-footer' },
      ...(accountSection ? [accountSection] : []),
      h('div', { class: 'nav-credo faint' }, '"Every bar is a card."')
    )
  );
}

document.addEventListener('baraha:route', (e) => {
  drawNav(e.detail.path);
  const backdrop = document.getElementById('mobileNavBackdrop');
  if (backdrop) backdrop.classList.remove('active');
  nav.classList.remove('drawer-open');
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.classList.contains('drawer-open')) {
    nav.classList.remove('drawer-open');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (backdrop) backdrop.classList.remove('active');
  }
});

function fatal(message) {
  view.replaceChildren(h('div', { class: 'page' },
    h('h1', {}, 'BARAHA cannot start'),
    h('p', { class: 'notice' }, message)));
}

async function startApp() {
  if (!('indexedDB' in window)) return fatal('This browser does not support IndexedDB, which BARAHA needs to save your work.');
  try {
    setBackend(await createIndexedDbBackend());
    await migrateRoundsAndDrafts();
  } catch (e) {
    console.error(e);
    return fatal(`Could not open local storage: ${e.message}. Private/incognito windows may block it.`);
  }
  try { await navigator.storage?.persist?.(); } catch { /* optional */ }

  const guard = (fn) => async (params) => {
    try {
      return await fn(view, params);
    } catch (e) {
      console.error(e);
      fatal(`Something went wrong loading this page: ${e.message}`);
      return null;
    }
  };

  route('/', guard(dashboardView));
  route('/battles', () => { location.hash = '#/'; });
  route('/battle/:id/:round/:section', guard((v, p) => workspaceView(v, p)));
  route('/battle/:id/:round', guard((v, p) => workspaceView(v, { ...p, section: 'final' })));
  route('/battle/:id', guard((v, p) => workspaceView(v, { ...p, round: '1', section: 'final' })));
  route('/opponents', guard(opponentsView));
  route('/line-checker', guard(lineCheckerView));
  route('/search', guard(searchView));
  route('/voice', guard((v) => voiceNotesView(v, { isGlobalInbox: true })));
  route('/settings', guard(settingsView));

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      location.hash = '#/search';
    }
    if (e.key === 'Escape') {
      const scrim = document.querySelector('.scrim');
      if (scrim) scrim.remove();
    }
  });

  // Subtle 2-4px environmental wall shift on mouse movement
  let lastMove = 0;
  window.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastMove < 25) return;
    lastMove = now;
    const shiftX = ((e.clientX / window.innerWidth) - 0.5) * 4;
    const shiftY = ((e.clientY / window.innerHeight) - 0.5) * 4;
    document.documentElement.style.setProperty('--wall-shift-x', `${shiftX.toFixed(1)}px`);
    document.documentElement.style.setProperty('--wall-shift-y', `${shiftY.toFixed(1)}px`);
  }, { passive: true });

  // Draw the nav now that we know the user
  drawNav(location.hash.slice(1) || '/');

  await startRouter();
}

async function boot() {
  // Keep currentUser in sync whenever the session changes
  onAuthChange((event, session) => {
    currentUser = session?.user ?? null;
    // Redraw nav to show/hide account menu
    drawNav(location.hash.slice(1) || '/');

    // If the user signed out while the app is running, show the auth gate
    if (event === 'SIGNED_OUT') {
      window.location.reload();
    }
  });

  // Check for an existing session first
  currentUser = await getUser();

  if (currentUser) {
    // Already signed in — go straight to the app
    await startApp();
  } else {
    // No session — show the auth flow over the whole screen
    const authContainer = document.createElement('div');
    document.body.appendChild(authContainer);

    mountAuthFlow(authContainer, async () => {
      // User just signed in — get the fresh user object and launch the app
      currentUser = await getUser();
      authContainer.remove();
      await startApp();
    });
  }
}

boot();
