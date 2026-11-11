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

  // More Tagalog / Taglish battle vocabulary
  'tama', 'sama', 'mata', 'bata', 'dila', 'pinta', 'ganda', 'bida', 'bigla', 'tuwa', 'wika', 'mura', 'tuta', 'hula', 'bula', 'luma',
  'tao', 'gulo', 'mundo', 'kanto', 'gusto', 'trabaho', 'pasko', 'ano', 'ako', 'sino', 'sayo', 'bago', 'dulo',
  'bayan', 'daan', 'gawain', 'salamin', 'dating', 'tadhana', 'kalayaan', 'kapatid', 'kabayan', 'karanasan', 'karunungan', 'katapangan',
  'bugbog', 'bagsak', 'tumbok', 'yapak', 'sampal', 'hampas', 'tadyak', 'sipa', 'sapak', 'lagapak', 'lakas', 'tapak', 'pitik', 'dikdik',
  'durog', 'basag', 'bulok', 'kulong', 'salpok', 'sabog', 'yanig', 'lindol', 'bagyo', 'unos', 'kidlat', 'kulog', 'ulan', 'abo', 'usok',
  'espada', 'pana', 'sibat', 'palakol', 'tabak', 'balisong', 'mayabang', 'mahina', 'malakas', 'duwag', 'takot', 'lupit', 'bangis', 'sindak',
  'kaba', 'pawis', 'luha', 'laman', 'buto', 'kilay', 'bibig', 'tenga', 'noo', 'ngipin', 'kamao', 'paa', 'tuhod', 'balikat', 'siko',
  'likod', 'dibdib', 'daliri', 'kuko', 'buhok', 'sikmura', 'tugma', 'sukat', 'saknong', 'taludtod', 'balagtasan', 'hiphop', 'entablado',
  // More English (all have phonetic entries)
  'fire', 'liar', 'higher', 'desire', 'wire', 'tired', 'inspire', 'fight', 'night', 'light', 'right', 'write', 'sight', 'might', 'tight', 'bite', 'ignite', 'hate', 'late', 'fate', 'wait', 'great', 'straight', 'weight', 'debate', 'make', 'take', 'fake', 'break', 'shake', 'wake', 'snake', 'mistake', 'back', 'attack', 'track', 'crack', 'stack', 'black', 'kill', 'skill', 'still', 'will', 'thrill', 'chill', 'drill', 'way', 'say', 'play', 'day', 'pay', 'stay', 'away', 'okay', 'free', 'see', 'me', 'be', 'key', 'city', 'money', 'ready', 'line', 'mine', 'fine', 'sign', 'shine', 'bone', 'stone', 'alone', 'throne', 'phone', 'known', 'own', 'dead', 'head', 'said', 'instead', 'more', 'war', 'core', 'score', 'floor', 'door', 'before', 'gun', 'fun', 'done', 'run', 'son', 'one', 'soul', 'goal', 'whole', 'role', 'control', 'cool', 'rule', 'school', 'fool', 'tool', 'pain', 'brain', 'chain', 'rain', 'insane', 'train', 'word', 'heard', 'absurd', 'face', 'place', 'space', 'race', 'chase', 'erase', 'boss', 'loss', 'cross', 'toss',
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

  fire: 'F-AY-ER', liar: 'L-AY-ER', higher: 'HH-AY-ER', desire: 'D-IH-Z-AY-ER', wire: 'W-AY-ER', tired: 'T-AY-ER-D', inspire: 'IH-N-S-P-AY-ER',
  fight: 'F-AY-T', night: 'N-AY-T', light: 'L-AY-T', right: 'R-AY-T', write: 'R-AY-T', sight: 'S-AY-T', might: 'M-AY-T', tight: 'T-AY-T', bite: 'B-AY-T', ignite: 'IH-G-N-AY-T',
  hate: 'HH-EY-T', late: 'L-EY-T', fate: 'F-EY-T', wait: 'W-EY-T', great: 'G-R-EY-T', straight: 'S-T-R-EY-T', weight: 'W-EY-T', debate: 'D-IH-B-EY-T',
  make: 'M-EY-K', take: 'T-EY-K', fake: 'F-EY-K', break: 'B-R-EY-K', shake: 'SH-EY-K', wake: 'W-EY-K', snake: 'S-N-EY-K', mistake: 'M-IH-S-T-EY-K',
  back: 'B-AE-K', attack: 'AH-T-AE-K', track: 'T-R-AE-K', crack: 'K-R-AE-K', stack: 'S-T-AE-K', black: 'B-L-AE-K',
  kill: 'K-IH-L', skill: 'S-K-IH-L', still: 'S-T-IH-L', will: 'W-IH-L', thrill: 'TH-R-IH-L', chill: 'CH-IH-L', drill: 'D-R-IH-L',
  way: 'W-EY', say: 'S-EY', play: 'P-L-EY', day: 'D-EY', pay: 'P-EY', stay: 'S-T-EY', away: 'AH-W-EY', okay: 'OW-K-EY',
  free: 'F-R-IY', see: 'S-IY', me: 'M-IY', be: 'B-IY', key: 'K-IY', city: 'S-IH-T-IY', money: 'M-AH-N-IY', ready: 'R-EH-D-IY',
  line: 'L-AY-N', mine: 'M-AY-N', fine: 'F-AY-N', sign: 'S-AY-N', shine: 'SH-AY-N',
  bone: 'B-OW-N', stone: 'S-T-OW-N', alone: 'AH-L-OW-N', throne: 'TH-R-OW-N', phone: 'F-OW-N', known: 'N-OW-N', own: 'OW-N',
  dead: 'D-EH-D', head: 'HH-EH-D', said: 'S-EH-D', instead: 'IH-N-S-T-EH-D',
  more: 'M-AO-R', war: 'W-AO-R', core: 'K-AO-R', score: 'S-K-AO-R', floor: 'F-L-AO-R', door: 'D-AO-R', before: 'B-IH-F-AO-R',
  gun: 'G-AH-N', fun: 'F-AH-N', done: 'D-AH-N', run: 'R-AH-N', son: 'S-AH-N', one: 'W-AH-N',
  soul: 'S-OW-L', goal: 'G-OW-L', whole: 'HH-OW-L', role: 'R-OW-L', control: 'K-AH-N-T-R-OW-L',
  cool: 'K-UW-L', rule: 'R-UW-L', school: 'S-K-UW-L', fool: 'F-UW-L', tool: 'T-UW-L',
  pain: 'P-EY-N', brain: 'B-R-EY-N', chain: 'CH-EY-N', rain: 'R-EY-N', insane: 'IH-N-S-EY-N', train: 'T-R-EY-N',
  word: 'W-ER-D', heard: 'HH-ER-D', absurd: 'AH-B-S-ER-D',
  face: 'F-EY-S', place: 'P-L-EY-S', space: 'S-P-EY-S', race: 'R-EY-S', chase: 'CH-EY-S', erase: 'IH-R-EY-S',
  boss: 'B-AO-S', loss: 'L-AO-S', cross: 'K-R-AO-S', toss: 'T-AO-S',
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

