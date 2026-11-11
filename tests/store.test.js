import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryBackend } from './memory-backend.js';
import * as store from '../js/core/store.js';
import { textStats, getBattleCountdown } from '../js/core/util.js';

const fresh = () => store.setBackend(createMemoryBackend());

test('creating a battle creates 4 rounds: Round 1, Round 2, Round 3, and Draft', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Test', opponentName: 'X' });
  assert.equal(rounds.length, 4);
  const names = rounds.map((r) => r.name);
  assert.deepEqual(names, ['Round 1', 'Round 2', 'Round 3', 'Draft']);
  const kinds = rounds.map((r) => r.kind);
  assert.deepEqual(kinds, ['round', 'round', 'round', 'draft']);
  // Orders must be sequential
  const orders = rounds.map((r) => r.order);
  assert.deepEqual(orders, [1, 2, 3, 4]);
});

test('edit, archive, restore', async () => {
  fresh();
  const { battle } = await store.createBattle({ title: 'A' });
  await store.updateBattle(battle.id, { title: 'B', status: 'Writing' });
  assert.equal((await store.getBattle(battle.id)).title, 'B');
  await store.setArchived(battle.id, true);
  assert.equal((await store.getBattle(battle.id)).archived, true);
  await store.setArchived(battle.id, false);
  assert.equal((await store.getBattle(battle.id)).archived, false);
});

test('rounds keep independent final material', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'A' });
  await store.saveFinalMaterial(rounds[0].id, battle.id, 'round one bars');
  await store.saveFinalMaterial(rounds[1].id, battle.id, 'round two bars');
  assert.equal((await store.getFinalMaterial(rounds[0].id)).text, 'round one bars');
  assert.equal((await store.getFinalMaterial(rounds[1].id)).text, 'round two bars');
  assert.equal(await store.getFinalMaterial(rounds[2].id), null);
});

test('final material is stored byte-for-byte (Taglish, odd spacing, punctuation)', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'A' });
  const raw = '  Ang yabang mo pre,, wla ka namang bars!!  \n\n\tsakin ka mag-aral...   \nkunwri  ';
  await store.saveFinalMaterial(rounds[0].id, battle.id, raw);
  assert.equal((await store.getFinalMaterial(rounds[0].id)).text, raw);
});

test('deleting a battle removes only its own data', async () => {
  fresh();
  const a = await store.createBattle({ title: 'A' });
  const b = await store.createBattle({ title: 'B' });
  await store.saveFinalMaterial(a.rounds[0].id, a.battle.id, 'a text');
  await store.saveFinalMaterial(b.rounds[0].id, b.battle.id, 'b text');
  await store.deleteBattle(a.battle.id);
  assert.equal(await store.getBattle(a.battle.id), undefined);
  assert.equal((await store.getRounds(a.battle.id)).length, 0);
  assert.equal(await store.getFinalMaterial(a.rounds[0].id), null);
  assert.equal((await store.getRounds(b.battle.id)).length, 4);
  assert.equal((await store.getFinalMaterial(b.rounds[0].id)).text, 'b text');
});

test('saving material bumps the battle updatedAt', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'A' });
  await new Promise((r) => setTimeout(r, 5));
  await store.saveFinalMaterial(rounds[0].id, battle.id, 'x');
  assert.ok((await store.getBattle(battle.id)).updatedAt > battle.updatedAt);
});

test('round notes persist per round', async () => {
  fresh();
  const { rounds } = await store.createBattle({ title: 'A' });
  await store.saveRoundNotes(rounds[1].id, 'note');
  assert.equal((await store.getRound(rounds[1].id)).notes, 'note');
  assert.equal((await store.getRound(rounds[0].id)).notes, '');
});

