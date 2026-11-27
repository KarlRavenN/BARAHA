// Email check for sign-up. Format first, then the domain must be a common provider.
// A near miss (gmial.com, yaho.com) gets a "Did you mean ...?" suggestion instead of a flat error.

export const COMMON_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'yahoo.com.ph', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'gmx.com', 'yandex.com', 'mail.com',
];

const FORMAT = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@([a-z0-9-]+\.)+[a-z]{2,}$/i;

/** Classic edit distance (insert, delete, substitute). */
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * @returns {{ok:true, email:string} | {ok:false, message:string, suggestion?:string}}
 * suggestion is the corrected full address, e.g. "me@gmail.com".
 */
export function checkEmail(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return { ok: false, message: 'Enter your email address.' };
  if (!FORMAT.test(value)) {
    return { ok: false, message: 'That does not look like an email address. Example: name@gmail.com' };
  }
  const at = value.lastIndexOf('@');
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (COMMON_EMAIL_DOMAINS.includes(domain)) return { ok: true, email: value };

  let best = null;
  for (const d of COMMON_EMAIL_DOMAINS) {
    const dist = editDistance(domain, d);
    if (dist <= 2 && (!best || dist < best.dist)) best = { d, dist };
  }
  if (best) {
    const suggestion = `${local}@${best.d}`;
    return { ok: false, suggestion, message: `Did you mean ${suggestion}?` };
  }
  return {
    ok: false,
    message: `"${domain}" is not a supported email provider. Use Gmail, Yahoo, Outlook, Hotmail, iCloud or a similar provider.`,
  };
}