// ---------------------------------------------------------------------------
// Phoneme model
//
// Every word (Tagalog, English or user-defined) is turned into the same kind of
// token list: UPPERCASE tokens are vowels (A, I, U or a diphthong like AW, AY),
// lowercase tokens are consonants. Tagalog vowel harmony (e~i, o~u) is baked into
// the vowel tokens. Rhyme matching then compares the *tail* of the token list,
// starting from the last 1, 2 or 3 vowels.
// ---------------------------------------------------------------------------

const ARPA_VOWEL = {
  AA: 'A', AE: 'A', AH: 'A', AO: 'U', AW: 'AW', AY: 'AY', EH: 'I', EY: 'IY',
  IH: 'I', IY: 'I', OW: 'U', OY: 'UY', UH: 'U', UW: 'U',
};
const ARPA_CONS = {
  B: 'b', CH: 'ch', D: 'd', DH: 'd', F: 'f', G: 'g', HH: 'h', JH: 'j', K: 'k', L: 'l', M: 'm',
  N: 'n', NG: 'ŋ', P: 'p', R: 'r', S: 's', SH: 'sh', T: 't', TH: 't', V: 'v', W: 'w', Y: 'y',
  Z: 'z', ZH: 'sh',
};
// Voiced/voiceless pairs count as the same sound for "exact" (bag ~ back, bars ~ barz).
const VOICING = { b: 'p', d: 't', g: 'k', z: 's', v: 'f', j: 'ch' };
// Broad consonant families for "slant" rhymes (n~m~ng, any stop, any sibilant...).
const FAMILY = {
  m: 'N', n: 'N', 'ŋ': 'N', p: 'S', b: 'S', t: 'S', d: 'S', k: 'S', g: 'S',
  s: 'Z', z: 'Z', sh: 'Z', ts: 'Z', ch: 'Z', j: 'Z', dy: 'Z', l: 'L', r: 'L',
  w: 'W', y: 'W', f: 'F', v: 'F', h: 'F',
};

