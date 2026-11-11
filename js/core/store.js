// Domain data layer. All persistence goes through the injected backend (see db.js).
// UI modules import from here, never from db.js directly.

import { STORES } from './db.js';
import { uid, nowIso } from './util.js';
import { searchRhymes, extractCorpus, isEnglishWord, normalizeWord } from './rhymes-engine.js';
import { fetchEnglishRhymes } from './rhyme-provider.js';
import { createZip, readZip } from './zip.js';

let backend = null;
export const setBackend = (b) => { backend = b; };
const be = () => { if (!backend) throw new Error('Storage backend not initialised'); return backend; };

export const BATTLE_STATUSES = ['Writing', 'Completed', 'Dropped'];
export const ROUND_NUMBERS = [1, 2, 3];
export const DEFAULT_ROUND_PRESETS = ['Round 1', 'Round 2', 'Round 3', 'Draft'];
export const BACKUP_FORMAT = 'baraha-backup';
export const BACKUP_VERSION = 2; // v2 adds ZIP backup with audio blobs

/** Normalizes legacy battle statuses to simplified model (Writing, Completed, Dropped) */
export function normalizeBattleStatus(status) {
  if (!status) return 'Writing';
  if (status === 'Writing' || status === 'Completed' || status === 'Dropped') return status;
  if (status === 'Planning') return 'Writing';
  if (status === 'Ready' || status === 'Done') return 'Completed';
  return 'Writing';
}

export const DRAFT_CATEGORIES = [
  'Punchline', 'Angle', 'Wordplay', 'Word Association',
  'Personal', 'Joke', 'Rebuttal', 'Scheme', 'Reference', 'Random Idea',
];

export const DRAFT_STATUSES = [
  'In Progress', 'Done',
];
export const LEGACY_DRAFT_STATUSES = [
  'Raw Idea', 'Developing', 'Needs Improvement', 'Ready to Use', 'Used', 'Archived',
];

/** Normalizes legacy draft statuses to simplified 2-state model */
export function normalizeDraftStatus(status) {
  if (!status) return 'In Progress';
  if (status === 'Done' || status === 'Used') return 'Done';
  if (status === 'Archived') return 'Archived';
  return 'In Progress';
}

export const SCHEME_STATUSES = [
  'Drafting', 'In Progress', 'Solid', 'Used', 'Archived',
];

export const RHYME_KINDS = ['word', 'phrase', 'multi'];

export const SCAN_MATCH_CATEGORIES = ['Exact Match', 'Phrase Match', 'Possible Similarity'];

// ---------- Battles ----------

/** Creates a battle and exactly three rounds in ONE atomic batch. */
export async function createBattle(fields = {}) {
  const t = nowIso();
  const rawStatus = fields.status;
  const status = BATTLE_STATUSES.includes(rawStatus) ? rawStatus : normalizeBattleStatus(rawStatus);
  const battle = {
    id: uid(),
    title: (fields.title || '').trim() || 'Untitled battle',
    opponentName: (fields.opponentName || '').trim(),
    opponentId: fields.opponentId || null,
    league: (fields.league || '').trim(),
    battleDate: fields.battleDate || '',
    status: status || 'Writing',
    location: (fields.location || '').trim(),
    notes: fields.notes || '',
    archived: false,
    pinned: !!fields.pinned,
    pinOrder: typeof fields.pinOrder === 'number' ? fields.pinOrder : 0,
    wallOrder: typeof fields.wallOrder === 'number' ? fields.wallOrder : 0,
    wallOrderedAt: fields.wallOrderedAt || null,
    createdAt: t, updatedAt: t, lastOpenedAt: null,
  };
  const rounds = [
    { id: uid(), battleId: battle.id, name: 'Round 1', number: 1, order: 1, kind: 'round', notes: '', completed: false, createdAt: t, updatedAt: t },
    { id: uid(), battleId: battle.id, name: 'Round 2', number: 2, order: 2, kind: 'round', notes: '', completed: false, createdAt: t, updatedAt: t },
    { id: uid(), battleId: battle.id, name: 'Round 3', number: 3, order: 3, kind: 'round', notes: '', completed: false, createdAt: t, updatedAt: t },
    { id: uid(), battleId: battle.id, name: 'Draft', number: 4, order: 4, kind: 'draft', notes: '', completed: false, createdAt: t, updatedAt: t },
  ];
  await be().batch([
    { op: 'put', store: 'battles', value: battle },
    ...rounds.map((r) => ({ op: 'put', store: 'rounds', value: r })),
  ]);
  return { battle, rounds };
}

export const getBattle = (id) => be().get('battles', id);

export async function listBattles() {
  const all = await be().getAll('battles');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updateBattle(id, fields) {
  const b = await getBattle(id);
  if (!b) throw new Error('Battle not found');
  const allowed = ['title', 'opponentName', 'opponentId', 'league', 'battleDate', 'status', 'location', 'notes', 'pinned', 'pinOrder', 'wallOrder', 'wallOrderedAt'];
  for (const k of allowed) {
    if (k in fields) {
      if (k === 'status') {
        b[k] = normalizeBattleStatus(fields[k]);
      } else if (k === 'pinned') {
        b[k] = !!fields[k];
      } else if (k === 'pinOrder' || k === 'wallOrder') {
        b[k] = typeof fields[k] === 'number' ? fields[k] : 0;
      } else {
        b[k] = typeof fields[k] === 'string' && k !== 'notes' ? fields[k].trim() : fields[k];
      }
    }
  }
  if (!b.title) b.title = 'Untitled battle';
  b.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'battles', value: b }]);
  return b;
}

export async function toggleBattlePin(battleId) {
  const b = await getBattle(battleId);
  if (!b) throw new Error('Battle not found');
  b.pinned = !b.pinned;
  b.wallOrderedAt = nowIso();
  b.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'battles', value: b }]);
  return b;
}

export async function updateBattlesOrder(updates) {
  const t = nowIso();
  const ops = [];
  for (const u of updates) {
    const b = await getBattle(u.id);
    if (!b) continue;
    if (u.wallOrder !== undefined) b.wallOrder = u.wallOrder;
    if (u.pinOrder !== undefined) b.pinOrder = u.pinOrder;
    b.wallOrderedAt = u.wallOrderedAt || t;
    ops.push({ op: 'put', store: 'battles', value: b });
  }
  if (ops.length > 0) {
    await be().batch(ops);
  }
}

export function sortBattleGroup(battles, isPinned = false) {
  const jumping = [];
  const manual = [];

  for (const b of battles) {
    const isCompletedOrDropped = b.status === 'Completed' || b.status === 'Dropped';
    const hasBeenOrdered = !!b.wallOrderedAt;
    const isEditedAfterOrder = b.updatedAt && b.wallOrderedAt && b.updatedAt > b.wallOrderedAt;

    // Only active Writing battles jump to top when edited or when not manually ordered yet
    const shouldJump = !isCompletedOrDropped && (!hasBeenOrdered || isEditedAfterOrder);

    if (shouldJump) {
      jumping.push(b);
    } else {
      manual.push(b);
    }
  }

  // Jumping cards: newest edit first
  jumping.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  // Manual cards: ordered by pinOrder (if pinned) or wallOrder (if unpinned)
  manual.sort((a, b) => {
    const orderA = isPinned ? (typeof a.pinOrder === 'number' ? a.pinOrder : (a.wallOrder ?? 0)) : (a.wallOrder ?? 0);
    const orderB = isPinned ? (typeof b.pinOrder === 'number' ? b.pinOrder : (b.wallOrder ?? 0)) : (b.wallOrder ?? 0);
    if (orderA !== orderB) return orderA - orderB;
    const timeA = a.wallOrderedAt || a.createdAt || '';
    const timeB = b.wallOrderedAt || b.createdAt || '';
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });

  return [...jumping, ...manual];
}

