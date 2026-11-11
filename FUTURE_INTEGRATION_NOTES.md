# BARAHA — Future Integration Notes

This document outlines architectural seams for future development beyond Phase 3.

## Completed Integrations (Phase 2 & Phase 3)
- **Local Phonetic Rhyme Engine:** Offline phonetic Tagalog/Taglish rhyme & assonance engine with dynamic corpus expansion.
- **Two-Workspace Studio Layout:** Persistent two-column split with draggable divider and collapsible supporting drawer.
- **Zero-Dependency ZIP Engine:** Native PKZip 2.0 creator and parser packaging `backup.json` and all IndexedDB audio blobs.
- **Plain Text Export (.txt):** Instant generation and download of complete 3-round battle scripts.

---

## Planned Future Integrations

### 1. Online Synchronization & Cloud Backup
- **Outbox Architecture:** The data layer communicates exclusively through `js/core/store.js`. Writes can be tapped into an `outbox` store in IndexedDB and synchronized with a remote server when online.
- **Conflict Resolution:** Last-writer-wins using `updatedAt` timestamps, with optional diffing for Final Material so neither version is lost.
- **Audio Blob Synchronization:** Chunked and resumable uploads for large audio files.
- **Local-First Mandate:** Cloud sync must remain strictly optional; local storage remains the primary source of truth.

### 2. External Rhyme Search (Optional Remote Opt-in)
- Interface via a `RhymeProvider` abstraction: `search({ text, mode }) → Promise<Result[]>`.
- Keep the local phonetic engine as the default offline engine. Any external API calls must require explicit opt-in in Settings to preserve writer privacy.

### 3. Authorized All3Rounds Reference Database Integration
- If partnership or authorized API access is established, import battle records into `referenceLines` with `origin: 'all3rounds'`.
- The Line Checker must continue stating honestly that it screens only against available reference material, and 0 matches does not guarantee originality.

### 4. Advanced Line Similarity Detection in Web Worker
- Offload intensive n-gram shingling, phonetic distance (Soundex/Metaphone for Tagalog), and Jaccard similarity to a background Web Worker so long scripts do not block UI rendering.

### 5. Document Export Formats (DOCX & Print-Ready PDF)
- Printable HTML styling via `@media print` with custom battle rap typography, round breaks, and cues.
- Optional client-side DOCX generator using a vetted zero-dependency template engine.