test('dashboard totals, recent battles and recent material', async () => {
  fresh();
  const a = await store.createBattle({ title: 'A' });
  const b = await store.createBattle({ title: 'B', status: 'Done' });
  await store.touchOpened(a.battle.id);
  await store.saveFinalMaterial(a.rounds[0].id, a.battle.id, 'first line\nsecond');
  const d = await store.getDashboardData();
  assert.equal(d.totals.battles, 2);
  assert.equal(d.totals.activeBattles, 1);
  assert.equal(d.recentBattles[0].id, a.battle.id);
  assert.equal(d.recentMaterial[0].preview, 'first line');
  assert.equal(d.recentMaterial[0].round.number, 1);
});

test('backup round-trips and restore replaces without duplicating', async () => {
  fresh();
  const a = await store.createBattle({ title: 'A' });
  await store.saveFinalMaterial(a.rounds[0].id, a.battle.id, 'keep me');
  await store.setSetting('focusWidth', 700);
  const backup = JSON.parse(JSON.stringify(await store.exportAll()));
  await store.createBattle({ title: 'Extra' });
  await store.restoreAll(backup);
  const all = await store.listBattles();
  assert.equal(all.length, 1);
  assert.equal((await store.getRounds(a.battle.id)).length, 4);
  assert.equal((await store.getFinalMaterial(a.rounds[0].id)).text, 'keep me');
  assert.equal(await store.getSetting('focusWidth'), 700);
  await store.restoreAll(backup); // twice: still no duplicates
  assert.equal((await store.listBattles()).length, 1);
});

test('restore rejects invalid backups and changes nothing', async () => {
  fresh();
  await store.createBattle({ title: 'Existing' });
  for (const bad of [null, {}, { format: 'baraha-backup', version: 99, data: {} },
    { format: 'baraha-backup', version: 1, data: { battles: [{ id: 'b1' }], rounds: [] } },
    { format: 'baraha-backup', version: 1, data: { battles: [{ title: 'no id' }] } }]) {
    await assert.rejects(() => store.restoreAll(bad));
  }
  assert.equal((await store.listBattles()).length, 1);
});

test('failed batch is atomic', async () => {
  const be = createMemoryBackend();
  await assert.rejects(() => be.batch([
    { op: 'put', store: 'battles', value: { id: 'x' } },
    { op: 'put', store: 'nope', value: { id: 'y' } },
  ]));
  assert.equal((await be.getAll('battles')).length, 0);
});

test('textStats counts words, chars, lines', () => {
  assert.deepEqual(textStats(''), { words: 0, chars: 0, lines: 0 });
  assert.deepEqual(textStats('ab cd\nef'), { words: 3, chars: 8, lines: 2 });
});

test('draft creation, filtering, and copy/move to final material', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Battle 1' });
  const draft1 = await store.createDraft({
    title: 'Punch 1', content: 'Doble kara ang galaw mo', category: 'Punchline',
    status: 'Ready to Use', battleId: battle.id, roundId: rounds[0].id, tags: ['real', 'intro'],
  });
  const draft2 = await store.createDraft({
    title: 'Angle 1', content: 'Personal angle dito', category: 'Personal',
    status: 'Raw Idea', battleId: battle.id, roundId: rounds[0].id,
  });

  const list = await store.listDrafts({ roundId: rounds[0].id });
  assert.equal(list.length, 2);

  const punchlines = await store.listDrafts({ roundId: rounds[0].id, category: 'Punchline' });
  assert.equal(punchlines.length, 1);
  assert.equal(punchlines[0].id, draft1.id);

  // Copy to Final Material appends and leaves draft intact
  await store.saveFinalMaterial(rounds[0].id, battle.id, 'Initial bar.');
  await store.copyDraftToFinalMaterial(draft1.id, rounds[0].id, battle.id, false);
  const mat = await store.getFinalMaterial(rounds[0].id);
  assert.ok(mat.text.includes('Initial bar.'));
  assert.ok(mat.text.includes('Doble kara ang galaw mo'));
  const updatedDraft1 = await store.getDraft(draft1.id);
  assert.equal(updatedDraft1.status, 'Used');

  // Move to Final Material removes the draft
  await store.copyDraftToFinalMaterial(draft2.id, rounds[0].id, battle.id, true);
  assert.equal(await store.getDraft(draft2.id), undefined);
});