export function sortWallBattles(battles) {
  const normalized = (battles || []).map((b) => ({
    ...b,
    pinned: !!b.pinned,
    pinOrder: typeof b.pinOrder === 'number' ? b.pinOrder : 0,
    wallOrder: typeof b.wallOrder === 'number' ? b.wallOrder : 0,
    wallOrderedAt: b.wallOrderedAt || null,
    status: normalizeBattleStatus(b.status),
  }));

  const pinned = sortBattleGroup(normalized.filter((b) => b.pinned), true);
  const unpinned = sortBattleGroup(normalized.filter((b) => !b.pinned), false);

  return [...pinned, ...unpinned];
}

export async function updateBattleStatus(battleId, status) {
  return updateBattle(battleId, { status });
}

export async function toggleRoundCompleted(roundId) {
  const r = await getRound(roundId);
  if (!r) throw new Error('Round not found');
  r.completed = !r.completed;
  r.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'rounds', value: r }]);
  return r;
}

export async function setRoundCompleted(roundId, completed = true) {
  const r = await getRound(roundId);
  if (!r) throw new Error('Round not found');
  r.completed = !!completed;
  r.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'rounds', value: r }]);
  return r;
}

export async function listAllRounds() {
  return be().getAll('rounds');
}

export async function setArchived(id, archived) {
  const b = await getBattle(id);
  if (!b) throw new Error('Battle not found');
  b.archived = !!archived;
  b.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'battles', value: b }]);
  return b;
}

/** Records that a battle was opened (drives "recent battles"). Does not change updatedAt. */
export async function touchOpened(id) {
  const b = await getBattle(id);
  if (!b) return null;
  b.lastOpenedAt = nowIso();
  await be().batch([{ op: 'put', store: 'battles', value: b }]);
  return b;
}

/**
 * Deletes one battle and ONLY the material owned by it. Other battles are untouched.
 */
export async function deleteBattle(id) {
  const ops = [{ op: 'delete', store: 'battles', key: id }];
  for (const store of ['rounds', 'finalMaterials', 'drafts', 'schemes', 'rhymes', 'voiceNotes', 'scans']) {
    const rows = await be().getAllByIndex(store, 'battleId', id);
    const keyPath = STORES[store].keyPath;
    for (const r of rows) {
      ops.push({ op: 'delete', store, key: r[keyPath] });
      if (store === 'voiceNotes') {
        const blobs = await be().getAllByIndex('audioBlobs', 'voiceNoteId', r.id);
        blobs.forEach((x) => ops.push({ op: 'delete', store: 'audioBlobs', key: x.id }));
      }
      if (store === 'schemes') {
        const links = await be().getAllByIndex('schemeDrafts', 'schemeId', r.id);
        links.forEach((x) => ops.push({ op: 'delete', store: 'schemeDrafts', key: x.id }));
      }
      if (store === 'scans') {
        const ms = await be().getAllByIndex('scanMatches', 'scanId', r.id);
        ms.forEach((x) => ops.push({ op: 'delete', store: 'scanMatches', key: x.id }));
      }
    }
  }
  await be().batch(ops);
}

// ---------- Rounds ----------

export async function getRounds(battleId) {
  const rounds = await be().getAllByIndex('rounds', 'battleId', battleId);
  return rounds.sort((a, b) => {
    const orderA = typeof a.order === 'number' ? a.order : (typeof a.number === 'number' ? a.number : 0);
    const orderB = typeof b.order === 'number' ? b.order : (typeof b.number === 'number' ? b.number : 0);
    if (orderA !== orderB) return orderA - orderB;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

export const getRound = (id) => be().get('rounds', id);

export async function createRound(battleId, { name, kind = 'round' } = {}) {
  const battle = await getBattle(battleId);
  if (!battle) throw new Error('Battle not found');
  const existing = await getRounds(battleId);
  const maxOrder = existing.reduce((max, r) => Math.max(max, typeof r.order === 'number' ? r.order : (r.number || 0)), 0);
  const nextNumber = existing.reduce((max, r) => Math.max(max, r.number || 0), 0) + 1;
  const roundName = name?.trim() || `Round ${nextNumber}`;
  const t = nowIso();
  const round = {
    id: uid(),
    battleId,
    name: roundName,
    number: nextNumber,
    order: maxOrder + 1,
    kind: kind === 'draft' ? 'draft' : 'round',
    notes: '',
    completed: false,
    createdAt: t,
    updatedAt: t,
  };
  await be().batch([
    { op: 'put', store: 'rounds', value: round },
    { op: 'put', store: 'battles', value: { ...battle, updatedAt: t } },
  ]);
  return round;
}

export async function renameRound(roundId, newName) {
  const r = await getRound(roundId);
  if (!r) throw new Error('Round not found');
  const trimmed = (newName || '').trim();
  if (!trimmed) throw new Error('Round name cannot be empty');
  r.name = trimmed;
  r.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'rounds', value: r }]);
  return r;
}

export async function reorderRounds(battleId, roundIdsInOrder) {
  const t = nowIso();
  const rounds = await getRounds(battleId);
  const map = new Map(rounds.map((r) => [r.id, r]));
  const ops = [];
  roundIdsInOrder.forEach((id, idx) => {
    const r = map.get(id);
    if (r) {
      r.order = idx + 1;
      r.updatedAt = t;
      ops.push({ op: 'put', store: 'rounds', value: r });
    }
  });
  if (ops.length > 0) {
    await be().batch(ops);
  }
}

export async function deleteRound(roundId) {
  const r = await getRound(roundId);
  if (!r) throw new Error('Round not found');
  const allRounds = await getRounds(r.battleId);
  if (allRounds.length <= 1) {
    throw new Error('A battle must always keep at least 1 round.');
  }

  const ops = [
    { op: 'delete', store: 'rounds', key: roundId },
    { op: 'delete', store: 'finalMaterials', key: roundId },
  ];

  // Schemes attached to this round become battle-level / unassigned (roundId: null)
  const schemes = await be().getAllByIndex('schemes', 'battleId', r.battleId);
  for (const s of schemes) {
    if (s.roundId === roundId) {
      ops.push({ op: 'put', store: 'schemes', value: { ...s, roundId: null, updatedAt: nowIso() } });
    }
  }

  // Voice notes attached to this round become battle-level / unassigned (roundId: null)
  const voiceNotes = await be().getAllByIndex('voiceNotes', 'battleId', r.battleId);
  for (const vn of voiceNotes) {
    if (vn.roundId === roundId) {
      ops.push({ op: 'put', store: 'voiceNotes', value: { ...vn, roundId: null, updatedAt: nowIso() } });
    }
  }

  // Pinned bars attached to this round become unassigned
  const pinnedBars = await be().getAllByIndex('pinnedBars', 'battleId', r.battleId);
  for (const pb of pinnedBars) {
    if (pb.roundId === roundId) {
      ops.push({ op: 'put', store: 'pinnedBars', value: { ...pb, roundId: null, updatedAt: nowIso() } });
    }
  }

  await be().batch(ops);
}

// ---------- Settings (defined early so migrateRoundsAndDrafts can call them) ----------

