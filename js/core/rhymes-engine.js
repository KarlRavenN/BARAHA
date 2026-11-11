// Local Phonetic Rhyme & Word Association Engine for BARAHA.
//
// Operates 100% offline with zero external APIs.
// Features:
// 1. Text normalization & colloquial Filipino contraction expansion
// 2. Filipino phonetics with vowel harmony (e/i, o/u) & digraph 'ng' handling
// 3. English battle-rap phonetic coda dictionary
// 4. Custom pronunciation dictionary integration (user-defined phonetics override)
// 5. Four distinct result categories:
//    - Strong / Exact Rhymes (Phonetic Coda Match)
//    - Close / Slant Rhymes (Assonance & Consonance)
//    - Multi-Syllable Rhymes (2-3 Syllable Cadence Match)
//    - Word Associations (Battle Rap Concepts — explicitly separated from rhymes)
// 6. Support for single words and phrase / multisyllabic bar search
// 7. Dynamic corpus expansion from user's active battle writing

// Starter battle rap vocabulary across Tagalog, Taglish, and English
export const BATTLE_RAP_LEXICON = [
  // A - ending open vowel
  'bara', 'tira', 'salita', 'makata', 'katha', 'tula', 'bira', 'kasa', 'bala', 'mukha',
  'banta', 'pasa', 'lasa', 'pata', 'sira', 'iba', 'bisa', 'kaya', 'taya', 'wala',
  'taliba', 'mahika', 'panata', 'pusta', 'laya', 'dambana', 'himala', 'ligaya', 'sandata',
  'paksa', 'kwela', 'hustisya', 'kapwa', 'biktima', 'sistema', 'problema', 'piring',
  // AW / AY - diphthongs
  'hataw', 'araw', 'galaw', 'sigaw', 'ikaw', 'agaw', 'silaw', 'ligaw', 'bitaw', 'tanglaw',
  'kamay', 'buhay', 'tulay', 'patay', 'alay', 'sabay', 'bantay', 'taglay', 'gabay', 'husay',
  // O / U - ending open vowel / vowel harmony
  'bano', 'punto', 'talo', 'panalo', 'regalo', 'kwento', 'bato', 'laro', 'sundalo',
  'ulo', 'dugo', 'puso', 'multo', 'litro', 'metro', 'asunto', 'respeto', 'kredito',
  'litrato', 'seryoso', 'estilo', 'titulo', 'bangko', 'trono', 'lason', 'hamon', 'ambon',
  // I / E - ending open vowel / vowel harmony
  'diskarte', 'atake', 'mensahe', 'biyahe', 'arte', 'pare', 'pre', 'ere', 'parte', 'kape',
  'sarili', 'sandali', 'katunggali', 'huli', 'mali', 'tali', 'sakali', 'bayani', 'uri', 'ganti',
  // AN / ANG - nasals
  'linya', 'linyahan', 'laban', 'patayan', 'harapan', 'hukuman', 'katotohanan', 'kasulatan',
  'sugatan', 'kasalanan', 'kalaban', 'sangkalan', 'asahan', 'tahanan', 'pintuan', 'larangan',
  'hakbang', 'tapang', 'yabang', 'linlang', 'harang', 'gulang', 'patlang', 'kulang', 'abang',
  // IM / IN - front nasals
  'talim', 'dilim', 'lalim', 'lihim', 'tingin', 'hangin', 'gising', 'singsing', 'dinggin', 'angkin',
  // OK / AT / AG / AK - stops (Tugmang Malakas)
  'suntok', 'kutob', 'putok', 'subok', 'luklok', 'yabag', 'tibag', 'tanyag', 'tatag',
  'banat', 'latag', 'sikat', 'alamat', 'pamagat', 'sapat', 'tapat', 'balat', 'alat',
  // Hip-hop English common battle rap words
  'bars', 'stars', 'scars', 'cards', 'hard', 'yard',
  'rhyme', 'time', 'climb', 'crime', 'dime', 'prime', 'grime',
  'flow', 'glow', 'blow', 'slow', 'know', 'pro', 'throw', 'grow',
  'heat', 'beat', 'seat', 'feet', 'defeat', 'street', 'meat',
  'round', 'sound', 'ground', 'bound', 'pound', 'crown', 'drown',
  'pen', 'ten', 'men', 'den', 'zen',
  'spit', 'hit', 'lit', 'quit', 'fit', 'bit', 'split',
  'real', 'feel', 'deal', 'steel', 'wheel',
  'stage', 'page', 'rage', 'cage', 'gauge',
  'choke', 'smoke', 'broke', 'stroke', 'joke', 'woke',
  'game', 'flame', 'name', 'shame', 'claim', 'fame', 'aim',
  'mind', 'blind', 'find', 'grind', 'signed',
];

