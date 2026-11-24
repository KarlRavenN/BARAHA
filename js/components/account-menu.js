// Account menu in the nav: avatar + rapper name (with a small sync status dot on the avatar).
// Dropdown: name + email, Profile, Settings, Sign out. Sync details and "Sync now" live in Settings > Cloud sync.

import { h, removeAnimated } from '../core/ui.js';
import { signOut } from '../core/auth.js';
import { go } from '../core/router.js';
import { watchSyncStatus, SYNC_LABELS, timeAgoText } from '../core/sync-ui.js';

/**
 * @param {import('@supabase/supabase-js').User} user
 * @param {() => void} onSignedOut  called after successful sign-out
 */
export function buildAccountMenu(user, onSignedOut) {
  const displayName = (user.user_metadata?.display_name || '').trim() || 'Emcee';
  const email = user.email || '';

  let menuEl = null;
  let syncTip = '';

  const syncDot = h('span', { class: 'sync-dot', 'aria-hidden': 'true' });

  function paintSync(s) {
    if (!s) return;
    syncDot.dataset.state = s.state;
    let label = SYNC_LABELS[s.state] || 'Sync';
    if (s.state === 'idle' && s.lastSyncedAt) label = `Synced ${timeAgoText(s.lastSyncedAt)}`;
    if (s.pending) label += ` · ${s.pending} waiting`;
    syncTip = label;
    trigger.title = `${displayName} (${email})\n${label}`;
  }

  function closeMenu() {
    if (menuEl) { removeAnimated(menuEl, 140); menuEl = null; }
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKey);
  }
  const onOutsideClick = (e) => { if (menuEl && !menuEl.contains(e.target) && !trigger.contains(e.target)) closeMenu(); };
  const onKey = (e) => { if (e.key === 'Escape') { closeMenu(); trigger.focus(); } };

  const item = (label, onclick, extraClass = '') =>
    h('button', { type: 'button', class: `account-dropdown-item ${extraClass}`.trim(), role: 'menuitem', onclick }, label);

  function openMenu() {
    menuEl = h('div', { class: 'account-dropdown', role: 'menu' },
      h('div', { class: 'account-dropdown-info' },
        h('span', { class: 'account-dropdown-name' }, displayName),
        h('span', { class: 'account-dropdown-email' }, email)),
      h('hr', { class: 'account-dropdown-divider' }),
      item('Profile', () => { closeMenu(); go('/profile'); }),
      item('Settings', () => { closeMenu(); go('/settings'); }),
      h('hr', { class: 'account-dropdown-divider' }),
      h('button', {
        type: 'button', class: 'account-dropdown-signout', role: 'menuitem',
        onclick: async () => {
          closeMenu();
          const { error } = await signOut();
          if (!error) onSignedOut();
        },
      }, 'Sign out'));
    trigger.parentElement.style.position = 'relative';
    trigger.parentElement.appendChild(menuEl);
    trigger.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      document.addEventListener('click', onOutsideClick);
      document.addEventListener('keydown', onKey);
    }, 0);
  }

  const initials = displayName.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const trigger = h('button', {
    type: 'button',
    class: 'account-menu-trigger',
    title: `${displayName} (${email})`,
    'aria-label': `Account menu for ${displayName}`,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    onclick: (e) => { e.stopPropagation(); menuEl ? closeMenu() : openMenu(); },
  },
    h('span', { class: 'account-avatar' }, initials, syncDot),
    h('span', { class: 'account-name' }, displayName));

  // The nav is redrawn often; stop listening once this trigger has been replaced.
  const stop = watchSyncStatus((s) => {
    if (!trigger.isConnected && trigger.dataset.mounted) { stop(); return; }
    paintSync(s);
  });
  setTimeout(() => { trigger.dataset.mounted = '1'; }, 0);
  void syncTip;

  return trigger;
}