export async function getSetting(key, fallback = null) {
  const row = await be().get('settings', key);
  return row ? row.value : fallback;
}
export const setSetting = (key, value) => be().batch([{ op: 'put', store: 'settings', value: { key, value } }]);

/** Idempotent migration: upgrades legacy rounds and copies old draft ideas into the Draft round */
export async function migrateRoundsAndDrafts() {
  const flag = await getSetting('migration_rounds_drafts_v1');
  if (flag) return;

  const [battles, rounds, drafts, finalMaterials] = await Promise.all([
    be().getAll('battles'),
    be().getAll('rounds'),
    be().getAll('drafts'),
    be().getAll('finalMaterials'),
  ]);

  const ops = [];
  const roundsByBattle = new Map();
  for (const r of rounds) {
    if (!roundsByBattle.has(r.battleId)) roundsByBattle.set(r.battleId, []);
    roundsByBattle.get(r.battleId).push(r);
  }

  const materialsByRound = new Map(finalMaterials.map((m) => [m.roundId, m]));
  const draftsByBattle = new Map();
  for (const d of drafts) {
    if (!d.battleId) continue;
    if (!draftsByBattle.has(d.battleId)) draftsByBattle.set(d.battleId, []);
    draftsByBattle.get(d.battleId).push(d);
  }

  for (const battle of battles) {
    const bRounds = (roundsByBattle.get(battle.id) || [])
      .sort((a, b) => (a.number ?? a.order ?? 0) - (b.number ?? b.order ?? 0));

    let maxOrder = 0;
    let draftRound = null;

    bRounds.forEach((r, idx) => {
      const order = typeof r.order === 'number' ? r.order : (r.number ?? (idx + 1));
      if (order > maxOrder) maxOrder = order;
      const name = r.name || (r.number ? `Round ${r.number}` : `Round ${idx + 1}`);
      const kind = r.kind || (name.toLowerCase() === 'draft' ? 'draft' : 'round');
      if (kind === 'draft') draftRound = r;

      if (r.order !== order || r.name !== name || r.kind !== kind) {
        r.order = order;
        r.name = name;
        r.kind = kind;
        ops.push({ op: 'put', store: 'rounds', value: r });
      }
    });

    if (!draftRound) {
      maxOrder += 1;
      const t = nowIso();
      draftRound = {
        id: uid(),
        battleId: battle.id,
        name: 'Draft',
        number: maxOrder,
        order: maxOrder,
        kind: 'draft',
        notes: '',
        completed: false,
        createdAt: t,
        updatedAt: t,
      };
      ops.push({ op: 'put', store: 'rounds', value: draftRound });
    }

    // Migrate old Draft Ideas into Draft round as titled blocks in order created
    const bDrafts = (draftsByBattle.get(battle.id) || [])
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

    if (bDrafts.length > 0) {
      const existingMat = materialsByRound.get(draftRound.id);
      let content = existingMat?.text || '';
      const blocks = bDrafts.map((d) => {
        const title = (d.title || '').trim();
        const body = (d.content || '').trim();
        if (title && body) return `${title}\n${body}`;
        return title || body;
      }).filter(Boolean).join('\n\n');

      if (blocks) {
        content = content ? `${content}\n\n${blocks}` : blocks;
        ops.push({
          op: 'put',
          store: 'finalMaterials',
          value: {
            roundId: draftRound.id,
            battleId: battle.id,
            text: content,
            createdAt: existingMat?.createdAt || nowIso(),
            updatedAt: nowIso(),
          },
        });
      }
    }
  }

  await setSetting('migration_rounds_drafts_v1', true);
  if (ops.length > 0) {
    await be().batch(ops);
  }
}

export async function saveRoundNotes(roundId, notes) {
  const r = await getRound(roundId);
  if (!r) throw new Error('Round not found');
  r.notes = notes;
  r.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'rounds', value: r }]);
  return r;
}

// ---------- Final Material ----------

export async function getFinalMaterial(roundId) {
  return (await be().get('finalMaterials', roundId)) || null;
}

/** Saves final material exactly as given (no trimming/normalising) and bumps battle's updatedAt atomically. */
export async function saveFinalMaterial(roundId, battleId, text) {
  const t = nowIso();
  const prev = await getFinalMaterial(roundId);
  const record = { roundId, battleId, text, createdAt: prev?.createdAt || t, updatedAt: t };
  const ops = [{ op: 'put', store: 'finalMaterials', value: record }];
  const battle = await getBattle(battleId);
  if (battle) ops.push({ op: 'put', store: 'battles', value: { ...battle, updatedAt: t } });
  await be().batch(ops);
  return record;
}

// ---------- Draft Ideas ----------

export async function createDraft(fields = {}) {
  const t = nowIso();
  const draft = {
    id: uid(),
    title: (fields.title || '').trim() || 'Untitled draft',
    content: fields.content || '',
    category: DRAFT_CATEGORIES.includes(fields.category) ? fields.category : 'Punchline',
    status: normalizeDraftStatus(fields.status || 'In Progress'),
    battleId: fields.battleId || null,
    roundId: fields.roundId || null,
    tags: Array.isArray(fields.tags) ? fields.tags : (fields.tags ? String(fields.tags).split(',').map((x) => x.trim()).filter(Boolean) : []),
    notes: fields.notes || '',
    createdAt: t,
    updatedAt: t,
  };
  await be().batch([{ op: 'put', store: 'drafts', value: draft }]);
  return draft;
}

export async function getDraft(id) {
  const d = await be().get('drafts', id);
  if (d) d.status = normalizeDraftStatus(d.status);
  return d;
}

export async function updateDraft(id, fields) {
  const d = await be().get('drafts', id);
  if (!d) throw new Error('Draft not found');
  const allowed = ['title', 'content', 'category', 'status', 'battleId', 'roundId', 'tags', 'notes'];
  for (const k of allowed) {
    if (k in fields) {
      if (k === 'tags' && typeof fields[k] === 'string') {
        d[k] = fields[k].split(',').map((x) => x.trim()).filter(Boolean);
      } else if (k === 'status') {
        d[k] = normalizeDraftStatus(fields[k]);
      } else {
        d[k] = fields[k];
      }
    }
  }
  if (!d.title) d.title = 'Untitled draft';
  d.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'drafts', value: d }]);
  return d;
}

export async function deleteDraft(id) {
  const ops = [{ op: 'delete', store: 'drafts', key: id }];
  // Clean up any scheme links
  const links = await be().getAllByIndex('schemeDrafts', 'draftId', id);
  for (const link of links) ops.push({ op: 'delete', store: 'schemeDrafts', key: link.id });
  await be().batch(ops);
}

