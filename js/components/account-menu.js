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
    h('span', { class: 'account-avatar' }, initials)
  );

  return trigger;
}