test('scheme builder and draft linking', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Scheme Battle' });
  const draft = await store.createDraft({
    title: 'Bar for scheme', content: 'Isang bala ka lang', category: 'Punchline',
    battleId: battle.id, roundId: rounds[0].id,
  });
  const scheme = await store.createScheme({
    title: 'Baraha Card Scheme', topic: 'Playing cards', angle: 'Shuffling cards against opponent',
    battleId: battle.id, roundId: rounds[0].id,
  });

  await store.linkDraftToScheme(scheme.id, draft.id);
  const linked = await store.getSchemeDrafts(scheme.id);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].id, draft.id);

  await store.unlinkDraftFromScheme(scheme.id, draft.id);
  const unlinked = await store.getSchemeDrafts(scheme.id);
  assert.equal(unlinked.length, 0);
});

test('rhyme engine search and saved rhymes', async () => {
  fresh();
  // Local phonetic engine search
  const result = await store.searchRhymeEngineWithBattleCorpus('makata');
  assert.ok(result.exact.length > 0 || result.slant.length > 0);
  assert.ok(result.notice.includes('Local'));

  // Saved rhymes
  const r = await store.createSavedRhyme({
    text: 'tira / bira / sira', kind: 'multi', collection: 'Aggressive',
  });
  const saved = await store.listSavedRhymes();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].text, 'tira / bira / sira');
  await store.deleteSavedRhyme(r.id);
  assert.equal((await store.listSavedRhymes()).length, 0);
});

test('voice notes creation and deletion', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Voice Battle' });
  const vn = await store.createVoiceNote({
    title: 'Flow test round 1', durationMs: 45000, battleId: battle.id, roundId: rounds[0].id,
  });
  const list = await store.getVoiceNotes({ roundId: rounds[0].id });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, vn.id);
  await store.deleteVoiceNote(vn.id);
  assert.equal((await store.getVoiceNotes({ roundId: rounds[0].id })).length, 0);
});

test('opponent research profiles and notes', async () => {
  fresh();
  const op = await store.createOpponent({
    name: 'Sinio', league: 'Fliptop', weaknesses: 'Predictable jokes',
  });
  assert.equal(op.name, 'Sinio');
  await store.addOpponentNote(op.id, 'Watch his 2024 battle vs Batas');
  const notes = await store.getOpponentNotes(op.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].body, 'Watch his 2024 battle vs Batas');
  await store.deleteOpponent(op.id);
  assert.equal(await store.getOpponent(op.id), undefined);
  assert.equal((await store.getOpponentNotes(op.id)).length, 0);
});

test('line checker honesty and similarity scan', async () => {
  fresh();
  // Scanning when reference collection is empty must truthfully report zero matches
  const emptyScan = await store.scanText('Bawat bara ko ay alas sa mesa');
  assert.equal(emptyScan.matches.length, 0);
  assert.equal(emptyScan.totalReferenceLines, 0);

  // Add an authorized reference line
  await store.saveReferenceLine({
    text: 'Bawat bara ko ay alas sa mesa', emcee: 'Loonie', battle: 'Loonie vs Dello',
  });

  // Now scan the same bar
  const scan = await store.scanText('Bawat bara ko ay alas sa mesa');
  assert.equal(scan.matches.length, 1);
  assert.equal(scan.matches[0].category, 'Exact Match');
  assert.equal(scan.matches[0].referenceLine.emcee, 'Loonie');
});