export async function listDrafts({ battleId = null, roundId = null, category = null, status = null, search = '' } = {}) {
  let rows = [];
  if (roundId) {
    rows = await be().getAllByIndex('drafts', 'roundId', roundId);
  } else if (battleId) {
    rows = await be().getAllByIndex('drafts', 'battleId', battleId);
  } else {
    rows = await be().getAll('drafts');
  }

  // Normalize statuses for all fetched rows
  rows.forEach((r) => { r.status = normalizeDraftStatus(r.status); });

  const q = (search || '').trim().toLowerCase();
  return rows.filter((d) => {
    if (category && d.category !== category) return false;
    if (status && d.status !== status) return false;
    if (q) {
      const matchTitle = (d.title || '').toLowerCase().includes(q);
      const matchContent = (d.content || '').toLowerCase().includes(q);
      const matchNotes = (d.notes || '').toLowerCase().includes(q);
      const matchTags = (d.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchContent && !matchNotes && !matchTags) return false;
    }
    return true;
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Appends a draft's content into the round's final material. Preserves original draft unless remove=true. */
export async function copyDraftToFinalMaterial(draftId, roundId, battleId, removeDraft = false) {
  const draft = await getDraft(draftId);
  if (!draft) throw new Error('Draft not found');
  const mat = await getFinalMaterial(roundId);
  const existingText = mat ? mat.text : '';
  const addition = draft.content.trim();
  const separator = existingText.trim() ? '\n\n' : '';
  const newText = existingText + (existingText.endsWith('\n') ? '\n' : separator) + addition;

  await saveFinalMaterial(roundId, battleId, newText);

  if (removeDraft) {
    await deleteDraft(draftId);
  } else if (draft.status !== 'Done') {
    await updateDraft(draftId, { status: 'Done' });
  }
  return { newText };
}

// ---------- Scheme Builder ----------

export async function createScheme(fields = {}) {
  const t = nowIso();
  const scheme = {
    id: uid(),
    title: (fields.title || '').trim() || 'Untitled scheme',
    topic: (fields.topic || '').trim(),
    angle: (fields.angle || '').trim(),
    wordAssociations: Array.isArray(fields.wordAssociations) ? fields.wordAssociations : [],
    references: Array.isArray(fields.references) ? fields.references : [],
    punchlines: Array.isArray(fields.punchlines) ? fields.punchlines : [],
    draftBars: Array.isArray(fields.draftBars) ? fields.draftBars : [],
    supportingNotes: fields.supportingNotes || fields.notes || '',
    relatedVoiceNoteIds: Array.isArray(fields.relatedVoiceNoteIds) ? fields.relatedVoiceNoteIds : [],
    battleId: fields.battleId || null,
    roundId: fields.roundId || null,
    status: SCHEME_STATUSES.includes(fields.status) ? fields.status : 'Drafting',
    tags: Array.isArray(fields.tags) ? fields.tags : [],
    createdAt: t,
    updatedAt: t,
  };
  await be().batch([{ op: 'put', store: 'schemes', value: scheme }]);
  return scheme;
}

export async function getScheme(id) {
  return be().get('schemes', id);
}

export async function updateScheme(id, fields) {
  const s = await getScheme(id);
  if (!s) throw new Error('Scheme not found');
  const allowed = [
    'title', 'topic', 'angle', 'wordAssociations', 'references',
    'punchlines', 'draftBars', 'supportingNotes', 'notes',
    'relatedVoiceNoteIds', 'battleId', 'roundId', 'status', 'tags',
  ];
  for (const k of allowed) {
    if (k in fields) {
      if (k === 'notes') s.supportingNotes = fields[k];
      else s[k] = fields[k];
    }
  }
  if (!s.title) s.title = 'Untitled scheme';
  s.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'schemes', value: s }]);
  return s;
}

export async function deleteScheme(id) {
  const ops = [{ op: 'delete', store: 'schemes', key: id }];
  const links = await be().getAllByIndex('schemeDrafts', 'schemeId', id);
  for (const l of links) ops.push({ op: 'delete', store: 'schemeDrafts', key: l.id });
  await be().batch(ops);
}

export async function listSchemes({ battleId = null, roundId = null, status = null } = {}) {
  let rows = [];
  if (roundId) {
    rows = await be().getAllByIndex('schemes', 'roundId', roundId);
  } else if (battleId) {
    rows = await be().getAllByIndex('schemes', 'battleId', battleId);
  } else {
    rows = await be().getAll('schemes');
  }
  if (status) rows = rows.filter((s) => s.status === status);
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function linkDraftToScheme(schemeId, draftId) {
  const existing = await be().getAllByIndex('schemeDrafts', 'schemeId', schemeId);
  if (existing.some((x) => x.draftId === draftId)) return;
  const link = {
    id: uid(),
    schemeId,
    draftId,
    order: existing.length + 1,
  };
  await be().batch([{ op: 'put', store: 'schemeDrafts', value: link }]);
}

export async function unlinkDraftFromScheme(schemeId, draftId) {
  const links = await be().getAllByIndex('schemeDrafts', 'schemeId', schemeId);
  const match = links.find((x) => x.draftId === draftId);
  if (match) {
    await be().batch([{ op: 'delete', store: 'schemeDrafts', key: match.id }]);
  }
}

export async function getSchemeDrafts(schemeId) {
  const links = await be().getAllByIndex('schemeDrafts', 'schemeId', schemeId);
  const drafts = await Promise.all(links.map((l) => be().get('drafts', l.draftId)));
  return drafts.filter(Boolean);
}

// ---------- Rhyme Bank ----------

export async function createSavedRhyme(fields = {}) {
  const t = nowIso();
  const text = (fields.text || '').trim();
  if (!text) throw new Error('Rhyme text cannot be empty');

  // If explicitly general or no battleId specified, it is a general rhyme (accessible across all battles)
  const targetBattleId = fields.isGeneral ? null : (fields.battleId || null);

  // Prevent accidental duplicates in target scope or across general library
  try {
    const existing = await be().getAll('rhymes');
    const dup = existing.find((r) =>
      r.text.toLowerCase() === text.toLowerCase() &&
      (!r.battleId || r.battleId === targetBattleId)
    );
    if (dup) return dup;
  } catch {
    /* continue if query fails */
  }

  const rhyme = {
    id: uid(),
    text,
    kind: RHYME_KINDS.includes(fields.kind) ? fields.kind : 'word',
    collection: (fields.collection || 'General').trim(),
    notes: fields.notes || '',
    tags: Array.isArray(fields.tags) ? fields.tags : [],
    battleId: targetBattleId,
    roundId: targetBattleId ? (fields.roundId || null) : null,
    isGeneral: !targetBattleId,
    createdAt: t,
    updatedAt: t,
  };
  await be().batch([{ op: 'put', store: 'rhymes', value: rhyme }]);
  return rhyme;
}

export async function updateSavedRhyme(id, patch = {}) {
  const existing = await be().get('rhymes', id);
  if (!existing) throw new Error('Saved rhyme not found');
  const updated = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };
  await be().batch([{ op: 'put', store: 'rhymes', value: updated }]);
  return updated;
}

export async function deleteSavedRhyme(id) {
  await be().batch([{ op: 'delete', store: 'rhymes', key: id }]);
}