const isVowelTok = (t) => t.charCodeAt(0) < 91;

function harmonizeVowel(v) {
  if (v === 'e' || v === 'i') return 'I';
  if (v === 'o' || v === 'u') return 'U';
  return 'A';
}

function collapseDoubles(toks) {
  const out = [];
  for (const t of toks) {
    if (!isVowelTok(t) && out.length && out[out.length - 1] === t) continue;
    out.push(t);
  }
  return out;
}

function arpaToTokens(parts) {
  const out = [];
  for (const raw of parts) {
    const p = String(raw).toUpperCase();
    if (p === 'ER') { out.push('I', 'r'); continue; }
    if (ARPA_VOWEL[p]) out.push(ARPA_VOWEL[p]);
    else if (ARPA_CONS[p]) out.push(ARPA_CONS[p]);
    else if (p.length === 1 && 'AEIOU'.includes(p)) out.push(harmonizeVowel(p.toLowerCase()));
    else if (/^[A-Z]+$/.test(p)) out.push(p.toLowerCase());
  }
  return collapseDoubles(out);
}

/** Tagalog is spelled close to how it sounds, so we can tokenize the spelling directly. */
function tagalogTokens(str) {
  const w = String(str).toLowerCase()
    .replace(/ñ/g, 'ny').replace(/ng/g, 'ŋ').replace(/ts/g, 'ʦ')
    .replace(/qu/g, 'k').replace(/c(?=[ei])/g, 's').replace(/c/g, 'k')
    .replace(/ph/g, 'f').replace(/sh/g, 'ʃ').replace(/ch/g, 'ʧ').replace(/th/g, 't');
  const MARK = { 'ʦ': 'ts', 'ʃ': 'sh', 'ʧ': 'ch' };
  const toks = [];
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    if ('aeiou'.includes(ch)) {
      const base = harmonizeVowel(ch);
      const nx = w[i + 1];
      const nn = w[i + 2];
      // vowel + w/y that is NOT followed by a vowel = diphthong (aw, ay, iw, oy, uy)
      if ((nx === 'w' || nx === 'y') && (!nn || !'aeiou'.includes(nn))) {
        toks.push(base + nx.toUpperCase());
        i++;
      } else {
        toks.push(base);
      }
    } else if (/[a-zŋʦʃʧ]/.test(ch)) {
      toks.push(MARK[ch] || ch);
    }
  }
  return collapseDoubles(toks);
}

