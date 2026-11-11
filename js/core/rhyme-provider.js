// Optional online rhyme provider (English only) for BARAHA.
//
// Uses the free Datamuse API (https://www.datamuse.com/api/), the same data that powers
// RhymeZone. It is OFF by default: it only runs when the user turns on
// "English rhyme suggestions" in Settings, and it only ever sends the single English
// word being searched, never battle text. Results are cached in localStorage so the
// same word is never requested twice and keeps working offline afterwards.

const CACHE_KEY = 'baraha.rhymeCache.v1';
const CACHE_MAX = 300;

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}

function writeCache(cache) {
  try {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      keys.sort((a, b) => (cache[a].t || 0) - (cache[b].t || 0))
        .slice(0, keys.length - CACHE_MAX)
        .forEach((k) => delete cache[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage full or unavailable: caching is best-effort */ }
}

/** Returns English rhymes for one word: perfect rhymes first, then near rhymes. Never throws. */
export async function fetchEnglishRhymes(word, { timeoutMs = 4000 } = {}) {
  const w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (w.length < 3) return [];

  const cache = readCache();
  if (cache[w]) return cache[w].words;

  if (typeof fetch !== 'function') return [];
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return [];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const get = async (rel) => {
      const res = await fetch(`https://api.datamuse.com/words?${rel}=${encodeURIComponent(w)}&max=40`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Datamuse ${res.status}`);
      return res.json();
    };
    const [perfect, near] = await Promise.all([get('rel_rhy'), get('rel_nry')]);
    const seen = new Set([w]);
    const words = [];
    for (const row of [...perfect, ...near]) {
      const text = String(row.word || '').toLowerCase();
      if (!/^[a-z' -]{2,30}$/.test(text) || text.split(' ').length > 2 || seen.has(text)) continue;
      seen.add(text);
      words.push(text);
    }
    cache[w] = { words, t: Date.now() };
    writeCache(cache);
    return words;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