export async function listSavedRhymes({ battleId = null, roundId = null, scope = 'all', search = '' } = {}) {
  let rows = await be().getAll('rhymes');

  if (scope === 'battle' && battleId) {
    rows = rows.filter((r) => r.battleId === battleId);
  } else if (scope === 'general') {
    rows = rows.filter((r) => !r.battleId);
  } else if (scope === 'all' && battleId) {
    // Both general rhymes and current battle's rhymes
    rows = rows.filter((r) => !r.battleId || r.battleId === battleId);
  } else if (roundId) {
    rows = rows.filter((r) => r.roundId === roundId || !r.battleId);
  }

  const q = (search || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      r.text.toLowerCase().includes(q) ||
      (r.collection && r.collection.toLowerCase().includes(q)) ||
      (r.tags && r.tags.some((t) => t.toLowerCase().includes(q))) ||
      (r.notes && r.notes.toLowerCase().includes(q))
    );
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ---------- Custom Pronunciation Dictionary ----------

export async function createPronunciation({ word, phonetic, notes = '', tags = [] } = {}) {
  const t = nowIso();
  const cleanWord = (word || '').trim().toLowerCase();
  if (!cleanWord) throw new Error('Word cannot be empty');
  const cleanPhonetic = (phonetic || '').trim().toUpperCase();
  if (!cleanPhonetic) throw new Error('Phonetic representation cannot be empty');

  try {
    const existing = await be().getAllByIndex('pronunciations', 'word', cleanWord);
    if (existing.length > 0) {
      const updated = {
        ...existing[0],
        phonetic: cleanPhonetic,
        notes: notes || existing[0].notes,
        tags: tags.length ? tags : existing[0].tags,
        updatedAt: t,
      };
      await be().batch([{ op: 'put', store: 'pronunciations', value: updated }]);
      return updated;
    }
  } catch {
    /* fallback to insert if index query fails */
  }

  const record = {
    id: uid(),
    word: cleanWord,
    phonetic: cleanPhonetic,
    notes,
    tags,
    createdAt: t,
    updatedAt: t,
  };
  await be().batch([{ op: 'put', store: 'pronunciations', value: record }]);
  return record;
}

export async function listPronunciations(search = '') {
  let rows = [];
  try {
    rows = await be().getAll('pronunciations');
  } catch {
    return [];
  }
  const q = (search || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      r.word.toLowerCase().includes(q) ||
      (r.phonetic && r.phonetic.toLowerCase().includes(q)) ||
      (r.notes && r.notes.toLowerCase().includes(q))
    );
  }
  return rows.sort((a, b) => a.word.localeCompare(b.word));
}

export async function deletePronunciation(id) {
  await be().batch([{ op: 'delete', store: 'pronunciations', key: id }]);
}