// Spelling-ending -> English sound, for English words that are not in the dictionary.
const ENGLISH_ENDINGS = Object.entries({
  ation: 'EY-SH-AH-N', tion: 'SH-AH-N', sion: 'ZH-AH-N', ight: 'AY-T', ire: 'AY-ER', iar: 'AY-ER', yer: 'AY-ER',
  ound: 'AW-N-D', eat: 'IY-T', eet: 'IY-T', eal: 'IY-L', eel: 'IY-L', eam: 'IY-M', ean: 'IY-N', een: 'IY-N',
  eed: 'IY-D', ake: 'EY-K', ate: 'EY-T', ade: 'EY-D', ame: 'EY-M', ane: 'EY-N', ace: 'EY-S', age: 'EY-JH',
  ain: 'EY-N', ail: 'EY-L', ait: 'EY-T', ay: 'EY', ide: 'AY-D', ine: 'AY-N', ime: 'AY-M', ike: 'AY-K',
  ife: 'AY-F', oke: 'OW-K', ole: 'OW-L', one: 'OW-N', ose: 'OW-Z', ode: 'OW-D', ote: 'OW-T', oat: 'OW-T',
  oad: 'OW-D', old: 'OW-L-D', ow: 'OW', oe: 'OW', oor: 'AO-R', our: 'AO-R', ing: 'IH-NG', er: 'ER',
  ee: 'IY', ue: 'UW', ew: 'UW', ool: 'UW-L', oom: 'UW-M', ood: 'UH-D', ook: 'UH-K', uck: 'AH-K',
  ick: 'IH-K', ock: 'AA-K', ack: 'AE-K', ill: 'IH-L', all: 'AO-L', ell: 'EH-L', and: 'AE-N-D', end: 'EH-N-D', ind: 'AY-N-D',
}).sort((a, b) => b[0].length - a[0].length);

const ENGLISH_HINT = /[cfjqvxz]|th|sh|ck|ph|wh|gh|ou|ea|ee|ie|tion|^kn|[^aeiouy]y$/;

/** True when a word is in the English dictionary or its spelling is clearly English. */
export function isEnglishWord(raw) {
  const w = normalizeWord(raw);
  return !!w && (!!ENGLISH_PHONETICS[w] || ENGLISH_HINT.test(w));
}

function englishTokens(w) {
  for (const [suffix, phones] of ENGLISH_ENDINGS) {
    if (w.length > suffix.length && w.endsWith(suffix)) {
      return collapseDoubles([...tagalogTokens(w.slice(0, -suffix.length)), ...arpaToTokens(phones.split('-'))]);
    }
  }
  if (/[^aeiouy]y$/.test(w)) return collapseDoubles([...tagalogTokens(w.slice(0, -1)), 'I']);
  return tagalogTokens(w);
}

const tokenCache = new Map();
function wordTokens(norm, customDict) {
  const custom = customDict && customDict[norm];
  if (custom) return String(custom).includes('-') ? arpaToTokens(String(custom).split('-')) : tagalogTokens(custom);
  if (tokenCache.has(norm)) return tokenCache.get(norm);
  let toks;
  if (ENGLISH_PHONETICS[norm]) toks = arpaToTokens(ENGLISH_PHONETICS[norm].split('-'));
  else if (ENGLISH_HINT.test(norm)) toks = englishTokens(norm);
  else toks = tagalogTokens(norm);
  tokenCache.set(norm, toks);
  return toks;
}

function buildInfo(tokens, words) {
  const vi = [];
  tokens.forEach((t, i) => { if (isVowelTok(t)) vi.push(i); });
  const n = vi.length;
  if (!n) return null;
  const tail = (k) => (n >= k ? tokens.slice(vi[n - k]) : null);
  const strict = (a) => (a ? a.map((t) => VOICING[t] || t).join('.') : null);
  const family = (a) => (a ? a.map((t) => (isVowelTok(t) ? t : FAMILY[t] || t)).join('.') : null);
  const t1 = tail(1);
  const t2 = tail(2);
  const t3 = tail(3);
  return {
    words,
    nV: n,
    lastV: tokens[vi[n - 1]],
    penV: n > 1 ? tokens[vi[n - 2]] : '',
    coda: t1.length - 1,
    s1: strict(t1), s2: strict(t2), s3: strict(t3),
    c1: family(t1), c2: family(t2),
  };
}

