// Account menu shown in the nav when the user is signed in.
// Displays display name + email, and a Sign out button.

import { h } from '../core/ui.js';
import { signOut } from '../core/auth.js';
import { supabase } from '../core/supabase.js';

/**
 * Build the account menu element.
 * @param {import('@supabase/supabase-js').User} user
 * @param {() => void} onSignedOut  called after successful sign-out
 */
export function buildAccountMenu(user, onSignedOut) {
  const displayName = user.user_metadata?.display_name || 'Emcee';
  const email = user.email || '';

  let menuOpen = false;
  let menuEl = null;

  // ---- sync status (set by main.js via the 'baraha:sync-status' event) ----
  const syncDot = h('span', { class: 'sync-dot', 'aria-hidden': 'true' });
  const syncText = h('span', { class: 'account-sync-text' }, 'Sync starting…');
  const syncNowBtn = h('button', {
    class: 'account-sync-now', type: 'button', title: 'Sync now',
    onclick: (e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('baraha:sync-now')); },
  }, 'Sync now');
  const syncRow = h('div', { class: 'account-dropdown-sync', role: 'status' },
    h('span', { class: 'sync-dot sync-dot-inline', 'aria-hidden': 'true' }), syncText, syncNowBtn);

  const timeLabel = (iso) => {
    if (!iso) return '';
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  function paintSync(s) {
    if (!s) return;
    const label = {
      idle: s.lastSyncedAt ? `Synced ${timeLabel(s.lastSyncedAt)}` : 'Synced',
      syncing: 'Syncing…',
      offline: `Offline${s.pending ? ` · ${s.pending} change${s.pending === 1 ? '' : 's'} saved on this device` : ''}`,
      error: 'Sync problem · will retry',
      disabled: 'Sync is off on this device',
    }[s.state] || 'Sync';
    const withPending = s.state === 'idle' && s.pending ? `${label} · ${s.pending} waiting` : label;
    syncText.textContent = withPending;
    for (const dot of [syncDot, syncRow.querySelector('.sync-dot')]) dot.dataset.state = s.state;
    syncRow.dataset.state = s.state;
    trigger.title = `${displayName} — ${email}\n${withPending}`;
  }
  const onSyncStatus = (e) => {
    if (!syncRow.isConnected && !trigger.isConnected) { document.removeEventListener('baraha:sync-status', onSyncStatus); return; }
    paintSync(e.detail);
  };
  document.addEventListener('baraha:sync-status', onSyncStatus);

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    menuOpen = false;
    document.removeEventListener('click', onOutsideClick);
  }

  function onOutsideClick(e) {
    if (menuEl && !menuEl.contains(e.target) && !trigger.contains(e.target)) closeMenu();
  }

  function openMenu() {
    menuOpen = true;
    menuEl = h('div', { class: 'account-dropdown' },
      h('div', { class: 'account-dropdown-info' },
        h('span', { class: 'account-dropdown-name' }, displayName),
        h('span', { class: 'account-dropdown-email' }, email)
      ),
      h('hr', { class: 'account-dropdown-divider' }),
      syncRow,
      h('hr', { class: 'account-dropdown-divider' }),
      h('button', {
        class: 'account-dropdown-signout',
        onclick: async () => {
          closeMenu();
          const { error } = await signOut();
          if (!error) onSignedOut();
        },
      }, 'Sign out')
    );
    // Position below the trigger
    trigger.parentElement.style.position = 'relative';
    trigger.parentElement.appendChild(menuEl);
    setTimeout(() => document.addEventListener('click', onOutsideClick), 0);
  }

  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const trigger = h('button', {
    class: 'account-menu-trigger',
    title: `${displayName} — ${email}`,
    'aria-label': 'Account menu',
    onclick: (e) => {
      e.stopPropagation();
      menuOpen ? closeMenu() : openMenu();
    },
  },
    h('span', { class: 'account-avatar' }, initials, syncDot)
  );
  paintSync(window.__barahaSyncStatus);

  return trigger;
}
