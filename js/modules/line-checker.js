import { h, toast, confirmDialog, formDialog } from '../core/ui.js';
import { formatDate } from '../core/util.js';
import * as store from '../core/store.js';

export async function lineCheckerDialog(defaultText = '', { battleId = null, roundId = null } = {}) {
  const scanInput = h('textarea', {
    rows: 4,
    placeholder: 'Enter bar or phrase to scan',
    'aria-label': 'Text to scan',
  }, defaultText);

  const body = h('div', { class: 'stack form' },
    h('p', { class: 'small muted' }, 'Checks against your local reference collection. Zero matches does not guarantee originality; matches do not prove intentional copying.'),
    h('label', {}, 'Bar to Scan', scanInput));

  const ok = await formDialog({
    title: 'Scan Bar with Line Checker',
    confirmLabel: 'Run Scan',
    body,
  });

  if (ok && scanInput.value.trim()) {
    const res = await store.scanText(scanInput.value.trim(), { battleId, roundId, mode: 'selection' });
    if (res.totalReferenceLines === 0) {
      toast('No reference lines in database. 0 matches found.', 'error');
    } else if (res.matches.length === 0) {
      toast('0 matches found in available reference database.');
    } else {
      toast(`Found ${res.matches.length} possible matches!`);
    }
    return res;
  }
  return null;
}