function analyzeText(text, customDict) {
  const words = String(text).split(/\s+/).map(normalizeWord).filter(Boolean);
  if (!words.length) return null;
  return buildInfo(words.flatMap((w) => wordTokens(w, customDict)), words);
}

/**
 * Scores how well candidate `c` rhymes with query `q`.
 * Returns { group, score } or null when they do not rhyme at all.
 *   multi  = last 2+ syllables match (best)
 *   exact  = last syllable matches (same vowel family + same ending consonants)
 *   slant  = same vowel with a related consonant (n~m~ng, any stop...) or assonance
 */
function scorePair(q, c) {
  if (q.s3 && q.s3 === c.s3) return { group: 'multi', score: 100 };
  if (q.s2 && q.s2 === c.s2) return { group: 'multi', score: 88 };
  const penMatch = !!q.penV && q.penV === c.penV;
  if (q.s1 === c.s1) {
    if (q.coda > 0) return { group: 'exact', score: 60 + (penMatch ? 6 : 0) };
    // open vowel ending (…o, …a): only "exact" when the vowel before it matches too
    if (!q.penV && !c.penV) return { group: 'exact', score: 55 }; // both one syllable: flow ~ glow
    return penMatch ? { group: 'exact', score: 48 } : { group: 'slant', score: 34 };
  }
  if (q.c2 && q.c2 === c.c2) return { group: 'slant', score: 52 };
  if (q.c1 === c.c1) return { group: 'slant', score: 34 + (penMatch ? 10 : 0) };
  if (q.lastV === c.lastV && penMatch && c.nV >= 2) return { group: 'slant', score: 18 };
  return null;
}

const infoCache = new Map();
function candidateInfo(text, customDict, useCache) {
  if (useCache && infoCache.has(text)) return infoCache.get(text);
  const info = analyzeText(text, customDict);
  if (useCache) {
    if (infoCache.size > 20000) infoCache.clear();
    infoCache.set(text, info);
  }
  return info;
}

/** Legacy helpers, kept so older callers keep working. */
export function getPhoneticCoda(word, customDict = {}) {
  const info = analyzeText(word, customDict);
  return info ? info.s1.replace(/\./g, '-').toUpperCase() : '';
}

export function getMultiCadenceKey(word, count = 2) {
  const toks = String(word).split(/\s+/).map(normalizeWord).filter(Boolean).flatMap((w) => wordTokens(w, {}));
  return toks.filter(isVowelTok).slice(-count).join('-');
}

/**
 * Human-readable ending sound for saved rhyme rows, e.g. "kalaban" -> "-aban".
 * Uses the last two syllables when they are short enough, otherwise the last one.
 */
export function getRhymeEndingTag(word) {
  const parts = String(word || '').trim().split(/\s+/);
  const norm = normalizeWord(parts[parts.length - 1]);
  if (!norm) return '';
  const two = norm.match(/[aeiou][^aeiou]*[aeiou][^aeiou]*$/i);
  if (two && two[0].length <= 6) return `-${two[0]}`;
  const one = norm.match(/[aeiou][^aeiou]*$/i);
  return one ? `-${one[0]}` : '';
}

/**
 * Pulls rhymeable material out of the user's own writing: every word, plus the
 * last 2 and 3 words of every line (bar endings), so multi-word rhymes can be found.
 */