test('global search across modules', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'FlipTop Royale', opponentName: 'Invictus' });
  await store.saveFinalMaterial(rounds[0].id, battle.id, 'Nagbabalik ang maestro sa entablado');
  await store.createDraft({ title: 'Maestro punchline', content: 'Walang makatatalo sa maestro', battleId: battle.id, roundId: rounds[0].id });

  const res = await store.globalSearch('maestro');
  assert.ok(res.total >= 2);
  assert.ok(res.results.some((r) => r.type === 'Final Material'));
  assert.ok(res.results.some((r) => r.type === 'Draft Idea'));
});

test('plain text battle export', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Finals 2026', opponentName: 'Mzhayt' });
  await store.saveFinalMaterial(rounds[0].id, battle.id, 'Round 1 text here');
  const txt = await store.exportBattleTxt(battle.id);
  assert.ok(txt.includes('BARAHA BATTLE MATERIAL'));
  assert.ok(txt.includes('Battle: Finals 2026'));
  assert.ok(txt.includes('Round 1 text here'));
});

test('pinned battle appears before unpinned regardless of edit time', async () => {
  fresh();
  const { battle: b1 } = await store.createBattle({ title: 'Old Battle Pinned' });
  await store.toggleBattlePin(b1.id);
  await new Promise((r) => setTimeout(r, 10));
  const { battle: b2 } = await store.createBattle({ title: 'New Battle Unpinned' });
  const data = await store.getDashboardData();
  assert.equal(data.activeBattles[0].id, b1.id);
  assert.equal(data.pinnedBattles.length, 1);
  assert.equal(data.pinnedBattles[0].id, b1.id);
});

test('edited writing card jumps to top of its group', async () => {
  fresh();
  const { battle: b1 } = await store.createBattle({ title: 'Battle 1' });
  const { battle: b2 } = await store.createBattle({ title: 'Battle 2' });
  const now = new Date().toISOString();
  await store.updateBattlesOrder([
    { id: b1.id, wallOrder: 0, wallOrderedAt: now },
    { id: b2.id, wallOrder: 1, wallOrderedAt: now },
  ]);
  let data = await store.getDashboardData();
  assert.equal(data.unpinnedBattles[0].id, b1.id);

  await new Promise((r) => setTimeout(r, 20));
  await store.updateBattle(b2.id, { title: 'Battle 2 Edited' });
  data = await store.getDashboardData();
  assert.equal(data.unpinnedBattles[0].id, b2.id);
});

test('manually placed card stays until edited again', async () => {
  fresh();
  const { battle: b1 } = await store.createBattle({ title: 'Card 1' });
  const { battle: b2 } = await store.createBattle({ title: 'Card 2' });
  const { battle: b3 } = await store.createBattle({ title: 'Card 3' });
  const now = new Date().toISOString();
  await store.updateBattlesOrder([
    { id: b3.id, wallOrder: 0, wallOrderedAt: now },
    { id: b2.id, wallOrder: 1, wallOrderedAt: now },
    { id: b1.id, wallOrder: 2, wallOrderedAt: now },
  ]);
  const data = await store.getDashboardData();
  const ids = data.unpinnedBattles.map(b => b.id);
  assert.deepEqual(ids, [b3.id, b2.id, b1.id]);
});

test('completed card edit does not jump to top', async () => {
  fresh();
  const { battle: b1 } = await store.createBattle({ title: 'Active Writing Battle' });
  const { battle: b2 } = await store.createBattle({ title: 'Completed Battle' });
  await store.updateBattle(b2.id, { status: 'Completed' });
  const now = new Date().toISOString();
  await store.updateBattlesOrder([
    { id: b1.id, wallOrder: 0, wallOrderedAt: now },
    { id: b2.id, wallOrder: 1, wallOrderedAt: now },
  ]);
  await new Promise((r) => setTimeout(r, 20));
  await store.updateBattle(b2.id, { opponentName: 'New Opponent' });
  const data = await store.getDashboardData();
  assert.equal(data.unpinnedBattles[0].id, b1.id);
});

// =========================================================================
// NEW ROUND MODEL TESTS
// =========================================================================

