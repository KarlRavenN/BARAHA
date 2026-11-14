// Auth screens: Register, Verify OTP, Sign In, Forgot Password, Reset Password.
// All screens match the BARAHA underground theme.
// Mounted by main.js before the router starts when no session exists.

import { h } from '../core/ui.js';
import {
  signUp, signIn, verifyOtp, resendOtp,
  forgotPassword, updatePassword,
} from '../core/auth.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function showError(container, msg) {
  let el = container.querySelector('.auth-error');
  if (!el) {
    el = h('p', { class: 'auth-error' });
    container.querySelector('.auth-form').appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
}

function clearError(container) {
  const el = container.querySelector('.auth-error');
  if (el) el.hidden = true;
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.dataset.loading = loading ? '1' : '';
  btn.textContent = loading ? 'Please wait…' : btn.dataset.label;
}

function passwordField(id, label, placeholder = '') {
  const wrap = h('div', { class: 'auth-field' },
    h('label', { for: id }, label),
    h('div', { class: 'auth-pw-wrap' },
      h('input', {
        type: 'password', id, name: id,
        placeholder, autocomplete: 'current-password',
        class: 'auth-input',
      }),
      h('button', {
        type: 'button', class: 'auth-pw-toggle', 'aria-label': 'Show/hide password',
        onclick(e) {
          const inp = wrap.querySelector('input');
          const showing = inp.type === 'text';
          inp.type = showing ? 'password' : 'text';
          e.currentTarget.textContent = showing ? '👁' : '🙈';
        },
      }, '👁')
    )
  );
  return wrap;
}

// ── Register screen ────────────────────────────────────────────────────────

export function renderRegister(onDone) {
  let pendingEmail = '';

  const wrap = h('div', { class: 'auth-screen' },
    h('div', { class: 'auth-card' },
      h('div', { class: 'auth-brand' },
        h('span', { class: 'auth-brand-text' },
          h('b', {}, 'BAR'),
          h('span', { class: 'brand-accent' }, 'A'),
          h('b', {}, 'HA')
        )
      ),
      h('h1', { class: 'auth-title' }, 'Create account'),
      h('p', { class: 'auth-sub' }, 'Join the battle rap workspace'),
      h('form', {
        class: 'auth-form',
        onsubmit: async (e) => {
          e.preventDefault();
          clearError(wrap);
          const email = e.target.email.value.trim();
          const password = e.target.password.value;
          const displayName = e.target.display_name.value.trim();

          if (!displayName) return showError(wrap, 'Enter your rapper / display name.');
          if (password.length < 8) return showError(wrap, 'Password must be at least 8 characters.');

          const btn = e.target.querySelector('button[type=submit]');
          setLoading(btn, true);
          const { error } = await signUp(email, password, displayName);
          setLoading(btn, false);

          if (error) return showError(wrap, error.message);

          pendingEmail = email;
          onDone('verify-signup', { email });
        },
      },
        h('div', { class: 'auth-field' },
          h('label', { for: 'display_name' }, 'Rapper / Display name'),
          h('input', {
            type: 'text', id: 'display_name', name: 'display_name',
            placeholder: 'e.g. FlipTop Karl', class: 'auth-input',
            autocomplete: 'nickname',
          })
        ),
        h('div', { class: 'auth-field' },
          h('label', { for: 'email' }, 'Email'),
          h('input', {
            type: 'email', id: 'email', name: 'email',
            placeholder: 'your@email.com', class: 'auth-input',
            autocomplete: 'email',
          })
        ),
        passwordField('password', 'Password', 'At least 8 characters'),
        h('button', {
          type: 'submit', class: 'auth-btn', 'data-label': 'Create account',
        }, 'Create account')
      ),
      h('p', { class: 'auth-switch' },
        'Already have an account? ',
        h('a', { href: '#', onclick(e) { e.preventDefault(); onDone('login'); } }, 'Sign in')
      )
    )
  );

  return wrap;
}

// ── Verify OTP screen ──────────────────────────────────────────────────────