export async function getCustomPronunciationMap() {
  try {
    const rows = await be().getAll('pronunciations');
    const map = {};
    for (const r of rows) {
      if (r.word && r.phonetic) map[r.word.toLowerCase()] = r.phonetic;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Local rhyme search. The word pool is the built-in lexicon PLUS everything the user has
 * written (all battles, drafts and saved rhymes), including the endings of every line so
 * multi-word rhymes can be found in the user's own bars. Fully offline.
 */
export async function searchRhymeEngineWithBattleCorpus(query, battleId = null, mode = 'auto') {
  let extraWords = [];
  try {
    const [mats, drafts, saved] = await Promise.all([
      be().getAll('finalMaterials'),
      be().getAll('drafts'),
      be().getAll('rhymes'),
    ]);
    extraWords = extractCorpus([
      ...mats.map((m) => m.text),
      ...drafts.map((d) => `${d.title || ''}\n${d.content || ''}`),
      ...saved.map((r) => String(r.text || '').replace(/\s*\/\s*/g, '\n')),
    ]);
  } catch {
    /* fallback gracefully to default dictionary */
  }
  const customMap = await getCustomPronunciationMap();
  return searchRhymes(query, extraWords, customMap, mode);
}

// ---------- Optional English rhymes (online, opt-in) ----------

export async function getEnglishRhymesEnabled() {
  return !!(await getSetting('englishRhymes', false));
}

export const setEnglishRhymesEnabled = (on) => setSetting('englishRhymes', !!on);

/** English suggestions for the last word of the query. Empty unless the user opted in. */
export async function searchEnglishRhymes(query) {
  if (!(await getEnglishRhymesEnabled())) return [];
  const last = normalizeWord(String(query || '').trim().split(/\s+/).pop());
  if (!last || !isEnglishWord(last)) return [];
  return fetchEnglishRhymes(last);
}

// ---------- Pinned Bars ----------

export async function createPinnedBar({ text, battleId = null, roundId = null, source = 'Final Material' } = {}) {
  const clean = (text || '').trim();
  if (!clean) throw new Error('Cannot pin empty bar');
  const t = nowIso();

  // Prevent exact duplicate pin
  try {
    const existing = await be().getAll('pinnedBars');
    const dup = existing.find((p) => p.text.toLowerCase() === clean.toLowerCase() && p.battleId === battleId);
    if (dup) return dup;
  } catch {}

  let battleTitle = '';
  let roundNumber = null;
  if (battleId) {
    try {
      const b = await be().get('battles', battleId);
      if (b) battleTitle = b.title || '';
    } catch {}
  }
  if (roundId) {
    try {
      const r = await be().get('rounds', roundId);
      if (r) roundNumber = r.number;
    } catch {}
  }

  const record = {
    id: uid(),
    text: clean,
    battleId: battleId || null,
    roundId: roundId || null,
    battleTitle,
    roundNumber,
    source, // 'Final Material' | 'Draft' | 'Scheme'
    createdAt: t,
    updatedAt: t,
  };
  await be().batch([{ op: 'put', store: 'pinnedBars', value: record }]);
  return record;
}

export async function deletePinnedBar(id) {
  await be().batch([{ op: 'delete', store: 'pinnedBars', key: id }]);
}

export async function listPinnedBars(search = '') {
  let rows = [];
  try {
    rows = await be().getAll('pinnedBars');
  } catch {
    return [];
  }
  const q = (search || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      (r.text && r.text.toLowerCase().includes(q)) ||
      (r.battleTitle && r.battleTitle.toLowerCase().includes(q)) ||
      (r.source && r.source.toLowerCase().includes(q))
    );
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------- Voice Notes ----------

export async function createVoiceNote({
  title, description = '', durationMs = 0, battleId = null, roundId = null,
  draftId = null, schemeId = null, tags = [], blob = null, mimeType = 'audio/webm',
}) {
  const t = nowIso();
  const vn = {
    id: uid(),
    title: (title || '').trim() || `Voice Note ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    description: (description || '').trim(),
    durationMs: Math.max(0, Number(durationMs) || 0),
    recordedAt: t,
    battleId: battleId || null,
    roundId: roundId || null,
    draftId: draftId || null,
    schemeId: schemeId || null,
    tags: Array.isArray(tags) ? tags : [],
  };

  const ops = [{ op: 'put', store: 'voiceNotes', value: vn }];
  if (blob) {
    const audioRec = {
      id: uid(),
      voiceNoteId: vn.id,
      mimeType: mimeType || blob.type || 'audio/webm',
      blob,
    };
    ops.push({ op: 'put', store: 'audioBlobs', value: audioRec });
  }

  await be().batch(ops);
  return vn;
}

export const getVoiceNote = (id) => be().get('voiceNotes', id);

export async function getVoiceNotes({ battleId = null, roundId = null, schemeId = null, unassignedOnly = false } = {}) {
  let rows = [];
  if (schemeId) {
    rows = await be().getAllByIndex('voiceNotes', 'schemeId', schemeId);
  } else if (roundId) {
    rows = await be().getAllByIndex('voiceNotes', 'roundId', roundId);
  } else if (battleId) {
    rows = await be().getAllByIndex('voiceNotes', 'battleId', battleId);
  } else {
    rows = await be().getAll('voiceNotes');
  }
  if (schemeId && roundId) {
    rows = rows.filter((x) => x.schemeId === schemeId);
  }
  if (unassignedOnly) {
    rows = rows.filter((x) => !x.battleId && !x.roundId && !x.schemeId);
  }
  return rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export async function getAudioBlob(voiceNoteId) {
  const list = await be().getAllByIndex('audioBlobs', 'voiceNoteId', voiceNoteId);
  return list[0] || null;
}

export async function deleteVoiceNote(id) {
  const ops = [{ op: 'delete', store: 'voiceNotes', key: id }];
  const blobs = await be().getAllByIndex('audioBlobs', 'voiceNoteId', id);
  for (const b of blobs) ops.push({ op: 'delete', store: 'audioBlobs', key: b.id });
  await be().batch(ops);
}

export async function updateVoiceNote(id, fields) {
  const vn = await getVoiceNote(id);
  if (!vn) throw new Error('Voice note not found');
  const allowed = ['title', 'description', 'battleId', 'roundId', 'draftId', 'schemeId', 'tags'];
  for (const k of allowed) if (k in fields) vn[k] = fields[k];
  await be().batch([{ op: 'put', store: 'voiceNotes', value: vn }]);
  return vn;
}

// ---------- Opponent Research ----------

export async function createOpponent(fields = {}) {
  const t = nowIso();
  const name = (fields.name || '').trim();
  if (!name) throw new Error('Opponent name is required');
  const opponent = {
    id: uid(),
    name,
    location: (fields.location || '').trim(),
    league: (fields.league || '').trim(),
    background: fields.background || '',
    previousBattles: fields.previousBattles || '',
    notableLines: fields.notableLines || '',
    weaknesses: fields.weaknesses || '',
    contradictions: fields.contradictions || '',
    personalAngles: fields.personalAngles || '',
    rebuttals: fields.rebuttals || '',
    links: Array.isArray(fields.links) ? fields.links : (fields.links ? String(fields.links).split('\n').map((l) => l.trim()).filter(Boolean) : []),
    createdAt: t,
    updatedAt: t,
  };
  await be().batch([{ op: 'put', store: 'opponents', value: opponent }]);
  return opponent;
}

export const getOpponent = (id) => be().get('opponents', id);

export async function listOpponents() {
  const all = await be().getAll('opponents');
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateOpponent(id, fields) {
  const op = await getOpponent(id);
  if (!op) throw new Error('Opponent not found');
  const allowed = [
    'name', 'location', 'league', 'background', 'previousBattles',
    'notableLines', 'weaknesses', 'contradictions', 'personalAngles', 'rebuttals', 'links',
  ];
  for (const k of allowed) if (k in fields) op[k] = fields[k];
  op.updatedAt = nowIso();
  await be().batch([{ op: 'put', store: 'opponents', value: op }]);
  return op;
}

export async function deleteOpponent(id) {
  const ops = [{ op: 'delete', store: 'opponents', key: id }];
  const notes = await be().getAllByIndex('opponentNotes', 'opponentId', id);
  for (const n of notes) ops.push({ op: 'delete', store: 'opponentNotes', key: n.id });
  await be().batch(ops);
}

export async function addOpponentNote(opponentId, body, linkedBattleIds = []) {
  const note = {
    id: uid(),
    opponentId,
    body: (body || '').trim(),
    linkedBattleIds: Array.isArray(linkedBattleIds) ? linkedBattleIds : [],
    createdAt: nowIso(),
  };
  await be().batch([{ op: 'put', store: 'opponentNotes', value: note }]);
  return note;
}

export async function getOpponentNotes(opponentId) {
  const list = await be().getAllByIndex('opponentNotes', 'opponentId', opponentId);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteOpponentNote(id) {
  await be().batch([{ op: 'delete', store: 'opponentNotes', key: id }]);
}

// ---------- Line Checker ----------

export async function saveReferenceLine(fields = {}) {
  const text = (fields.text || '').trim();
  if (!text) throw new Error('Reference line text is required');
  const line = {
    id: uid(),
    text,
    emcee: (fields.emcee || '').trim(),
    opponent: (fields.opponent || '').trim(),
    battle: (fields.battle || '').trim(),
    league: (fields.league || '').trim(),
    round: fields.round ? Number(fields.round) : null,
    timestamp: fields.timestamp || '',
    sourceUrl: (fields.sourceUrl || '').trim(),
    origin: fields.origin || 'manual',
    createdAt: nowIso(),
  };
  await be().batch([{ op: 'put', store: 'referenceLines', value: line }]);
  return line;
}

export async function listReferenceLines() {
  const all = await be().getAll('referenceLines');
  return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function deleteReferenceLine(id) {
  await be().batch([{ op: 'delete', store: 'referenceLines', key: id }]);
}

function cleanTokens(str) {
  return str.toLowerCase().replace(/[^\w\sñ]/g, '').trim().split(/\s+/).filter(Boolean);
}

/**
 * Scans submitted text against available reference lines.
 * Strictly honest: if no reference lines exist, returns zero matches without fabricating.
 */
export async function scanText(submittedText, { battleId = null, roundId = null, mode = 'selection' } = {}) {
  const t = nowIso();
  const scan = {
    id: uid(),
    submittedText,
    scannedAt: t,
    mode, // selection | round
    battleId: battleId || null,
    roundId: roundId || null,
    reviewStatus: 'pending',
  };

  const refs = await be().getAll('referenceLines');
  const matches = [];

  if (refs.length > 0 && submittedText.trim()) {
    const lines = submittedText.split('\n').map((l) => l.trim()).filter((l) => l.length >= 8);

    for (const ref of refs) {
      const refNorm = ref.text.toLowerCase().replace(/[^\w\sñ]/g, ' ').replace(/\s+/g, ' ').trim();
      const refTokens = new Set(cleanTokens(ref.text));

      for (const line of lines) {
        const lineNorm = line.toLowerCase().replace(/[^\w\sñ]/g, ' ').replace(/\s+/g, ' ').trim();
        const lineTokens = cleanTokens(line);

        if (lineNorm === refNorm) {
          matches.push({
            id: uid(),
            scanId: scan.id,
            referenceLineId: ref.id,
            matchedLine: line,
            referenceLine: ref,
            category: 'Exact Match',
            reviewStatus: 'flagged',
          });
          break;
        } else if (lineNorm.length > 20 && (refNorm.includes(lineNorm) || lineNorm.includes(refNorm))) {
          matches.push({
            id: uid(),
            scanId: scan.id,
            referenceLineId: ref.id,
            matchedLine: line,
            referenceLine: ref,
            category: 'Phrase Match',
            reviewStatus: 'flagged',
          });
          break;
        } else if (lineTokens.length >= 4 && refTokens.size >= 4) {
          // Token intersection (Jaccard similarity)
          const intersection = lineTokens.filter((x) => refTokens.has(x));
          const union = new Set([...lineTokens, ...refTokens]);
          const sim = intersection.length / union.size;
          if (sim >= 0.45) {
            matches.push({
              id: uid(),
              scanId: scan.id,
              referenceLineId: ref.id,
              matchedLine: line,
              referenceLine: ref,
              category: 'Possible Similarity',
              reviewStatus: 'review_needed',
            });
            break;
          }
        }
      }
    }
  }

  const ops = [
    { op: 'put', store: 'scans', value: scan },
    ...matches.map((m) => ({ op: 'put', store: 'scanMatches', value: m })),
  ];
  await be().batch(ops);

  return { scan, matches, totalReferenceLines: refs.length };
}

export async function listScans({ battleId = null, roundId = null } = {}) {
  let list = [];
  if (roundId) {
    list = await be().getAllByIndex('scans', 'roundId', roundId);
  } else if (battleId) {
    list = await be().getAllByIndex('scans', 'battleId', battleId);
  } else {
    list = await be().getAll('scans');
  }
  return list.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
}

export async function getScanMatches(scanId) {
  const matches = await be().getAllByIndex('scanMatches', 'scanId', scanId);
  for (const m of matches) {
    if (!m.referenceLine && m.referenceLineId) {
      m.referenceLine = await be().get('referenceLines', m.referenceLineId);
    }
  }
  return matches;
}

export async function deleteScan(scanId) {
  const ops = [{ op: 'delete', store: 'scans', key: scanId }];
  const ms = await be().getAllByIndex('scanMatches', 'scanId', scanId);
  for (const m of ms) ops.push({ op: 'delete', store: 'scanMatches', key: m.id });
  await be().batch(ops);
}

// ---------- Global Search ----------

export async function globalSearch(rawQuery) {
  const q = (rawQuery || '').trim().toLowerCase();
  if (!q) return { results: [], total: 0 };

  const [battles, materials, rounds, drafts, schemes, rhymes, voiceNotes, opponents] = await Promise.all([
    be().getAll('battles'),
    be().getAll('finalMaterials'),
    be().getAll('rounds'),
    be().getAll('drafts'),
    be().getAll('schemes'),
    be().getAll('rhymes'),
    be().getAll('voiceNotes'),
    be().getAll('opponents'),
  ]);

  const battleMap = new Map(battles.map((b) => [b.id, b]));
  const roundMap = new Map(rounds.map((r) => [r.id, r]));
  const draftRoundByBattle = new Map();
  for (const r of rounds) {
    if (r.kind === 'draft' || r.name === 'Draft') {
      draftRoundByBattle.set(r.battleId, r);
    }
  }

  const results = [];

  // Battles
  for (const b of battles) {
    if (b.title.toLowerCase().includes(q) || (b.opponentName && b.opponentName.toLowerCase().includes(q)) || (b.league && b.league.toLowerCase().includes(q))) {
      const bRounds = rounds.filter((r) => r.battleId === b.id).sort((x, y) => (x.order ?? x.number ?? 0) - (y.order ?? y.number ?? 0));
      const firstRoundId = bRounds[0]?.id || '1';
      results.push({
        type: 'Battle',
        title: b.title,
        subtitle: b.opponentName ? `vs ${b.opponentName} · ${b.league || 'No league'}` : b.league,
        href: `#/battle/${b.id}/${firstRoundId}/final`,
      });
    }
  }

  // Final Materials
  for (const m of materials) {
    if (m.text && m.text.toLowerCase().includes(q)) {
      const b = battleMap.get(m.battleId);
      const r = roundMap.get(m.roundId);
      if (b && r) {
        const snippet = m.text.split('\n').find((l) => l.toLowerCase().includes(q)) || m.text.slice(0, 80);
        results.push({
          type: 'Final Material',
          title: `${b.title} — ${r.name || ('Round ' + r.number)}`,
          subtitle: snippet.trim().slice(0, 100),
          href: `#/battle/${b.id}/${r.id}/final`,
        });
      }
    }
  }

  // Drafts: point them to that battle's Draft round
  for (const d of drafts) {
    if (d.title.toLowerCase().includes(q) || (d.content && d.content.toLowerCase().includes(q)) || (d.tags && d.tags.some((t) => t.toLowerCase().includes(q)))) {
      const b = d.battleId ? battleMap.get(d.battleId) : null;
      if (b) {
        const draftRound = draftRoundByBattle.get(b.id);
        const targetRoundId = draftRound?.id || d.roundId || '1';
        results.push({
          type: 'Draft Idea',
          title: d.title,
          subtitle: `[${d.category || 'Draft'}] ${d.content.slice(0, 80)}`,
          href: `#/battle/${b.id}/${targetRoundId}/final`,
        });
      }
    }
  }

  // Schemes
  for (const s of schemes) {
    if (s.title.toLowerCase().includes(q) || (s.topic && s.topic.toLowerCase().includes(q)) || (s.angle && s.angle.toLowerCase().includes(q))) {
      const b = s.battleId ? battleMap.get(s.battleId) : null;
      const r = s.roundId ? roundMap.get(s.roundId) : null;
      results.push({
        type: 'Scheme',
        title: s.title,
        subtitle: s.angle ? `Angle: ${s.angle}` : `Topic: ${s.topic || 'General'}`,
        href: b && r ? `#/battle/${b.id}/${r.id}/schemes` : (b ? `#/battle/${b.id}` : '#/'),
      });
    }
  }

  // Rhymes
  for (const rh of rhymes) {
    if (rh.text.toLowerCase().includes(q) || (rh.notes && rh.notes.toLowerCase().includes(q))) {
      const b = rh.battleId ? battleMap.get(rh.battleId) : null;
      const r = rh.roundId ? roundMap.get(rh.roundId) : null;
      results.push({
        type: 'Saved Rhyme',
        title: rh.text,
        subtitle: rh.collection ? `Collection: ${rh.collection}` : rh.kind,
        href: b && r ? `#/battle/${b.id}/${r.id}/final` : '#/',
      });
    }
  }

  // Voice Notes
  for (const vn of voiceNotes) {
    if (vn.title.toLowerCase().includes(q) || (vn.description && vn.description.toLowerCase().includes(q))) {
      const b = vn.battleId ? battleMap.get(vn.battleId) : null;
      const r = vn.roundId ? roundMap.get(vn.roundId) : null;
      results.push({
        type: 'Voice Note',
        title: vn.title,
        subtitle: vn.description || `${Math.round(vn.durationMs / 1000)}s recording`,
        href: b && r ? `#/battle/${b.id}/${r.id}/voice` : '#/voice',
      });
    }
  }

  // Opponents
  for (const op of opponents) {
    if (op.name.toLowerCase().includes(q) || (op.league && op.league.toLowerCase().includes(q)) || (op.location && op.location.toLowerCase().includes(q))) {
      results.push({
        type: 'Opponent',
        title: op.name,
        subtitle: [op.league, op.location].filter(Boolean).join(' · ') || 'Opponent profile',
        href: '#/opponents',
      });
    }
  }

  return { results, total: results.length };
}

// ---------- Dashboard ----------

export async function getDashboardData() {
  const [battles, drafts, schemes, voiceNotes, materials, rounds] = await Promise.all([
    be().getAll('battles'), be().getAll('drafts'), be().getAll('schemes'),
    be().getAll('voiceNotes'), be().getAll('finalMaterials'), be().getAll('rounds'),
  ]);
  const byId = new Map(battles.map((b) => [b.id, b]));
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const roundsByBattle = new Map();
  for (const r of rounds) {
    if (!roundsByBattle.has(r.battleId)) roundsByBattle.set(r.battleId, []);
    roundsByBattle.get(r.battleId).push(r);
  }

  const sortRounds = (list) => (list || []).sort((x, y) => {
    const orderX = typeof x.order === 'number' ? x.order : (typeof x.number === 'number' ? x.number : 0);
    const orderY = typeof y.order === 'number' ? y.order : (typeof y.number === 'number' ? y.number : 0);
    return orderX - orderY;
  });

  const live = battles.filter((b) => !b.archived).map((b) => ({
    ...b,
    pinned: !!b.pinned,
    pinOrder: typeof b.pinOrder === 'number' ? b.pinOrder : 0,
    wallOrder: typeof b.wallOrder === 'number' ? b.wallOrder : 0,
    wallOrderedAt: b.wallOrderedAt || null,
    status: normalizeBattleStatus(b.status),
    rounds: sortRounds(roundsByBattle.get(b.id)),
  }));

  const archived = battles.filter((b) => b.archived).map((b) => ({
    ...b,
    pinned: false,
    status: normalizeBattleStatus(b.status),
    rounds: sortRounds(roundsByBattle.get(b.id)),
  })).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const sortedBattles = sortWallBattles(live);
  const pinnedBattles = sortedBattles.filter((b) => b.pinned);
  const unpinnedBattles = sortedBattles.filter((b) => !b.pinned);

  return {
    totals: {
      battles: live.length,
      allBattles: battles.length,
      activeBattles: live.filter((b) => b.status !== 'Completed' && b.status !== 'Done' && b.status !== 'Dropped').length,
      archived: archived.length,
      drafts: drafts.length,
      schemes: schemes.length,
      voiceNotes: voiceNotes.length,
    },
    activeBattles: sortedBattles,
    archivedBattles: archived,
    pinnedBattles,
    unpinnedBattles,
    recentBattles: live.filter((b) => b.lastOpenedAt)
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)).slice(0, 5),
    recentMaterial: materials.filter((m) => m.text.trim() && byId.has(m.battleId) && !byId.get(m.battleId).archived)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
      .map((m) => ({
        battle: byId.get(m.battleId), round: roundById.get(m.roundId), updatedAt: m.updatedAt,
        preview: m.text.replace(/<[^>]+>/g, ' ').trim().split('\n')[0].slice(0, 120),
      })),
    recentVoiceNotes: voiceNotes
      .sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || '')).slice(0, 5)
      .map((vn) => ({
        ...vn,
        battle: vn.battleId ? byId.get(vn.battleId) : null,
        round: vn.roundId ? roundById.get(vn.roundId) : null,
      })),
  };
}

