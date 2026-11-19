// Profile page (#/profile): rapper name, email, change password, optional "remove this device's data".
import { h, toast, confirmDialog, formDialog } from '../core/ui.js';
import { backButton } from '../components/back-button.js';
import {
  getUser, updateDisplayName, changePassword, passwordProblem, PASSWORD_MIN,
  forgotPassword, verifyOtp, updatePassword, signOut,
} from '../core/auth.js';
import { dbNameFor } from '../core/db.js';
import { getSyncStatus, requestSync } from '../core/sync-ui.js';

const NAME_MAX = 30;

/** Password input with a Show/Hide button. */
function pwField(label, autocomplete) {
  const input = h('input', { type: 'password', autocomplete, 'aria-label': label });
  const toggle = h('button', {
    type: 'button', class: 'ghost', 'aria-label': `Show or hide ${label.toLowerCase()}`,
    onclick: () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
    },
  }, 'Show');
  const el = h('div', { class: 'field' }, h('label', {}, label), h('div', { class: 'pw-wrap' }, input, toggle));
  return { el, input };
}

const msgEl = () => h('p', { class: 'profile-msg', role: 'status', 'aria-live': 'polite' });
function say(el, text, kind = '') { el.textContent = text; el.className = `profile-msg ${kind}`.trim(); }

function plainAuthError(error) {
  const m = String(error?.message || '');
  if (/network|failed to fetch|load failed/i.test(m)) return 'No internet connection. Try again when you are online.';
  if (/same password|different from the old/i.test(m)) return 'Your new password must be different from the old one.';
  if (/rate|too many|seconds/i.test(m)) return 'Too many tries. Wait a minute and try again.';
  if (/expired|invalid/i.test(m)) return 'That code is wrong or expired. Ask for a new one.';
  return 'Something went wrong. Please try again.';
}