export function renderVerifyOtp(email, type, onDone) {
  let cooldown = 0;
  let cooldownTimer = null;

  function startCooldown(resendBtn) {
    cooldown = 60;
    resendBtn.disabled = true;
    resendBtn.textContent = `Resend (${cooldown}s)`;
    cooldownTimer = setInterval(() => {
      cooldown--;
      resendBtn.textContent = cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend code';
      if (cooldown <= 0) {
        clearInterval(cooldownTimer);
        resendBtn.disabled = false;
      }
    }, 1000);
  }

  const resendBtn = h('button', {
    type: 'button', class: 'auth-link-btn',
    onclick: async () => {
      clearError(wrap);
      const { error } = await resendOtp(email, type);
      if (error) showError(wrap, error.message);
      else startCooldown(resendBtn);
    },
  }, 'Resend code');

  const wrap = h('div', { class: 'auth-screen' },
    h('div', { class: 'auth-card' },
      h('div', { class: 'auth-brand' },
        h('span', { class: 'auth-brand-text' },
          h('b', {}, 'BAR'),
          h('span', { class: 'brand-accent' }, 'A'),
          h('b', {}, 'HA')
        )
      ),
      h('h1', { class: 'auth-title' }, 'Check your email'),
      h('p', { class: 'auth-sub' },
        `We sent a 6-digit code to `, h('b', {}, email)
      ),
      h('form', {
        class: 'auth-form',
        onsubmit: async (e) => {
          e.preventDefault();
          clearError(wrap);
          const token = e.target.token.value.trim();
          if (token.length !== 6) return showError(wrap, 'Enter the 6-digit code from your email.');

          const btn = e.target.querySelector('button[type=submit]');
          setLoading(btn, true);
          const { error } = await verifyOtp(email, token, type);
          setLoading(btn, false);

          if (error) return showError(wrap, 'Incorrect code or it has expired. Try resending.');

          if (type === 'recovery') {
            onDone('reset-password');
          } else {
            onDone('verified');
          }
        },
      },
        h('div', { class: 'auth-field' },
          h('label', { for: 'token' }, '6-digit code'),
          h('input', {
            type: 'text', id: 'token', name: 'token',
            placeholder: '000000', class: 'auth-input auth-otp-input',
            inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code',
          })
        ),
        h('button', {
          type: 'submit', class: 'auth-btn', 'data-label': 'Verify',
        }, 'Verify')
      ),
      h('p', { class: 'auth-switch' }, resendBtn)
    )
  );

  startCooldown(resendBtn);
  return wrap;
}

// ── Sign in screen ─────────────────────────────────────────────────────────

export function renderLogin(onDone) {
  const wrap = h('div', { class: 'auth-screen' },
    h('div', { class: 'auth-card' },
      h('div', { class: 'auth-brand' },
        h('span', { class: 'auth-brand-text' },
          h('b', {}, 'BAR'),
          h('span', { class: 'brand-accent' }, 'A'),
          h('b', {}, 'HA')
        )
      ),
      h('h1', { class: 'auth-title' }, 'Sign in'),
      h('p', { class: 'auth-sub' }, 'Welcome back to the workspace'),
      h('form', {
        class: 'auth-form',
        onsubmit: async (e) => {
          e.preventDefault();
          clearError(wrap);
          const email = e.target.email.value.trim();
          const password = e.target.password.value;

          const btn = e.target.querySelector('button[type=submit]');
          setLoading(btn, true);
          const { error } = await signIn(email, password);
          setLoading(btn, false);

          // Never reveal whether an email exists
          if (error) return showError(wrap, 'Incorrect email or password.');

          onDone('signed-in');
        },
      },
        h('div', { class: 'auth-field' },
          h('label', { for: 'email' }, 'Email'),
          h('input', {
            type: 'email', id: 'email', name: 'email',
            placeholder: 'your@email.com', class: 'auth-input',
            autocomplete: 'email',
          })
        ),
        passwordField('password', 'Password'),
        h('div', { class: 'auth-forgot-row' },
          h('a', {
            href: '#', class: 'auth-link',
            onclick(e) { e.preventDefault(); onDone('forgot'); },
          }, 'Forgot password?')
        ),
        h('button', {
          type: 'submit', class: 'auth-btn', 'data-label': 'Sign in',
        }, 'Sign in')
      ),
      h('p', { class: 'auth-switch' },
        'No account? ',
        h('a', { href: '#', onclick(e) { e.preventDefault(); onDone('register'); } }, 'Create one')
      )
    )
  );

  return wrap;
}

// ── Forgot password screen ─────────────────────────────────────────────────