export async function lineCheckerView(root, { initialScanText = '' } = {}) {
  let refLines = await store.listReferenceLines();
  let scans = await store.listScans();
  let activeTab = 'scanner'; // 'scanner' | 'database' | 'history'

  const tabScannerBtn = h('button', { class: 'ghost small-btn active' }, 'Scan Lines');
  const tabDbBtn = h('button', { class: 'ghost small-btn' }, `Reference Database (${refLines.length})`);
  const tabHistBtn = h('button', { class: 'ghost small-btn' }, `Scan History (${scans.length})`);

  const contentEl = h('div', { class: 'stack', style: 'margin-top: 16px;' });

  async function reloadData() {
    refLines = await store.listReferenceLines();
    scans = await store.listScans();
    tabDbBtn.textContent = `Reference Database (${refLines.length})`;
    tabHistBtn.textContent = `Scan History (${scans.length})`;
    render();
  }

  // --- Scanner Tab ---
  function renderScanner() {
    const textArea = h('textarea', {
      rows: 6,
      placeholder: 'Enter bar or lines to check',
      'aria-label': 'Lines to check',
    }, initialScanText);

    const resultsEl = h('div', { class: 'stack' });

    const scanBtn = h('button', {
      class: 'primary',
      style: 'padding: 10px 24px; font-weight: 700; letter-spacing: 0.04em;',
      onclick: async () => {
        const text = textArea.value.trim();
        if (!text) {
          toast('Please enter text to scan.', 'error');
          return;
        }

        resultsEl.replaceChildren(h('div', { class: 'small muted' }, 'Scanning reference lines...'));
        const { scan, matches, totalReferenceLines } = await store.scanText(text, { mode: 'round' });

        if (totalReferenceLines === 0) {
          resultsEl.replaceChildren(
            h('div', { class: 'notice' },
              h('b', {}, 'No Searchable Reference Material Available'),
              h('p', { class: 'small' }, 'Your local reference database has 0 lines. BARAHA does not fabricate or hallucinate matches. Add battle rap reference bars or import transcripts in the "Reference Database" tab to enable detection.'))
          );
          return;
        }

        if (matches.length === 0) {
          resultsEl.replaceChildren(
            h('div', { class: 'notice ok-box' },
              h('b', {}, '✓ 0 Matches Found — Bar is Clean'),
              h('p', { class: 'small' }, `Scanned against ${totalReferenceLines} stored reference lines. No exact or similar matches detected in your reference library. Note: zero matches in your local database does not prove absolute originality.`))
          );
          return;
        }

        const matchCards = matches.map((m) => {
          const ref = m.referenceLine || {};
          return h('div', { class: 'card match-card' },
            h('div', { class: 'row', style: 'justify-content: space-between; align-items:center;' },
              h('span', { class: `tag ${m.category === 'Exact Match' ? 'red' : ''}` }, m.category),
              h('span', { class: 'small faint' }, ref.league || 'Battle Rap')),
            h('div', { class: 'match-line' },
              h('span', { class: 'small muted' }, 'Your Line: '),
              h('b', {}, `"${m.matchedLine}"`)),
            h('div', { class: 'ref-line' },
              h('span', { class: 'small muted' }, 'Existing Reference: '),
              h('span', {}, `"${ref.text}"`)),
            h('div', { class: 'small faint', style: 'margin-top: 6px;' },
              [
                ref.emcee ? `Emcee: ${ref.emcee}` : null,
                ref.opponent ? `vs ${ref.opponent}` : null,
                ref.battle ? `Battle: ${ref.battle}` : null,
                ref.round ? `Round ${ref.round}` : null,
                ref.timestamp ? `Time: ${ref.timestamp}` : null,
              ].filter(Boolean).join(' · ') || 'No attribution metadata available'),
            ref.sourceUrl ? h('div', { class: 'small', style: 'margin-top: 4px;' },
              h('a', { href: ref.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Source Video / Link')) : null);
        });

        resultsEl.replaceChildren(
          h('div', { class: 'small muted' }, `Found ${matches.length} potential match(es) across ${totalReferenceLines} reference records:`),
          ...matchCards
        );
      },
    }, 'Scan Bars Against Database');

    contentEl.replaceChildren(
      h('div', { class: 'scanner-container card stack' },
        h('div', { class: 'scanner-title-badge' }, 'RADAR SCANNER // ORIGINALITY CHECK'),
        h('label', { style: 'font-weight: 600;' }, 'Enter Battle Rap Bars:'),
        textArea,
        h('div', { class: 'row', style: 'justify-content: flex-end;' }, scanBtn)),
      resultsEl
    );
  }

  // --- Reference Database Tab ---
  function renderDatabase() {
    const addLineBtn = h('button', {
      class: 'primary small-btn',
      onclick: async () => {
        const textInput = h('textarea', { rows: 2, placeholder: 'Enter exact bar or line' });
        const emceeInput = h('input', { type: 'text', placeholder: 'Enter emcee name' });
        const oppInput = h('input', { type: 'text', placeholder: 'Enter opponent name' });
        const battleInput = h('input', { type: 'text', placeholder: 'Enter battle or event title' });
        const leagueInput = h('input', { type: 'text', placeholder: 'Enter league' });
        const sourceUrlInput = h('input', { type: 'text', placeholder: 'Enter reference URL' });

        const ok = await formDialog({
          title: 'Add Reference Line to Database',
          confirmLabel: 'Save Reference',
          body: h('div', { class: 'stack form' },
            h('label', {}, 'Bar Text *', textInput),
            h('div', { class: 'grid2' },
              h('label', {}, 'Emcee', emceeInput),
              h('label', {}, 'Opponent', oppInput)),
            h('div', { class: 'grid2' },
              h('label', {}, 'Battle', battleInput),
              h('label', {}, 'League', leagueInput)),
            h('label', {}, 'Source URL', sourceUrlInput)),
        });

        if (ok && textInput.value.trim()) {
          await store.saveReferenceLine({
            text: textInput.value.trim(),
            emcee: emceeInput.value.trim(),
            opponent: oppInput.value.trim(),
            battle: battleInput.value.trim(),
            league: leagueInput.value.trim(),
            sourceUrl: sourceUrlInput.value.trim(),
          });
          toast('Reference line saved');
          reloadData();
        }
      },
    }, '+ Add Reference Bar');

    const list = refLines.map((r) =>
      h('div', { class: 'item' },
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, `"${r.text}"`),
          h('div', { class: 'small muted' },
            [r.emcee, r.battle, r.league].filter(Boolean).join(' · ') || 'Unattributed reference')),
        h('button', {
          class: 'ghost danger-text small-btn',
          onclick: async () => {
            await store.deleteReferenceLine(r.id);
            toast('Reference line removed');
            reloadData();
          },
        }, 'Delete'))
    );

    contentEl.replaceChildren(
      h('div', { class: 'row', style: 'justify-content: space-between; align-items:center;' },
        h('span', { class: 'small muted' }, `${refLines.length} reference lines in local storage`),
        addLineBtn),
      refLines.length ? h('div', { class: 'list' }, list) : h('div', { class: 'empty' }, 'No reference lines in database. Add well-known bars or transcripts to check your work against.')
    );
  }

  // --- Scan History Tab ---
  async function renderHistory() {
    if (!scans.length) {
      contentEl.replaceChildren(h('div', { class: 'empty' }, 'No scan history yet.'));
      return;
    }

    const cards = await Promise.all(scans.map(async (s) => {
      const matches = await store.getScanMatches(s.id);
      return h('div', { class: 'item' },
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, `"${s.submittedText.slice(0, 60)}${s.submittedText.length > 60 ? '…' : ''}"`),
          h('div', { class: 'small muted' }, `${matches.length} matches found · Scanned ${formatDate(s.scannedAt, true)}`)),
        h('button', {
          class: 'ghost danger-text small-btn',
          onclick: async () => {
            await store.deleteScan(s.id);
            toast('Scan history record deleted');
            reloadData();
          },
        }, 'Delete'));
    }));

    contentEl.replaceChildren(h('div', { class: 'list' }, cards));
  }

  function setTab(tab) {
    activeTab = tab;
    tabScannerBtn.classList.toggle('active', tab === 'scanner');
    tabDbBtn.classList.toggle('active', tab === 'database');
    tabHistBtn.classList.toggle('active', tab === 'history');

    if (tab === 'scanner') renderScanner();
    else if (tab === 'database') renderDatabase();
    else renderHistory();
  }

  tabScannerBtn.onclick = () => setTab('scanner');
  tabDbBtn.onclick = () => setTab('database');
  tabHistBtn.onclick = () => setTab('history');

  function render() {
    setTab(activeTab);
  }

  root.replaceChildren(
    h('div', { class: 'page stack' },
      h('div', { class: 'page-head' },
        h('h1', {}, 'Line Checker'),
        h('p', { class: 'muted small' }, 'Screen your bars against authorized reference records to catch unintended similarity or biting.')),
      h('div', { class: 'row', style: 'gap: 8px;' },
        tabScannerBtn, tabDbBtn, tabHistBtn),
      contentEl)
  );

  render();
}
