# BARAHA — Database Documentation

Engine: IndexedDB, database name `baraha`, schema version = `MIGRATIONS.length` in `js/core/db.js` (currently **3**).
All access goes through a *backend* object (`get`, `getAll`, `getAllByIndex`, `batch`, `clearAll`). Domain logic lives in `js/core/store.js`; UI never calls IndexedDB directly.

## Conventions
- IDs: `crypto.randomUUID()` strings, stable across backup/restore. Exception: `finalMaterials` is keyed by `roundId` (one per round) and `settings` by `key`.
- Timestamps: ISO-8601 strings (`createdAt`, `updatedAt`).
- `batch(ops)` is atomic (one IDB transaction). A write promise resolves only after `tx.oncomplete`, which is what lets the editor say "Saved" truthfully.
- Ownership: a Battle owns exactly 3 Rounds. Round-owned records carry `battleId` and `roundId`. No material is duplicated between rounds; copying a draft into Final Material must be an explicit user action.

## Stores (Schema v2)
All 16 stores are actively utilized by the BARAHA workspace:

| Store | Key | Indexes | Fields |
|---|---|---|---|
| battles | id | status, archived, opponentId | title, opponentName, opponentId, league, battleDate, status (Planning/Writing/Ready/Done), location, notes, archived, createdAt, updatedAt, lastOpenedAt |
| rounds | id | battleId | battleId, number (1–3), notes, createdAt, updatedAt |
| finalMaterials | roundId | battleId | roundId, battleId, text (raw, rich-text with preserved `<mark>` highlights and breaks), createdAt, updatedAt |
| drafts | id | battleId, roundId, category, status | title, content, category (10 types), status (`In Progress` / `Done`), tags[], notes, battleId?, roundId?, createdAt, updatedAt |
| schemes | id | battleId, roundId, status | title, topic, angle, wordAssociations[], references[], punchlines[], draftBars[], supportingNotes, tags[], status, battleId?, roundId? |
| schemeDrafts | id | schemeId, draftId | schemeId, draftId, order — many-to-many join |
| rhymes | id | battleId, roundId | text, kind (word/phrase/multi), collection, notes, tags[], battleId? (null = General Library), roundId?, isGeneral, createdAt, updatedAt |
| pronunciations | id | word | word (lowercased), phonetic, notes, tags[], createdAt, updatedAt |
| voiceNotes | id | battleId, roundId, draftId, schemeId | title, description, durationMs, recordedAt, tags[], draftId?, schemeId?, battleId?, roundId? |
| audioBlobs | id | voiceNoteId | voiceNoteId, mimeType, blob (Binary Blob stored in IndexedDB — survives browser restarts) |
| pinnedBars | id | battleId, roundId | text, source ('Final Material', 'Drafts', 'Schemes'), battleId?, roundId?, createdAt, updatedAt |
| opponents | id | name | name, location, league, background, previousBattles, notableLines, weaknesses, contradictions, personalAngles, rebuttals, links[], createdAt, updatedAt |
| opponentNotes | id | opponentId | opponentId, body, createdAt, linkedBattleIds[] |
| referenceLines | id | — | text, emcee?, opponent?, battle?, league?, round?, timestamp?, sourceUrl?, origin, createdAt |
| scans | id | battleId, roundId | submittedText, scannedAt, mode (selection/round), reviewStatus, battleId?, roundId? |
| scanMatches | id | scanId | scanId, referenceLineId, matchedLine, referenceLine, category (exact/phrase/possible), reviewStatus |
| settings | key | — | key, value (editorWidth, editorSize, workspace_supporting_width, rhyme_panel_height, etc.) |

## Relationships
```
Battle 1──3 Round 1──0..1 FinalMaterial
Round 1──* Draft / Scheme / VoiceNote / Rhyme   (via roundId; battleId duplicated for fast per-battle queries)
Scheme *──* Draft            (schemeDrafts)
VoiceNote 1──* AudioBlob
Opponent 1──* OpponentNote ; Battle *──1 Opponent (battles.opponentId, reserved)
Scan 1──* ScanMatch *──1 ReferenceLine
```

## Deletion semantics (`deleteBattle`)
One atomic batch deletes the battle and, via `battleId` indexes, its rounds, final material, drafts, schemes (+their `schemeDrafts`), rhymes, voice notes (+ audio blobs) and scans (+ matches). Other battles are never touched. *Tested for rounds and final material only* — the other branches have no data to exercise yet. Decide whether drafts/rhymes should be cascaded or kept unassigned before building those modules.

## Initialisation and migrations
`openIdb()` opens `baraha` at `SCHEMA_VERSION`. On upgrade it runs `MIGRATIONS[v]` for every version from `oldVersion` up to `newVersion - 1`, inside the versionchange transaction.
To change the schema: **append** a function to `MIGRATIONS` (never edit a shipped one) that creates/alters stores or backfills data using the supplied transaction; update `STORES` to match; bump `BACKUP_VERSION` in `store.js` if backup shape changes; update this document; add a test. Upgrading an old database is *untested* because only v1 exists.

## Backup format (`baraha-backup`, version 1)
```json
{ "format": "baraha-backup", "version": 1, "exportedAt": "...", "includesAudio": false,
  "data": { "battles": [...], "rounds": [...], "finalMaterials": [...], "...every store...": [] } }
```
`validateBackup` checks format marker, version (rejects newer), list shape, key presence on every record, round→battle references and the exactly-3-rounds rule. `restoreAll` validates first, then deletes all current records and inserts the backup's in one atomic batch (replace, not merge — hence no duplicates). `audioBlobs` are exported empty; a ZIP backup with real audio is future work.


## Per-account database and sync bookkeeping (Stage 1 of cloud sync)

- **One local database per account:** `baraha-<userId>` (`dbNameFor(userId)` in `js/core/db.js`). The old shared `baraha` database is no longer opened.
- **`modifiedAt`:** every synced record gets an ISO `modifiedAt` on each write, stamped in ONE place (`js/core/sync-tracking.js`, wrapping `backend.batch`). It is separate from `updatedAt` on purpose: `updatedAt` controls the order of The Wall.
- **`syncQueue`** (migration v4, key `qid` = `store:id`): one pending change per record `{ qid, store, id, modifiedAt, deleted }`. Written in the same atomic transaction as the data. Deletes remove the record locally and queue a tombstone (`deleted: true`).
- **`syncMeta`** (key `key`): per-device values such as `deviceId` (and later `lastPulledAt`).
- **Not synced as records:** `settings`, `audioBlobs`, `syncQueue`, `syncMeta`.
- **`backend.sync` API:** `getPending`, `pendingCount`, `ack` (conditional: an entry edited after it was read stays queued), `applyRemote` (writes cloud data without stamping or queueing), `getMeta`, `setMeta`.
