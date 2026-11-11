export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const nowIso = () => new Date().toISOString();

export function formatDate(iso, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime
    ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return formatDate(iso);
}

/** Text statistics. Counts the text exactly as typed; never normalises it. */
export function textStats(text) {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: text.length,
    lines: text.length ? text.split('\n').length : 0,
  };
}

export const debounce = (fn, ms) => {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
};

/**
 * Calculates calendar day difference in local time (comparing local midnights)
 * and returns stamp label and urgency level.
 * @param {string} dateStr YYYY-MM-DD or ISO string
 * @param {Date} [nowDate] Current date (defaults to now)
 * @returns {{ label: string, daysDiff: number, urgency: 'today' | 'urgent' | 'near' | 'distant' | 'passed' } | null}
 */
export function getBattleCountdown(dateStr, nowDate = new Date()) {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.trim()) return null;

  // Parse YYYY-MM-DD or ISO
  const parts = dateStr.trim().split('T')[0].split('-');
  if (parts.length < 3) {
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return null;
    parts[0] = parsed.getFullYear();
    parts[1] = parsed.getMonth() + 1;
    parts[2] = parsed.getDate();
  }

  const targetYear = parseInt(parts[0], 10);
  const targetMonth = parseInt(parts[1], 10) - 1;
  const targetDay = parseInt(parts[2], 10);
  if (Number.isNaN(targetYear) || Number.isNaN(targetMonth) || Number.isNaN(targetDay)) return null;

  const targetMidnight = new Date(targetYear, targetMonth, targetDay, 0, 0, 0, 0);
  const currentMidnight = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), 0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysDiff = Math.round((targetMidnight.getTime() - currentMidnight.getTime()) / msPerDay);

  if (daysDiff < 0) {
    return { label: 'DATE PASSED', daysDiff, urgency: 'passed' };
  }
  if (daysDiff === 0) {
    return { label: 'TODAY', daysDiff: 0, urgency: 'today' };
  }
  if (daysDiff === 1) {
    return { label: 'TOMORROW', daysDiff: 1, urgency: 'urgent' };
  }
  if (daysDiff <= 7) {
    return { label: `${daysDiff} DAYS LEFT`, daysDiff, urgency: 'urgent' };
  }
  if (daysDiff <= 30) {
    return { label: `${daysDiff} DAYS LEFT`, daysDiff, urgency: 'near' };
  }
  return { label: `${daysDiff} DAYS LEFT`, daysDiff, urgency: 'distant' };
}