export function renderForgotPassword(onDone) {
  const wrap = h('div', { class: 'auth-screen' },
    h('div', { class: 'auth-card' },
      h('div', { class: 'auth-brand' },
        h('span', { class: 'auth-brand-text' },
          h('b', {}, 'BAR'),
          h('span', { class: 'brand-accent' }, 'A'),
          h('b', {}, 'HA')
        )
      ),
      h('h1', { class: 'auth-title' }, 'Reset password'),
      h('p', { class: 'auth-sub' }, 'Enter your email and we\'ll send a reset code'),
      h('form', {
        class: 'auth-form',
        onsubmit: async (e) => {
          e.preventDefault();
          clearError(wrap);
          const email = e.target.email.value.trim();

          const btn = e.target.querySelector('button[type=submit]');
          setLoading(btn, true);
          const { error } = await forgotPassword(email);
          setLoading(btn, false);

          // Never reveal whether email exists — always show success
          if (error) console.error(error);
          onDone('verify-recovery', { email });
        },
      },
        h('div', { class: 'auth-field' },
          h('label', { for: 'email' }, 'Email'),
          h('input', {
            type: 'email', id: 'email', name: 'email',
            placeholder: 'your@email.com', class: 'auth-input',
            autocomplete: 'email',
          })
        ),
        h('button', {
          type: 'submit', class: 'auth-btn', 'data-label': 'Send reset code',
        }, 'Send reset code')
      ),
      h('p', { class: 'auth-switch' },
        h('a', { href: '#', onclick(e) { e.preventDefault(); onDone('login'); } }, '← Back to sign in')
      )
    )
  );

  return wrap;
}

// ── Reset password screen ──────────────────────────────────────────────────

export function renderResetPassword(onDone) {
  const wrap = h('div', { class: 'auth-screen' },
    h('div', { class: 'auth-card' },
      h('div', { class: 'auth-brand' },
        h('span', { class: 'auth-brand-text' },
          h('b', {}, 'BAR'),
          h('span', { class: 'brand-accent' }, 'A'),
          h('b', {}, 'HA')
        )
      ),
      h('h1', { class: 'auth-title' }, 'New password'),
      h('p', { class: 'auth-sub' }, 'Choose a strong new password'),
      h('form', {
        class: 'auth-form',
        onsubmit: async (e) => {
          e.preventDefault();
          clearError(wrap);
          const password = e.target.password.value;
          const confirm = e.target.confirm.value;

          if (password.length < 8) return showError(wrap, 'Password must be at least 8 characters.');
          if (password !== confirm) return showError(wrap, 'Passwords don\'t match.');

          const btn = e.target.querySelector('button[type=submit]');
          setLoading(btn, true);
          const { error } = await updatePassword(password);
          setLoading(btn, false);

          if (error) return showError(wrap, error.message);
          onDone('password-updated');
        },
      },
        passwordField('password', 'New password', 'At least 8 characters'),
        passwordField('confirm', 'Confirm new password', 'Type it again'),
        h('button', {
          type: 'submit', class: 'auth-btn', 'data-label': 'Set new password',
        }, 'Set new password')
      )
    )
  );

  return wrap;
}

// ── Auth flow orchestrator ─────────────────────────────────────────────────

/**
 * Mount the auth flow into `container`.
 * Calls `onAuthenticated()` once the user has a valid session.
 * @param {HTMLElement} container
 * @param {() => void} onAuthenticated
 */
export function mountAuthFlow(container, onAuthenticated) {
  let pendingEmail = '';
  let pendingOtpType = 'signup';

  function show(screen, ctx = {}) {
    container.replaceChildren();

    if (screen === 'register') {
      container.appendChild(renderRegister((next, c) => show(next, c)));
    } else if (screen === 'verify-signup') {
      pendingEmail = ctx.email || pendingEmail;
      pendingOtpType = 'signup';
      container.appendChild(renderVerifyOtp(pendingEmail, 'signup', (next) => show(next)));
    } else if (screen === 'login') {
      container.appendChild(renderLogin((next, c) => show(next, c)));
    } else if (screen === 'forgot') {
      container.appendChild(renderForgotPassword((next, c) => show(next, c)));
    } else if (screen === 'verify-recovery') {
      pendingEmail = ctx.email || pendingEmail;
      pendingOtpType = 'recovery';
      container.appendChild(renderVerifyOtp(pendingEmail, 'recovery', (next) => show(next)));
    } else if (screen === 'reset-password') {
      container.appendChild(renderResetPassword((next) => show(next)));
    } else if (screen === 'verified' || screen === 'signed-in' || screen === 'password-updated') {
      onAuthenticated();
    }
  }

  show('login');
}