export async function profileView(root) {
  const user = await getUser();
  if (!user) { root.replaceChildren(h('div', { class: 'page' }, h('p', { class: 'notice' }, 'Please sign in again.'))); return; }
  const email = user.email || '';
  const currentName = (user.user_metadata?.display_name || '').trim();

  // ---- Rapper name ----
  const nameInput = h('input', { type: 'text', maxlength: String(NAME_MAX), autocomplete: 'nickname', 'aria-label': 'Rapper name' });
  nameInput.value = currentName;
  const nameMsg = msgEl();
  const nameSave = h('button', { type: 'submit', class: 'primary' }, 'Save name');
  const nameForm = h('form', {
    class: 'profile-card card',
    onsubmit: async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return say(nameMsg, 'Type a name first.', 'err');
      if (name.length > NAME_MAX) return say(nameMsg, `Keep it under ${NAME_MAX} characters.`, 'err');
      nameSave.disabled = true; say(nameMsg, 'Saving…');
      const { user: updated, error } = await updateDisplayName(name);
      nameSave.disabled = false;
      if (error) return say(nameMsg, plainAuthError(error), 'err');
      nameInput.value = name;
      say(nameMsg, 'Saved.', 'ok');
      document.dispatchEvent(new CustomEvent('baraha:profile-updated', { detail: { user: updated } }));
    },
  },
    h('div', { class: 'field' }, h('label', {}, 'Rapper name'), nameInput,
      h('p', { class: 'hint' }, `Shown next to your avatar. 1 to ${NAME_MAX} characters.`)),
    h('div', {}, nameSave), nameMsg);

  // ---- Email (read only) ----
  const emailCard = h('div', { class: 'profile-card card' },
    h('div', { class: 'field' }, h('label', {}, 'Email'),
      h('input', { type: 'email', value: email, readonly: true, 'aria-label': 'Email (cannot be changed here)' }),
      h('p', { class: 'hint' }, 'This is your sign-in email. It cannot be changed here.')));

  // ---- Change password ----
  const cur = pwField('Current password', 'current-password');
  const nw = pwField('New password', 'new-password');
  const cf = pwField('Confirm new password', 'new-password');
  const pwMsg = msgEl();
  const pwBtn = h('button', { type: 'submit', class: 'primary' }, 'Change password');
  const clearPw = () => { cur.input.value = nw.input.value = cf.input.value = ''; };
  const pwForm = h('form', {
    class: 'profile-card card',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!cur.input.value) return say(pwMsg, 'Type your current password.', 'err');
      const problem = passwordProblem(nw.input.value);
      if (problem) return say(pwMsg, problem, 'err');
      if (nw.input.value !== cf.input.value) return say(pwMsg, 'The two new passwords do not match.', 'err');
      pwBtn.disabled = true; say(pwMsg, 'Checking…');
      const { error, wrongCurrent } = await changePassword(email, cur.input.value, nw.input.value);
      pwBtn.disabled = false;
      if (wrongCurrent) return say(pwMsg, 'Your current password is not right.', 'err');
      if (error) return say(pwMsg, plainAuthError(error), 'err');
      clearPw();
      say(pwMsg, 'Password changed.', 'ok');
      toast('Password changed');
    },
  },
    h('h3', { style: 'margin:0' }, 'Change password'),
    cur.el, nw.el, cf.el,
    h('p', { class: 'hint' }, `At least ${PASSWORD_MIN} characters.`),
    h('div', {}, pwBtn), pwMsg);

  // ---- Code by email (forgot the current password) ----
  const codeMsg = msgEl();
  const codeBox = h('div', { class: 'stack', style: 'display:none; gap:10px' });
  const codeInput = h('input', { type: 'text', inputmode: 'numeric', maxlength: '8', autocomplete: 'one-time-code', 'aria-label': '6-digit code' });
  const cn = pwField('New password', 'new-password');
  const cc = pwField('Confirm new password', 'new-password');
  const codeApply = h('button', { type: 'submit', class: 'primary' }, 'Set new password');
  codeBox.append(
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const token = codeInput.value.replace(/\D/g, '');
        if (token.length < 6) return say(codeMsg, 'Type the 6-digit code from your email.', 'err');
        const problem = passwordProblem(cn.input.value);
        if (problem) return say(codeMsg, problem, 'err');
        if (cn.input.value !== cc.input.value) return say(codeMsg, 'The two new passwords do not match.', 'err');
        codeApply.disabled = true; say(codeMsg, 'Checking…');
        const v = await verifyOtp(email, token, 'recovery');
        if (v.error) { codeApply.disabled = false; return say(codeMsg, plainAuthError(v.error), 'err'); }
        const u = await updatePassword(cn.input.value);
        codeApply.disabled = false;
        if (u.error) return say(codeMsg, plainAuthError(u.error), 'err');
        codeInput.value = cn.input.value = cc.input.value = '';
        codeBox.style.display = 'none';
        say(codeMsg, 'Password changed.', 'ok');
        toast('Password changed');
      },
    },
      h('div', { class: 'field' }, h('label', {}, '6-digit code'), codeInput), cn.el, cc.el, h('div', {}, codeApply)));
  const codeBtn = h('button', {
    type: 'button', class: 'ghost',
    onclick: async () => {
      codeBtn.disabled = true; say(codeMsg, 'Sending…');
      const { error } = await forgotPassword(email);
      codeBtn.disabled = false;
      if (error) return say(codeMsg, plainAuthError(error), 'err');
      codeBox.style.display = '';
      say(codeMsg, `We sent a code to ${email}. It can take a minute.`, 'ok');
      codeInput.focus();
    },
  }, 'Email me a code instead');
  const codeCard = h('div', { class: 'profile-card card' },
    h('p', { class: 'hint' }, 'Forgot your current password? We can email you a 6-digit code to set a new one.'),
    h('div', {}, codeBtn), codeMsg, codeBox);

  // ---- Remove this device's data ----
  const wipeBtn = h('button', { type: 'button', class: 'danger', onclick: wipeFlow }, 'Sign out and remove this device\'s data');
  const wipeCard = h('div', { class: 'profile-card card profile-danger' },
    h('p', { class: 'hint' }, 'For a shared or borrowed device. Your work stays in your cloud account if it was synced, and comes back when you sign in again.'),
    h('div', {}, wipeBtn));

  async function wipeFlow() {
    const s = getSyncStatus();
    if (s?.pending > 0) {
      const sync = await confirmDialog({
        title: 'Some changes are not synced yet',
        message: `${s.pending} change${s.pending === 1 ? '' : 's'} on this device ${s.pending === 1 ? 'has' : 'have'} not reached the cloud. Sync now so nothing is lost?`,
        confirmLabel: 'Sync now',
      });
      if (!sync) return;
      toast('Syncing…');
      const after = await requestSync();
      if (!after || after.state !== 'idle' || after.pending > 0) {
        toast('Could not finish syncing. Nothing was removed. Check your connection and try again.', 'error');
        return;
      }
    }
    const typed = await formDialog({
      title: 'Remove this device\'s data?',
      fields: [{ name: 'word', label: 'This deletes everything saved in this browser for your account. Type REMOVE to confirm.', required: true }],
      submitLabel: 'Sign out and remove',
    });
    if (!typed || String(typed.word).trim().toUpperCase() !== 'REMOVE') {
      if (typed) toast('You did not type REMOVE, so nothing was removed.');
      return;
    }
    try { localStorage.setItem('baraha.wipeDb', dbNameFor(user.id)); } catch { toast('This browser blocked the removal.', 'error'); return; }
    await signOut();
    location.hash = '#/';
    location.reload();
  }

  root.replaceChildren(h('div', { class: 'page stack' },
    h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'page-head-main' }, backButton(), h('h1', {}, 'Profile')),
        h('p', { class: 'small muted' }, 'Your name, sign-in and password.'))),
    h('div', { class: 'profile-columns' },
      h('div', { class: 'profile-col stack' },
        h('section', { class: 'settings-section' }, h('div', { class: 'section-title' }, 'Rapper name'), nameForm),
        h('section', { class: 'settings-section' }, h('div', { class: 'section-title' }, 'Email'), emailCard)),
      h('div', { class: 'profile-col stack' },
        h('section', { class: 'settings-section' }, h('div', { class: 'section-title' }, 'Password'), pwForm, codeCard),
        h('section', { class: 'settings-section' }, h('div', { class: 'section-title' }, 'This device'), wipeCard)))));
}
