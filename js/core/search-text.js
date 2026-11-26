// Search display helpers. Pure functions, no DOM, no innerHTML: safe for any stored text.
// They only build what is SHOWN in search results. Stored data is never changed.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/**
 * Turns stored writing (which may be HTML from the editor) into plain readable text.
 * <br> and block tags become line breaks; every other tag is removed; entities are decoded.
 * The result is text only: it is never parsed as HTML again.
 */
export function htmlToPlain(input) {
  if (input == null) return '';
  let s = String(input);
  s = s.replace(/<\s*script[\s\S]*?<\/\s*script\s*>/gi, '')   // drop script/style bodies entirely
       .replace(/<\s*style[\s\S]*?<\/\s*style\s*>/gi, '');
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n')
       .replace(/<\/\s*(div|p|li|h[1-6]|tr|blockquote)\s*>/gi, '\n')
       .replace(/<\s*(div|p|li|h[1-6]|tr|blockquote)\b[^>]*>/gi, '\n')
       .replace(/<[^>]*>/g, '');
  s = decodeEntities(s);
  return s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * One short preview: the line(s) containing the search, joined with " / ".
 * Long previews are cut around the match so the match is always visible.
 */
export function makeSnippet(plain, query, max = 110) {
  const lines = String(plain || '').split('\n').filter(Boolean);
  const q = String(query || '').trim().toLowerCase();
  const hit = q ? lines.findIndex((l) => l.toLowerCase().includes(q)) : -1;
  let text = (hit >= 0 ? lines.slice(hit, hit + 2) : lines.slice(0, 2)).join(' / ');
  if (text.length <= max) return text;
  const pos = q ? text.toLowerCase().indexOf(q) : -1;
  if (pos >= 0 && pos + q.length > max - 12) {
    const start = Math.max(0, pos - 24);
    return '…' + text.slice(start, start + max - 1).trimEnd() + '…';
  }
  return text.slice(0, max).trimEnd() + '…';
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits text into parts for highlighting: [{ t, hit }].
 * Matches the whole phrase first (case-insensitive). If the phrase is not in this text,
 * each word of 2+ letters is highlighted instead.
 */
export function highlightParts(text, query) {
  const s = String(text ?? '');
  const phrase = String(query ?? '').trim();
  if (!s || !phrase) return [{ t: s, hit: false }];
  let re;
  if (s.toLowerCase().includes(phrase.toLowerCase())) {
    re = new RegExp(`(${escapeRe(phrase)})`, 'giu');
  } else {
    const words = [...new Set(phrase.split(/\s+/).filter((w) => w.length >= 2))]
      .sort((a, b) => b.length - a.length);
    if (!words.length) return [{ t: s, hit: false }];
    re = new RegExp(`(${words.map(escapeRe).join('|')})`, 'giu');
  }
  const out = [];
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), hit: false });
    out.push({ t: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last), hit: false });
  return out.length ? out : [{ t: s, hit: false }];
}