export function extractCorpus(texts, { max = 5000 } = {}) {
  const out = new Set();
  for (const t of texts || []) {
    if (!t) continue;
    const clean = String(t)
      .replace(/<\s*(br|\/p|\/div|\/li)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ');
    for (const line of clean.split(/[\n.!?;,]+/)) {
      const ws = line.split(/\s+/)
        .map((w) => w.replace(/^[^a-zA-ZñÑ']+|[^a-zA-ZñÑ']+$/g, ''))
        .filter((w) => /[a-zA-ZñÑ]{2,}/.test(w));
      for (const w of ws) {
        if (w.replace(/[^a-zA-ZñÑ]/g, '').length >= 3) out.add(w.toLowerCase());
      }
      if (ws.length >= 2) out.add(ws.slice(-2).join(' ').toLowerCase());
      if (ws.length >= 3) out.add(ws.slice(-3).join(' ').toLowerCase());
      if (out.size >= max) return [...out];
    }
  }
  return [...out];
}

function emptyResult(query, notice) {
  return { query, exact: [], slant: [], multi: [], associations: [], english: [], englishHint: false, notice };
}

/**
 * Search rhymes and associations against the local dictionary + the user's own words.
 *   mode 'auto'     : one word = last-word search, several words = phrase-ending search
 *   mode 'lastWord' : always search by the last word only
 */
export function searchRhymes(query, extraWords = [], customDict = {}, mode = 'auto') {
  const raw = (query || '').trim();
  if (!raw) return emptyResult('', 'Enter a word or phrase to search local rhymes.');

  const words = raw.split(/\s+/).map(normalizeWord).filter(Boolean);
  const lastWord = words[words.length - 1];
  if (!lastWord || lastWord.length < 2) {
    return emptyResult(lastWord || raw, 'Enter at least 2 letters to search local rhymes.');
  }

  const usePhrase = mode !== 'lastWord' && words.length > 1;
  const qWords = usePhrase ? words.slice(-3) : [lastWord];
  const qText = qWords.join(' ');
  const q = analyzeText(qText, customDict);
  if (!q) return emptyResult(lastWord, 'Could not find a vowel sound in that word.');

  const userSet = new Set((extraWords || []).map((w) => String(w).toLowerCase().trim()));
  const pool = new Set([...BATTLE_RAP_LEXICON, ...userSet]);
  const useCache = !customDict || !Object.keys(customDict).length;

  const buckets = { exact: new Map(), multi: new Map(), slant: new Map() };
  for (const text of pool) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.replace(/[^a-zñ]/gi, '').length < 2 || clean === qText) continue;
    const candWords = clean.split(' ');
    if (normalizeWord(candWords[candWords.length - 1]) === lastWord) continue; // skip the same word
    const info = candidateInfo(clean, customDict, useCache);
    if (!info) continue;
    const hit = scorePair(q, info);
    if (!hit) continue;
    if (candWords.length > 1 && hit.group === 'slant') continue; // phrases only for solid matches
    let score = hit.score + (userSet.has(clean) ? 7 : 0) - Math.abs(info.nV - q.nV) * 1.5;
    const m = buckets[hit.group];
    if (!m.has(clean) || m.get(clean) < score) m.set(clean, score);
  }
  const top = (m, n = 35) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).slice(0, n).map((e) => e[0]);

  const assocKey = lastWord;
  const associations = [...(WORD_ASSOCIATIONS[assocKey] || [])];
  for (const [key, list] of Object.entries(WORD_ASSOCIATIONS)) {
    if (list.includes(assocKey) && !associations.includes(key)) associations.push(key);
  }

  return {
    query: usePhrase ? qText : lastWord,
    phrase: qWords.slice(-2).join(' '),
    multi: top(buckets.multi),
    exact: top(buckets.exact),
    slant: top(buckets.slant),
    associations: Array.from(new Set(associations)).slice(0, 20),
    english: [],
    englishHint: isEnglishWord(lastWord),
    notice: 'Local phonetic engine. Tagalog vowel harmony, ending sounds & ranked multi-syllable matches calculated 100% offline.',
  };
}
