import { h } from '../core/ui.js';
import { debounce } from '../core/util.js';

/**
 * Custom Find Bar for the writing area, scoped to the round currently open.
 * Uses the CSS Custom Highlight API so the editor's HTML and saved text are never modified.
 */
export function mountFindBar(container, editorElement, { onClose = null } = {}) {
  let isBarOpen = false;
  let matchCase = false;
  let matchWholeWord = false;
  let matches = [];
  let currentIndex = 0;

  const input = h('input', {
    type: 'text',
    class: 'find-bar-input',
    placeholder: 'Find in round',
    'aria-label': 'Find in round',
  });

  const countBadge = h('span', { class: 'find-bar-count faint' }, '');

  const prevBtn = h('button', {
    class: 'find-bar-btn prev-btn',
    title: 'Previous match (Shift+Enter)',
    'aria-label': 'Previous match',
    onclick: () => goToMatch(currentIndex - 1),
  }, '▲');

  const nextBtn = h('button', {
    class: 'find-bar-btn next-btn',
    title: 'Next match (Enter)',
    'aria-label': 'Next match',
    onclick: () => goToMatch(currentIndex + 1),
  }, '▼');

  const caseBtn = h('button', {
    class: 'find-bar-btn toggle-btn toggle-case',
    title: 'Match case (Aa)',
    'aria-label': 'Match case',
    onclick: () => {
      matchCase = !matchCase;
      caseBtn.classList.toggle('active', matchCase);
      runSearch();
    },
  }, 'Aa');

  const wordBtn = h('button', {
    class: 'find-bar-btn toggle-btn toggle-word',
    title: 'Match whole word (\\b)',
    'aria-label': 'Match whole word',
    onclick: () => {
      matchWholeWord = !matchWholeWord;
      wordBtn.classList.toggle('active', matchWholeWord);
      runSearch();
    },
  }, '\\b');

  const closeBtn = h('button', {
    class: 'find-bar-btn close-btn',
    title: 'Close find bar (Esc)',
    'aria-label': 'Close find bar',
    onclick: () => close(),
  }, '✕');

  const barEl = h('div', {
    class: 'workspace-find-bar',
    style: 'display: none;',
  },
    input,
    countBadge,
    prevBtn,
    nextBtn,
    caseBtn,
    wordBtn,
    closeBtn
  );

  container.appendChild(barEl);

  function clearHighlights() {
    matches = [];
    currentIndex = 0;
    countBadge.textContent = '';
    countBadge.classList.remove('no-matches');
    if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
      CSS.highlights.delete('find-match');
      CSS.highlights.delete('find-match-active');
    }
  }

  function scrollCurrentMatchIntoView() {
    if (!matches.length || !matches[currentIndex]) return;
    const range = matches[currentIndex];
    const scrollContainer = editorElement.closest('.editor-area') || editorElement;
    try {
      const rect = range.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const margin = 50;
      if (rect.bottom > containerRect.bottom - margin) {
        scrollContainer.scrollTop += (rect.bottom - containerRect.bottom + margin);
      } else if (rect.top < containerRect.top + margin) {
        scrollContainer.scrollTop -= (containerRect.top + margin - rect.top);
      }
    } catch (_) {}
  }

  function updateHighlightsAndCount() {
    if (!matches.length) {
      if (input.value.trim()) {
        countBadge.textContent = 'No results';
        countBadge.classList.add('no-matches');
      } else {
        countBadge.textContent = '';
        countBadge.classList.remove('no-matches');
      }
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        CSS.highlights.delete('find-match');
        CSS.highlights.delete('find-match-active');
      }
      return;
    }

    countBadge.classList.remove('no-matches');
    countBadge.textContent = `${currentIndex + 1} of ${matches.length}`;

    if (typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined') {
      const activeRange = matches[currentIndex];
      const otherRanges = matches.filter((_, i) => i !== currentIndex);

      if (otherRanges.length > 0) {
        CSS.highlights.set('find-match', new Highlight(...otherRanges));
      } else {
        CSS.highlights.delete('find-match');
      }
      if (activeRange) {
        CSS.highlights.set('find-match-active', new Highlight(activeRange));
      } else {
        CSS.highlights.delete('find-match-active');
      }
    }

    scrollCurrentMatchIntoView();
  }

  function goToMatch(index) {
    if (!matches.length) return;
    if (index >= matches.length) currentIndex = 0;
    else if (index < 0) currentIndex = matches.length - 1;
    else currentIndex = index;
    updateHighlightsAndCount();
  }

  function runSearch() {
    if (!isBarOpen) return;
    const query = input.value;
    if (!query) {
      clearHighlights();
      return;
    }

    const walker = document.createTreeWalker(editorElement, NodeFilter.SHOW_TEXT, null);
    const newMatches = [];
    let textNode;

    const testQuery = matchCase ? query : query.toLowerCase();

    while ((textNode = walker.nextNode())) {
      const nodeText = textNode.nodeValue || '';
      const compareText = matchCase ? nodeText : nodeText.toLowerCase();

      let pos = 0;
      while ((pos = compareText.indexOf(testQuery, pos)) !== -1) {
        let isMatch = true;
        if (matchWholeWord) {
          const charBefore = pos > 0 ? nodeText[pos - 1] : ' ';
          const charAfter = pos + query.length < nodeText.length ? nodeText[pos + query.length] : ' ';
          const isWordChar = (c) => /[\p{L}\p{N}_]/u.test(c);
          if (isWordChar(charBefore) || isWordChar(charAfter)) {
            isMatch = false;
          }
        }

        if (isMatch) {
          try {
            const range = document.createRange();
            range.setStart(textNode, pos);
            range.setEnd(textNode, pos + query.length);
            newMatches.push(range);
          } catch (_) {}
        }
        pos += query.length || 1;
      }
    }

    matches = newMatches;
    if (currentIndex >= matches.length) {
      currentIndex = 0;
    }
    updateHighlightsAndCount();
  }

  const debouncedSearch = debounce(runSearch, 150);

  // Keyboard navigation within the find input
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        goToMatch(currentIndex - 1);
      } else {
        goToMatch(currentIndex + 1);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  input.addEventListener('input', () => {
    currentIndex = 0;
    runSearch();
  });

  // Re-search when the content of the writing area updates live
  const onEditorInput = () => {
    if (isBarOpen && input.value) {
      debouncedSearch();
    }
  };
  editorElement.addEventListener('input', onEditorInput);

  function open() {
    isBarOpen = true;
    barEl.style.display = 'inline-flex';
    input.focus();
    input.select();
    if (input.value) {
      runSearch();
    }
  }

  function close() {
    isBarOpen = false;
    barEl.style.display = 'none';
    clearHighlights();
    editorElement.focus();
    if (onClose) onClose();
  }

  return {
    open,
    close,
    isOpen: () => isBarOpen,
    triggerSearch: runSearch,
    destroy: () => {
      clearHighlights();
      editorElement.removeEventListener('input', onEditorInput);
      barEl.remove();
    },
  };
}