// ---------- Plain Text & Script Export ----------

export async function exportBattleTxt(battleId) {
  const battle = await getBattle(battleId);
  if (!battle) throw new Error('Battle not found');
  const rounds = await getRounds(battleId);

  let output = `========================================\n`;
  output += `BARAHA BATTLE MATERIAL\n`;
  output += `Battle: ${battle.title}\n`;
  if (battle.opponentName) output += `Opponent: ${battle.opponentName}\n`;
  if (battle.league) output += `League: ${battle.league}\n`;
  if (battle.battleDate) output += `Date: ${battle.battleDate}\n`;
  if (battle.location) output += `Venue: ${battle.location}\n`;
  output += `Status: ${battle.status}\n`;
  output += `Exported: ${new Date().toLocaleDateString()}\n`;
  output += `========================================\n\n`;

  for (const r of rounds) {
    const mat = await getFinalMaterial(r.id);
    const hasText = Boolean(mat && mat.text && mat.text.trim());
    if (r.kind === 'draft') {
      if (!hasText) continue; // Exclude empty draft round
      output += `----------------------------------------\n`;
      output += `[DRAFT / SCRATCHPAD - ${r.name.toUpperCase()}]\n`;
      output += `----------------------------------------\n\n`;
    } else {
      output += `----------------------------------------\n`;
      output += `${r.name.toUpperCase()}\n`;
      output += `----------------------------------------\n\n`;
    }
    const rawText = hasText ? mat.text : `[No final material written for ${r.name}]\n`;
    // Cleanly strip any rich-text formatting tags (e.g. <mark>) for plain-text exports
    const plainText = rawText
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    output += plainText;
    output += `\n\n`;
    if (r.notes && r.notes.trim()) {
      output += `[${r.name} Notes]\n${r.notes}\n\n`;
    }
  }

  return output;
}