// English phonetic dictionary for hip-hop battle lexicon
const ENGLISH_PHONETICS = {
  bars: 'B-AA-R-Z', stars: 'S-T-AA-R-Z', scars: 'S-K-AA-R-Z', cards: 'K-AA-R-D-Z', hard: 'HH-AA-R-D',
  rhyme: 'R-AY-M', time: 'T-AY-M', climb: 'K-L-AY-M', crime: 'K-R-AY-M', dime: 'D-AY-M', prime: 'P-R-AY-M',
  flow: 'F-L-OW', glow: 'G-L-OW', blow: 'B-L-OW', slow: 'S-L-OW', know: 'N-OW', pro: 'P-R-OW',
  heat: 'HH-IY-T', beat: 'B-IY-T', seat: 'S-IY-T', feet: 'F-IY-T', street: 'S-T-R-IY-T', defeat: 'D-IY-F-IY-T',
  round: 'R-AW-N-D', sound: 'S-AW-N-D', ground: 'G-R-AW-N-D', bound: 'B-AW-N-D', crown: 'K-R-AW-N',
  pen: 'P-EH-N', ten: 'T-EH-N', men: 'M-EH-N', den: 'D-EH-N',
  spit: 'S-P-IH-T', hit: 'HH-IH-T', lit: 'L-IH-T', quit: 'K-W-IH-T', fit: 'F-IH-T', bit: 'B-IH-T',
  real: 'R-IY-L', feel: 'F-IY-L', deal: 'D-IY-L', steel: 'S-T-IY-L', wheel: 'W-IY-L',
  stage: 'S-T-EY-JH', page: 'P-EY-JH', rage: 'R-EY-JH', cage: 'K-EY-JH', gauge: 'G-EY-JH',
  choke: 'CH-OW-K', smoke: 'S-M-OW-K', broke: 'B-R-OW-K', stroke: 'S-T-R-OW-K', joke: 'JH-OW-K',
  game: 'G-EY-M', flame: 'F-L-EY-M', name: 'N-EY-M', shame: 'SH-EY-M', claim: 'K-L-EY-M',
  mind: 'M-AY-N-D', blind: 'B-L-AY-N-D', find: 'F-AY-N-D', grind: 'G-R-AY-N-D',
};

// Semantic word associations for battle rap concepts
export const WORD_ASSOCIATIONS = {
  bar: ['card', 'deck', 'ace', 'sulat', 'punchline', 'tula', 'talim', 'kasa', 'bala', 'talino'],
  bara: ['baraha', 'alas', 'posas', 'kasa', 'bala', 'talas', 'linya', 'tugma', 'salita', 'makata'],
  card: ['baraha', 'deck', 'hand', 'deal', 'ace', 'joker', 'king', 'shuffle', 'play'],
  laban: ['tapatan', 'harapan', 'hamon', 'katunggali', 'hukom', 'suntok', 'dugo', 'arena'],
  battle: ['arena', 'stage', 'crowd', 'mic', 'round', 'league', 'opponent', 'glory', 'defeat'],
  apoy: ['init', 'sunog', 'abo', 'liyab', 'bagat', 'flame', 'fire', 'burn', 'smoke'],
  flow: ['alon', 'agos', 'hangin', 'kumpas', 'ritmo', 'delivery', 'cadence', 'breathe'],
  punchline: ['suntok', 'bagsak', 'knockout', 'tumba', 'epekto', 'hit', 'impact', 'linya'],
  angle: ['punto', 'isyu', 'ungkat', 'personal', 'kahinaan', 'bintang', 'tira', 'patama'],
  rebuttal: ['sagot', 'kontra', 'balik', 'salag', 'pukol', 'counter', 'quick', 'bawi'],
  scheme: ['koneksyon', 'kadena', 'buo', 'konsepto', 'tema', 'pattern', 'build', 'structure'],
  talim: ['kutsilyo', 'patalim', 'hiwa', 'dugo', 'sugat', 'talas', 'hasang', 'talino'],
  pera: ['datung', 'salapi', 'kredito', 'bangko', 'pusta', 'sugal', 'panalo', 'tubo'],
  gabi: ['dilim', 'lalim', 'multo', 'anino', 'kutob', 'lihim', 'panaginip'],
  sulat: ['papel', 'panitik', 'tinta', 'makata', 'linya', 'taludtod', 'katha'],
};

