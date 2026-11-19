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
        type: 'button', class: 'auth-pw-toggle', 'aria-label': 'Show or hide password',
        onclick(e) {
          const inp = wrap.querySelector('input');
          const showing = inp.type === 'text';
          inp.type = showing ? 'password' : 'text';
          e.currentTarget.textContent = showing ? 'Show' : 'Hide';
        },
      }, 'Show')
    )
  );
  return wrap;
}

// ── Shared landing shell (wall + spray-painted panel) ──────────────────────
// Purely visual. The forms below keep their own logic; this only wraps them.

const WALL_STEPS = [
  { label: 'Opponent',    paper: 'sticky',   fix: 'pin' },
  { label: 'Research',    paper: 'notebook', fix: 'tape' },
  { label: 'Round 1',     paper: 'torn',     fix: 'clip' },
  { label: 'Round 2',     paper: 'notebook', fix: 'pin' },
  { label: 'Round 3',     paper: 'torn',     fix: 'tape' },
  { label: 'Performance', paper: 'final',    fix: 'tape' },
];

const SPRAY_DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <filter id="baraha-spray-rough" x="-12%" y="-12%" width="124%" height="130%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="11" result="wob"/>
      <feDisplacementMap in="SourceGraphic" in2="wob" scale="16" xChannelSelector="R" yChannelSelector="G" result="shape"/>
      <feColorMatrix in="shape" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha"/>
      <feGaussianBlur in="alpha" stdDeviation="4.5" result="soft"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="fine"/>
      <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.6 0 0 0 -0.8" result="grain"/>
      <feComposite in="soft" in2="grain" operator="arithmetic" k1="0" k2="1" k3="0.8" k4="-0.4" result="mix"/>
      <feComponentTransfer in="mix" result="mask"><feFuncA type="linear" slope="7" intercept="-3"/></feComponentTransfer>
      <feComposite in="shape" in2="mask" operator="in"/>
    </filter>
    <filter id="baraha-spray-mist" x="-30%" y="-30%" width="160%" height="165%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="11" result="wob"/>
      <feDisplacementMap in="SourceGraphic" in2="wob" scale="22" xChannelSelector="R" yChannelSelector="G" result="shape"/>
      <feColorMatrix in="shape" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha"/>
      <feGaussianBlur in="alpha" stdDeviation="15" result="soft"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="9" result="fine"/>
      <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.8 0 0 0 -0.9" result="grain"/>
      <feComposite in="soft" in2="grain" operator="arithmetic" k1="0" k2="1" k3="0.9" k4="-0.3" result="mix"/>
      <feComponentTransfer in="mix" result="mask"><feFuncA type="linear" slope="16" intercept="-6.4"/></feComponentTransfer>
      <feComposite in="shape" in2="mask" operator="in"/>
    </filter>
    <filter id="baraha-spray-lite" x="-5%" y="-20%" width="110%" height="140%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="21" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <linearGradient id="baraha-drip-fill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4f0a12"/>
      <stop offset="0.45" stop-color="#7a111c"/>
      <stop offset="1" stop-color="#520b13"/>
    </linearGradient>
  </defs>
</svg>`;

// Real-looking paint drip: flared where it leaves the paint, thin runny stem, fat bead at the end.
// len = total length (px), stem = stem width, bead = bead radius.
function dripSvg(len, stem, bead, flare = 6) {
  const w = Math.ceil(bead * 2 + flare * 2 + 4);
  const cx = w / 2, s = stem / 2, by = len - bead * 2;        // bead top
  const d = [
    `M${cx - s - flare} 0`,
    `C${cx - s - 1} 4 ${cx - s} 12 ${cx - s} 26`,
    `L${cx - s} ${by - 4}`,
    `C${cx - bead - 0.5} ${by + 2} ${cx - bead} ${len - 1} ${cx} ${len}`,
    `C${cx + bead} ${len - 1} ${cx + bead + 0.5} ${by + 2} ${cx + s} ${by - 4}`,
    `L${cx + s} 26`,
    `C${cx + s} 12 ${cx + s + 1} 4 ${cx + s + flare} 0 Z`,
  ].join(' ');
  const hl = `<ellipse cx="${cx - bead * 0.35}" cy="${len - bead * 1.2}" rx="${Math.max(1, bead * 0.28)}" ry="${bead * 0.5}" fill="#ff8a8a" opacity="0.38"/>`
           + `<rect x="${cx - s + 0.6}" y="30" width="${Math.max(0.8, stem * 0.18)}" height="${Math.max(4, by - 36)}" rx="1" fill="#ff8a8a" opacity="0.22"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${len}" viewBox="0 0 ${w} ${len}" aria-hidden="true"><path d="${d}" fill="url(#baraha-drip-fill)"/>${hl}</svg>`;
}