// ---------- Backup / Restore (JSON + Full ZIP with Audio) ----------

export async function exportAll() {
  const data = {};
  for (const name of Object.keys(STORES)) {
    data[name] = name === 'audioBlobs' ? [] : await be().getAll(name);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: nowIso(), includesAudio: false, data };
}

export function validateBackup(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['Not a valid backup file.'], counts: {} };
  if (obj.format !== BACKUP_FORMAT) errors.push('Not a BARAHA backup (wrong format marker).');
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) errors.push('Backup was made by a newer BARAHA version.');
  if (!obj.data || typeof obj.data !== 'object') errors.push('Backup has no data section.');
  const counts = {};
  if (!errors.length) {
    for (const [name, def] of Object.entries(STORES)) {
      const rows = obj.data[name] ?? [];
      if (!Array.isArray(rows)) { errors.push(`"${name}" must be a list.`); continue; }
      counts[name] = rows.length;
      const bad = rows.findIndex((r) => !r || typeof r !== 'object' || r[def.keyPath] == null);
      if (bad !== -1) errors.push(`"${name}" record #${bad + 1} is missing its "${def.keyPath}".`);
    }
    const battleIds = new Set((obj.data.battles ?? []).map((b) => b.id));
    for (const r of obj.data.rounds ?? []) if (!battleIds.has(r.battleId)) { errors.push(`Round ${r.id} points to a missing battle.`); break; }
    const perBattle = {};
    for (const r of obj.data.rounds ?? []) perBattle[r.battleId] = (perBattle[r.battleId] || 0) + 1;
    for (const id of battleIds) if (!perBattle[id] || perBattle[id] < 1) { errors.push(`Battle ${id} must have at least 1 round.`); break; }
  }
  return { ok: errors.length === 0, errors, counts };
}

export async function restoreAll(obj) {
  const v = validateBackup(obj);
  if (!v.ok) throw new Error(v.errors.join(' '));
  const ops = [];
  for (const [name, def] of Object.entries(STORES)) {
    const existing = await be().getAll(name);
    existing.forEach((r) => ops.push({ op: 'delete', store: name, key: r[def.keyPath] }));
  }
  for (const [name] of Object.entries(STORES)) {
    (obj.data[name] ?? []).forEach((value) => ops.push({ op: 'put', store: name, value }));
  }
  await be().batch(ops);
  return v.counts;
}

/**
 * Creates a complete ZIP backup containing database JSON + all audio blobs.
 */
export async function exportZipBackup() {
  const manifest = await exportAll();
  manifest.includesAudio = true;

  const files = [
    { name: 'backup.json', data: JSON.stringify(manifest, null, 2) },
  ];

  const audioBlobs = await be().getAll('audioBlobs');
  for (const ab of audioBlobs) {
    if (ab.blob) {
      const ext = ab.mimeType.includes('wav') ? 'wav' : (ab.mimeType.includes('mp3') ? 'mp3' : 'webm');
      files.push({
        name: `audio/${ab.voiceNoteId}.${ext}`,
        data: ab.blob,
      });
    }
  }

  return createZip(files);
}

/**
 * Restores a full ZIP backup (or raw JSON backup).
 */
export async function restoreBackupFromFile(file) {
  if (file.name.endsWith('.zip') || file.type.includes('zip')) {
    const unzipped = await readZip(file);
    const jsonFile = unzipped.find((f) => f.name === 'backup.json');
    if (!jsonFile) throw new Error('ZIP backup is missing backup.json');
    const parsed = JSON.parse(jsonFile.text());
    const counts = await restoreAll(parsed);

    // Restore audio blobs from zip
    const audioFiles = unzipped.filter((f) => f.name.startsWith('audio/'));
    if (audioFiles.length > 0) {
      const audioOps = [];
      for (const af of audioFiles) {
        const basename = af.name.split('/').pop();
        const voiceNoteId = basename.split('.')[0];
        const blob = new Blob([af.data], { type: af.name.endsWith('.wav') ? 'audio/wav' : 'audio/webm' });
        audioOps.push({
          op: 'put',
          store: 'audioBlobs',
          value: {
            id: uid(),
            voiceNoteId,
            mimeType: blob.type,
            blob,
          },
        });
      }
      await be().batch(audioOps);
      counts.audioBlobs = audioOps.length;
    }
    return counts;
  } else {
    // Standard JSON file
    const text = await file.text();
    const parsed = JSON.parse(text);
    return restoreAll(parsed);
  }
}