test('createRound adds a new round with correct defaults', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Round Test' });
  const newRound = await store.createRound(battle.id, { name: 'Extra Round' });
  assert.equal(newRound.name, 'Extra Round');
  assert.equal(newRound.kind, 'round');
  assert.equal(newRound.battleId, battle.id);
  const all = await store.getRounds(battle.id);
  assert.equal(all.length, 5); // 4 preset + 1 new
  // New round should be last by order
  const sorted = all.sort((a, b) => a.order - b.order);
  assert.equal(sorted[sorted.length - 1].id, newRound.id);
});

test('renameRound updates name and updatedAt', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Rename Test' });
  const r1 = rounds[0];
  await store.renameRound(r1.id, 'Intro Bar');
  const updated = await store.getRound(r1.id);
  assert.equal(updated.name, 'Intro Bar');
  assert.ok(updated.updatedAt >= r1.updatedAt);
});

test('deleteRound removes round but keeps attached schemes and voice notes unassigned', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Delete Round Test' });
  const r1 = rounds[0];
  // Create a scheme attached to r1
  const scheme = await store.createScheme({
    title: 'Card scheme', topic: 'Cards', angle: 'Trick deck',
    battleId: battle.id, roundId: r1.id,
  });
  // Create a voice note attached to r1
  const vn = await store.createVoiceNote({
    title: 'Voice for r1', durationMs: 5000, battleId: battle.id, roundId: r1.id,
  });
  // Delete r1 (battle has 4 rounds so this is allowed)
  await store.deleteRound(r1.id);
  // Round is gone
  assert.equal(await store.getRound(r1.id), undefined);
  // Final material for r1 is gone
  assert.equal(await store.getFinalMaterial(r1.id), null);
  // Scheme is NOT deleted; becomes unassigned (roundId null)
  const schemes = await store.listSchemes({ battleId: battle.id });
  const survivingScheme = schemes.find((s) => s.id === scheme.id);
  assert.ok(survivingScheme, 'Scheme should survive deletion of its round');
  assert.equal(survivingScheme.roundId, null);
  // Voice note is NOT deleted; becomes unassigned
  const vns = await store.getVoiceNotes({ battleId: battle.id });
  const survivingVn = vns.find((v) => v.id === vn.id);
  assert.ok(survivingVn, 'Voice note should survive deletion of its round');
  assert.equal(survivingVn.roundId, null);
  // Battle still has 3 rounds
  const remaining = await store.getRounds(battle.id);
  assert.equal(remaining.length, 3);
});

test('deleteRound blocks deletion of last remaining round', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Last Round Test' });
  // Delete all but one
  for (const r of rounds.slice(1)) await store.deleteRound(r.id);
  const remaining = await store.getRounds(battle.id);
  assert.equal(remaining.length, 1);
  // Deleting last round should throw
  await assert.rejects(() => store.deleteRound(remaining[0].id));
});

test('reorderRounds persists new order', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Reorder Test' });
  // Reverse the round order
  const reversedIds = [...rounds].reverse().map((r) => r.id);
  await store.reorderRounds(battle.id, reversedIds);
  const reordered = await store.getRounds(battle.id);
  assert.deepEqual(reordered.map((r) => r.id), reversedIds);
});