// left %, length, stem width, bead radius
const DRIPS = [
  [10, 46, 6, 5.5],
  [27, 28, 4, 4],
  [43, 92, 7, 6.5],
  [61, 40, 4.5, 4.5],
  [78, 64, 6, 5.5],
  [91, 30, 4, 4],
];

function sprayDefs() {
  const box = document.createElement('div');
  box.innerHTML = SPRAY_DEFS;
  return box.firstElementChild;
}

function wallColumn() {
  const steps = WALL_STEPS.map((s, i) =>
    h('li', { class: `wall-step wall-step-${i + 1}` },
      h('div', { class: `wall-note paper-${s.paper}` },
        h('span', { class: 'wall-note-n' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'wall-note-t' }, s.label)
      ),
      h('span', { class: `wall-fix fix-${s.fix}`, 'aria-hidden': 'true' }),
      i < WALL_STEPS.length - 1
        ? h('span', { class: 'wall-arrow', 'aria-hidden': 'true' })
        : null
    )
  );
  return h('section', { class: 'auth-wall', 'aria-label': 'BARAHA' },
    h('img', { class: 'auth-logo', src: 'assets/baraha-logo.png', alt: 'BARAHA', width: '405', height: '202' }),
    h('ol', { class: 'wall-process', 'aria-label': 'How a battle gets written' }, ...steps)
  );
}

function sprayCard(children) {
  const mist = h('div', { class: 'auth-spray auth-spray-mist', 'aria-hidden': 'true' },
    h('div', { class: 'auth-spray-body' }));
  const spray = h('div', { class: 'auth-spray', 'aria-hidden': 'true' },
    h('div', { class: 'auth-spray-body' }));
  const drips = h('div', { class: 'auth-drips', 'aria-hidden': 'true' });
  for (const [left, len, stem, bead] of DRIPS) {
    const d = h('span', { class: 'auth-drip', style: `left:${left}%` });
    d.innerHTML = dripSvg(len, stem, bead);
    drips.append(d);
  }
  return h('div', { class: 'auth-card' }, mist, spray, drips,
    h('div', { class: 'auth-card-inner' }, ...children));
}

function authShell(...cardChildren) {
  return h('div', { class: 'auth-screen' },
    sprayDefs(),
    wallColumn(),
    h('div', { class: 'auth-panel' }, sprayCard(cardChildren))
  );
}

// ── Register screen ────────────────────────────────────────────────────────

export function renderRegister(onDone) {
  let pendingEmail = '';

  const wrap = authShell(
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

  const wrap = authShell(
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
  );

  startCooldown(resendBtn);
  return wrap;
}

// ── Sign in screen ─────────────────────────────────────────────────────────

export function renderLogin(onDone) {
  const wrap = authShell(
      h('h1', { class: 'auth-title auth-title-img' },
        h('img', { src: 'assets/sign-in-title.png', alt: 'Sign in', width: '280', height: '130' })
      ),
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
  );

  return wrap;
}

// ── Forgot password screen ─────────────────────────────────────────────────

export function renderForgotPassword(onDone) {
  const wrap = authShell(
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
  );

  return wrap;
}

// ── Reset password screen ──────────────────────────────────────────────────

export function renderResetPassword(onDone) {
  const wrap = authShell(
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