/**
 * Normalizes colloquial battle rap contractions and Tagalog colloquialisms.
 */
export function normalizeWord(raw) {
  if (!raw) return '';
  let w = raw.toLowerCase().trim();
  w = w.replace(/[^a-z0-9ñ'\-]/gi, '');
  if (w === "'di" || w === "di") return 'hindi';
  if (w === "'pag" || w === "pag") return 'kapag';
  if (w === "'wag" || w === "wag") return 'huwag';
  if (w === "mga") return 'manga';
  if (w === "'to") return 'ito';
  if (w === "'yan") return 'iyan';
  if (w === "'san") return 'saan';
  return w.replace(/^'+|'+$/g, '');
}

/**
 * Filipino vowel harmonization:
 * In spoken Tagalog and Balagtasan, e & i rhyme, and o & u rhyme.
 */
function harmonizeVowel(v) {
  if (v === 'e' || v === 'i') return 'I';
  if (v === 'o' || v === 'u') return 'U';
  return 'A';
}

/**
 * Extracts phonetic vowels from word with harmony applied.
 */
function getHarmonizedVowels(word) {
  const clean = word.toLowerCase();
  const vowels = [];
  for (const ch of clean) {
    if ('aeiou'.includes(ch)) {
      vowels.push(harmonizeVowel(ch));
    }
  }
  return vowels;
}

/**
 * Calculates the phonetic rhyme coda (the ending sound).
 */
export function getPhoneticCoda(word, customDict = {}) {
  const norm = normalizeWord(word);
  if (!norm) return '';

  // 1. Custom pronunciation overrides
  if (customDict && customDict[norm]) {
    const custom = customDict[norm].toUpperCase();
    const parts = custom.split('-');
    return parts.slice(-2).join('-');
  }

  // 2. English lexicon lookup
  if (ENGLISH_PHONETICS[norm]) {
    const parts = ENGLISH_PHONETICS[norm].split('-');
    return parts.slice(-2).join('-');
  }

  // 3. Filipino Phonetic Rule
  const tagalog = norm.replace(/ng/g, 'ŋ');

  // Diphthongs
  if (tagalog.endsWith('aw')) return 'A-W';
  if (tagalog.endsWith('ay')) return 'A-Y';
  if (tagalog.endsWith('iw')) return 'I-W';
  if (tagalog.endsWith('oy') || tagalog.endsWith('uy')) return 'U-Y';

  const match = tagalog.match(/([aeiou])([^aeiou]*)$/);
  if (!match) return norm.slice(-2);

  const [, vowel, cons] = match;
  const hv = harmonizeVowel(vowel);

  if (!cons) return `${hv}-OPEN`;

  let consClass = cons;
  if (cons === 'ŋ') consClass = 'NG';
  else if ('ptkbsd'.includes(cons)) consClass = 'STOP';
  else if ('lmnrw'.includes(cons)) consClass = 'SONORANT';

  return `${hv}-${consClass}`;
}

/**
 * Computes a human-readable ending sound tag (e.g. "-aen", "-at", "-ay", "-o")
 * for display on saved rhyme rows. Returns empty string if it cannot compute.
 */
export function getRhymeEndingTag(word) {
  const norm = normalizeWord(word);
  if (!norm) return '';
  const match = norm.match(/([aeiou][a-z]*)$/i);
  if (match) {
    const ending = match[1].toLowerCase();
    if (ending.length <= 4) return `-${ending}`;
    return `-${ending.slice(0, 3)}`;
  }
  return '';
}

/**
 * Gets multi-syllabic vowel cadence (last 2 or 3 harmonized vowels).
 */
export function getMultiCadenceKey(word, count = 2) {
  const vowels = getHarmonizedVowels(word);
  if (vowels.length < count) return vowels.join('-');
  return vowels.slice(-count).join('-');
}

/**
 * Search rhymes and associations against local dictionary + dynamic custom corpus.
 */
export function searchRhymes(query, extraWords = [], customDict = {}, mode = 'lastWord') {
  const raw = (query || '').trim();
  if (!raw) {
    return {
      query: '',
      exact: [],
      slant: [],
      multi: [],
      associations: [],
      notice: 'Enter a word or phrase to search local rhymes.',
    };
  }

  const tokens = raw.split(/\s+/).filter(Boolean);
  let targetWord = tokens[tokens.length - 1];
  const phraseEnding = tokens.slice(-2).join(' ');

  const normTarget = normalizeWord(targetWord);
  if (!normTarget || normTarget.length < 2) {
    return {
      query: targetWord,
      exact: [],
      slant: [],
      multi: [],
      associations: [],
      notice: 'Enter at least 2 letters to search local rhymes.',
    };
  }

  const queryCoda = getPhoneticCoda(normTarget, customDict);
  const queryMulti2 = getMultiCadenceKey(normTarget, 2);
  const queryMulti3 = getMultiCadenceKey(normTarget, 3);
  const queryVowels = getHarmonizedVowels(normTarget);
  const lastQueryVowel = queryVowels[queryVowels.length - 1];

  const corpus = Array.from(new Set([...BATTLE_RAP_LEXICON, ...extraWords]))
    .map((w) => normalizeWord(w))
    .filter((w) => w && w !== normTarget && w.length >= 2);

  const exact = [];
  const slant = [];
  const multi = [];

  for (const candidate of corpus) {
    if (candidate === normTarget) continue;

    const candCoda = getPhoneticCoda(candidate, customDict);
    const candVowels = getHarmonizedVowels(candidate);
    if (!candVowels.length) continue;

    const candMulti2 = getMultiCadenceKey(candidate, 2);
    const candMulti3 = getMultiCadenceKey(candidate, 3);
    const lastCandVowel = candVowels[candVowels.length - 1];

    let isExact = false;

    // 1. Strong / Exact Match
    if (queryCoda && candCoda && queryCoda === candCoda) {
      exact.push(candidate);
      isExact = true;
    } else if (normTarget.length >= 3 && candidate.endsWith(normTarget.slice(-3))) {
      exact.push(candidate);
      isExact = true;
    }

    // 2. Multisyllabic Match
    if (queryVowels.length >= 3 && candVowels.length >= 3 && queryMulti3 === candMulti3) {
      if (!isExact) multi.push(candidate);
    } else if (queryVowels.length >= 2 && candVowels.length >= 2 && queryMulti2 === candMulti2) {
      if (!isExact) multi.push(candidate);
    }

    // 3. Slant Rhyme
    if (!isExact && lastQueryVowel && lastCandVowel === lastQueryVowel) {
      slant.push(candidate);
    }
  }

  // 4. Word Associations
  const rawAssoc = WORD_ASSOCIATIONS[normTarget] || [];
  const associations = [...rawAssoc];
  for (const [key, list] of Object.entries(WORD_ASSOCIATIONS)) {
    if (list.includes(normTarget) && !associations.includes(key)) {
      associations.push(key);
    }
  }

  return {
    query: targetWord,
    phrase: phraseEnding,
    exact: Array.from(new Set(exact)).slice(0, 35),
    slant: Array.from(new Set(slant.filter((w) => !exact.includes(w) && !multi.includes(w)))).slice(0, 35),
    multi: Array.from(new Set(multi.filter((w) => !exact.includes(w)))).slice(0, 35),
    associations: Array.from(new Set(associations)).slice(0, 20),
    notice: 'Local phonetic engine. Tagalog vowel harmony, phonetic codas & cadence patterns calculated 100% offline.',
  };
}