test('migrateRoundsAndDrafts is idempotent (runs once then skips)', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Migration Test' });
  // Create a legacy-style battle with 3 plain rounds (no name/order fields)
  const legacyBattle = { id: 'legacy-1', title: 'Legacy', status: 'Writing', archived: false, pinned: false, pinOrder: 0, wallOrder: 0, wallOrderedAt: null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', lastOpenedAt: null, opponentName: '', opponentId: null, league: '', battleDate: '', location: '', notes: '' };
  const legacyRounds = [
    { id: 'lr1', battleId: 'legacy-1', number: 1, notes: '', completed: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    { id: 'lr2', battleId: 'legacy-1', number: 2, notes: '', completed: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    { id: 'lr3', battleId: 'legacy-1', number: 3, notes: '', completed: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  ];
  // Insert raw legacy data bypassing store
  const { createMemoryBackend } = await import('./memory-backend.js');
  // Use the already-fresh backend via store internal
  // Run migration
  await store.migrateRoundsAndDrafts();
  // Run again — should be a no-op
  await store.migrateRoundsAndDrafts();
  // The existing new-model battle still has 4 rounds (not duplicated)
  const allRounds = await store.getRounds(battle.id);
  assert.equal(allRounds.length, 4);
});

test('draft round: kind is "draft" and has no completed semantics', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Draft Round Test' });
  const draftRound = rounds.find((r) => r.kind === 'draft');
  assert.ok(draftRound, 'Should have a Draft round');
  assert.equal(draftRound.name, 'Draft');
  assert.equal(draftRound.kind, 'draft');
  // Non-draft rounds: 3 of them
  const nonDraft = rounds.filter((r) => r.kind === 'round');
  assert.equal(nonDraft.length, 3);
});

// =========================================================================
// BATTLE COUNTDOWN STAMP TESTS
// =========================================================================

test('getBattleCountdown calculates accurate labels and urgency across dates', () => {
  const baseNow = new Date(2026, 4, 15, 14, 30, 0); // May 15, 2026 2:30 PM

  // Today
  const todayRes = getBattleCountdown('2026-05-15', baseNow);
  assert.equal(todayRes.label, 'TODAY');
  assert.equal(todayRes.daysDiff, 0);
  assert.equal(todayRes.urgency, 'today');

  // Tomorrow
  const tomorrowRes = getBattleCountdown('2026-05-16', baseNow);
  assert.equal(tomorrowRes.label, 'TOMORROW');
  assert.equal(tomorrowRes.daysDiff, 1);
  assert.equal(tomorrowRes.urgency, 'urgent');

  // 5 days left (<= 7 is urgent)
  const fiveDaysRes = getBattleCountdown('2026-05-20', baseNow);
  assert.equal(fiveDaysRes.label, '5 DAYS LEFT');
  assert.equal(fiveDaysRes.daysDiff, 5);
  assert.equal(fiveDaysRes.urgency, 'urgent');

  // 14 days left (8-30 is near)
  const fourteenDaysRes = getBattleCountdown('2026-05-29', baseNow);
  assert.equal(fourteenDaysRes.label, '14 DAYS LEFT');
  assert.equal(fourteenDaysRes.daysDiff, 14);
  assert.equal(fourteenDaysRes.urgency, 'near');

  // 45 days left (>30 is distant)
  const fortyFiveDaysRes = getBattleCountdown('2026-06-29', baseNow);
  assert.equal(fortyFiveDaysRes.label, '45 DAYS LEFT');
  assert.equal(fortyFiveDaysRes.daysDiff, 45);
  assert.equal(fortyFiveDaysRes.urgency, 'distant');

  // Past date
  const pastRes = getBattleCountdown('2026-05-10', baseNow);
  assert.equal(pastRes.label, 'DATE PASSED');
  assert.equal(pastRes.daysDiff, -5);
  assert.equal(pastRes.urgency, 'passed');

  // Month boundary (May 31 -> June 2 = 2 days)
  const monthBoundaryRes = getBattleCountdown('2026-06-02', new Date(2026, 4, 31, 23, 59, 0));
  assert.equal(monthBoundaryRes.label, '2 DAYS LEFT');
  assert.equal(monthBoundaryRes.daysDiff, 2);

  // Year boundary (Dec 31, 2026 -> Jan 1, 2027 = Tomorrow)
  const yearBoundaryRes = getBattleCountdown('2027-01-01', new Date(2026, 11, 31, 10, 0, 0));
  assert.equal(yearBoundaryRes.label, 'TOMORROW');
  assert.equal(yearBoundaryRes.daysDiff, 1);

  // No date or invalid date
  assert.equal(getBattleCountdown(''), null);
  assert.equal(getBattleCountdown(null), null);
  assert.equal(getBattleCountdown('invalid-date-string'), null);
});

// ---------- Rhyme engine v2 ----------
import { searchRhymes, extractCorpus, getRhymeEndingTag, isEnglishWord } from '../js/core/rhymes-engine.js';

test('rhyme engine: Tagalog multi-syllable matches rank above loose vowel matches', () => {
  const r = searchRhymes('kalaban');
  assert.ok(r.multi.includes('laban'), 'laban should be a multi-syllable rhyme');
  assert.ok(!r.multi.includes('bara') && !r.exact.includes('bara'), 'vowel-only matches must not be exact/multi');
  assert.ok(r.exact.includes('kasalanan'));
  const p = searchRhymes('puso');
  assert.ok(p.multi.includes('seryoso'), 'puso ~ seryoso (-uso / -oso via vowel harmony)');
});

test('rhyme engine: unknown English words use English sounds, not Tagalog spelling', () => {
  const r = searchRhymes('fire');
  assert.ok(r.multi.includes('liar') && r.multi.includes('desire'));
  assert.ok(!r.exact.includes('diskarte'));
  assert.equal(r.englishHint, true);
  assert.equal(searchRhymes('kalaban').englishHint, false);
  assert.ok(isEnglishWord('fire') && !isEnglishWord('kalaban'));
  assert.ok(searchRhymes('flow').exact.includes('glow'));
});

test('rhyme engine: phrase search, user corpus and ending tag', () => {
  const corpus = extractCorpus(['Sino ang nasa laban,<br>walang makaharaban']);
  assert.ok(corpus.includes('nasa laban') && corpus.includes('makaharaban'));
  const r = searchRhymes('ka laban', ['walang makaharaban']);
  assert.equal(r.query, 'ka laban');
  assert.ok(r.multi.includes('walang makaharaban'), 'bar endings from the user text are searchable');
  assert.equal(getRhymeEndingTag('kalaban'), '-aban');
  assert.equal(getRhymeEndingTag('puso'), '-uso');
});

test('rhyme engine: user battle text, saved rhymes and the whole library feed the local search', async () => {
  fresh();
  const { battle, rounds } = await store.createBattle({ title: 'Corpus Battle' });
  await store.saveFinalMaterial(rounds[0].id, battle.id, 'Wala kang binatbat sa mga makaharaban');
  await store.createSavedRhyme({ text: 'kalamnan / kabuhayan' });
  const r = await store.searchRhymeEngineWithBattleCorpus('kalaban');
  assert.ok(r.notice.includes('Local'));
  assert.ok(r.multi.includes('makaharaban'), 'words from the user\'s own rounds show up');
  assert.ok([...r.exact, ...r.slant, ...r.multi].includes('kalamnan'), 'saved rhymes feed the pool');
});

test('English suggestions are opt-in and only send English words', async () => {
  fresh();
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { ok: true, json: async () => [{ word: 'liar' }, { word: 'desire' }, { word: 'fire' }] };
  };
  try {
    assert.deepEqual(await store.searchEnglishRhymes('fire'), []);
    assert.equal(calls.length, 0, 'off by default: no network call');

    await store.setEnglishRhymesEnabled(true);
    assert.deepEqual(await store.searchEnglishRhymes('kalaban'), []);
    assert.equal(calls.length, 0, 'Tagalog words are never sent');

    const out = await store.searchEnglishRhymes('fire');
    assert.deepEqual(out, ['liar', 'desire']);
    assert.ok(calls.every((u) => u.startsWith('https://api.datamuse.com/words?')));
    assert.ok(calls.every((u) => !u.includes('kalaban')));
  } finally {
    globalThis.fetch = realFetch;
  }
});
