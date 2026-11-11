/**
 * Rich contenteditable & highlighting engine for BARAHA.
 *
 * Provides:
 * - HIGHLIGHT_COLORS palette (6 distinct BARAHA accessible colors)
 * - sanitizeRichContent(html)
 * - htmlToPlainText(html)
 * - plainTextToHtml(text)
 * - applyHighlight(color, allowedContainer)
 * - removeHighlight(allowedContainer)
 * - clearAllHighlights(container)
 * - attachHighlightBoundaryHandler(editorEl, onContentChange)
 *
 * Architecture:
 * - Character-offset model guarantees 100% reliable Range/Selection preservation.
 * - In-place DOM formatting avoids invalid Range errors across lines.
 * - Single reusable highlight engine across Final Material, Drafts, and Schemes.
 * - Zero nested <mark> elements.
 * - <br> elements are always structural and never wrapped inside <mark>.
 */

export const HIGHLIGHT_COLORS = [
  { label: 'Red',    color: '#A60000', text: '#ffffff', title: 'Red (Danger / Key Bar)' },
  { label: 'Orange', color: '#D97706', text: '#ffffff', title: 'Orange (Angle / Setup)' },
  { label: 'Yellow', color: '#B45309', text: '#ffffff', title: 'Yellow (Rhyme / Payoff)' },
  { label: 'Green',  color: '#15803D', text: '#ffffff', title: 'Green (Completed Bar)' },
  { label: 'Blue',   color: '#1D4ED8', text: '#ffffff', title: 'Blue (Delivery Cue)' },
  { label: 'Purple', color: '#7E22CE', text: '#ffffff', title: 'Purple (Scheme / Concept)' },
];


/**
 * Picks readable text for a highlight background.
 * Dark and mid colours (including all the original BARAHA colours) keep white text;
 * light colours (yellows, pastels, white) get near-black text.
 */
function parseCssColor(color) {
  const c = String(color || '').trim().toLowerCase();
  let m = c.match(/^#([0-9a-f]{3})$/);
  if (m) return m[1].split('').map((x) => parseInt(x + x, 16));
  m = c.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = c.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

export function contrastText(color) {
  const rgb = parseCssColor(color);
  if (!rgb) return '#ffffff';
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#111111' : '#ffffff';
}

/** Only accept real colour values for highlights (hex or rgb/rgba). */
export function isSafeHighlightColor(color) {
  return parseCssColor(color) !== null;
}

/**
 * Strict sanitizer: preserves line breaks and allowed <mark> highlights with BARAHA palette colors.
 * Strips all script, iframe, objects, onclicks, and unknown HTML.
 */
export function sanitizeRichContent(html) {
  if (!html || typeof html !== 'string') return '';

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  function cleanNode(node, target) {
    if (node.nodeType === Node.TEXT_NODE) {
      const clean = node.textContent.replace(/[\uFEFF\u200B]/g, '');
      if (clean) target.appendChild(document.createTextNode(clean));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();

    // Allow line breaks
    if (tag === 'br') {
      target.appendChild(document.createElement('br'));
      return;
    }

    // Allow block breaks (div, p) by appending a br if previous wasn't a br
    if (tag === 'div' || tag === 'p') {
      if (target.lastChild && target.lastChild.nodeName !== 'BR') {
        target.appendChild(document.createElement('br'));
      }
      for (const child of Array.from(node.childNodes)) {
        cleanNode(child, target);
      }
      return;
    }

    // Allow <mark> or <span> with background-color
    if (tag === 'mark' || tag === 'span') {
      const bgStyle = node.style.backgroundColor || '';
      const dataColor = node.getAttribute('data-color') || '';
      const matchedColor = dataColor || bgStyle;

      if (matchedColor && isSafeHighlightColor(matchedColor)) {
        const mark = document.createElement('mark');
        mark.className = 'baraha-highlight';
        mark.setAttribute('data-color', matchedColor);
        mark.style.backgroundColor = matchedColor;
        mark.style.color = contrastText(matchedColor);

        for (const child of Array.from(node.childNodes)) {
          cleanNode(child, mark);
        }
        target.appendChild(mark);
        return;
      }
    }

    // Default: strip tag, recurse children
    for (const child of Array.from(node.childNodes)) {
      cleanNode(child, target);
    }
  }

  const cleanWrapper = document.createElement('div');
  for (const child of Array.from(root.childNodes)) {
    cleanNode(child, cleanWrapper);
  }

  return cleanWrapper.innerHTML;
}

/**
 * Strip all HTML tags and return clean plain text (for .txt export and character counting).
 */
export function htmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/[\uFEFF\u200B]/g, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Convert plain text with newlines to HTML for contenteditable rendering.
 */
export function plainTextToHtml(text) {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.split('\n').join('<br>');
}

/**
 * Helper to check whether a DOM node is strictly within an editable writing area.
 */
export function isEditableWritingArea(node) {
  if (!node) return false;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el) return false;
  return !!el.closest('.editor, .rich-editor, .rich-field, [contenteditable="true"]');
}

/**
 * Finds the top-level contenteditable container for a given node.
 */
export function getWritingContainer(node) {
  if (!node) return null;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el) return null;
  return el.closest('.editor, .rich-editor, .rich-field, [contenteditable="true"]');
}

// =========================================================================
// CHARACTER-OFFSET SELECTION MODEL
// Translates DOM nodes & offsets to linear character indexes (and back).
// =========================================================================

/**
 * Calculates the character offset from the start of container to (targetNode, targetOffset).
 * A <br> element counts as 1 character ('\n').
 */
function getCharOffset(container, targetNode, targetOffset) {
  let charCount = 0;
  let found = false;

  function walk(node) {
    if (found) return;

    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        charCount += Math.min(targetOffset, node.textContent.length);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (let i = 0; i < targetOffset && i < node.childNodes.length; i++) {
          const child = node.childNodes[i];
          if (child.nodeType === Node.TEXT_NODE) {
            charCount += child.textContent.length;
          } else if (child.tagName === 'BR') {
            charCount += 1;
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            charCount += getSubtreeCharLength(child);
          }
        }
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      charCount += node.textContent.length;
      return;
    }

    if (node.tagName === 'BR') {
      charCount += 1;
      return;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i]);
      if (found) return;
    }
  }

  walk(container);
  return charCount;
}

function getSubtreeCharLength(node) {
  let len = 0;
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.length;
  if (node.tagName === 'BR') return 1;
  for (let i = 0; i < node.childNodes.length; i++) {
    len += getSubtreeCharLength(node.childNodes[i]);
  }
  return len;
}

/**
 * Converts a linear character offset back to a { node, offset } DOM position.
 */
function getNodeAndOffsetAt(container, targetCharOffset) {
  let charCount = 0;
  let result = null;

  function walk(node) {
    if (result) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      if (charCount + len >= targetCharOffset) {
        result = { node, offset: Math.min(len, Math.max(0, targetCharOffset - charCount)) };
        return;
      }
      charCount += len;
      return;
    }

    if (node.tagName === 'BR') {
      if (charCount + 1 >= targetCharOffset) {
        const parent = node.parentNode;
        const idx = Array.from(parent.childNodes).indexOf(node);
        result = { node: parent, offset: idx + (targetCharOffset > charCount ? 1 : 0) };
        return;
      }
      charCount += 1;
      return;
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i]);
      if (result) return;
    }
  }

  walk(container);
  if (!result) {
    result = { node: container, offset: container.childNodes.length };
  }
  return result;
}

/**
 * Returns the current selection offsets { start, end, isCollapsed } within container, or null.
 */
function getSelectionOffsets(container) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);

  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }

  const start = getCharOffset(container, range.startContainer, range.startOffset);
  const end = getCharOffset(container, range.endContainer, range.endOffset);

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    isCollapsed: range.isCollapsed,
  };
}

/**
 * Sets the browser selection in container to the given character offsets.
 */
function setSelectionOffsets(container, start, end) {
  const startLoc = getNodeAndOffsetAt(container, start);
  const endLoc = (start === end) ? startLoc : getNodeAndOffsetAt(container, end);
  if (!startLoc || !endLoc) return;

  try {
    const range = document.createRange();
    range.setStart(startLoc.node, startLoc.offset);
    range.setEnd(endLoc.node, endLoc.offset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (err) {
    console.warn('setSelectionOffsets failed:', err);
  }
}

/**
 * Collects all leaf Text nodes in container with their start/end character offsets.
 */
function getTextNodesWithOffsets(container) {
  const list = [];
  let offset = 0;

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      list.push({ node, start: offset, end: offset + len });
      offset += len;
      return;
    }
    if (node.tagName === 'BR') {
      offset += 1;
      return;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i]);
    }
  }

  walk(container);
  return list;
}

// =========================================================================
// NORMALIZATION & SANITIZATION
// Ensures no nested marks, no empty marks, and <br> elements are never inside <mark>.
// =========================================================================

/**
 * Normalizes all highlights in container:
 * 1. Pulls any <br> elements out of <mark> so lines never inherit highlights.
 * 2. Unwraps any nested <mark> elements.
 * 3. Removes empty <mark> elements.
 * 4. Merges adjacent <mark> elements having the same color.
 * 5. Calls container.normalize() to merge adjacent text nodes.
 */
export function normalizeHighlights(container) {
  if (!container) return;

  // 1. Pull <br> out of marks
  const brsInMarks = container.querySelectorAll('mark br');
  brsInMarks.forEach((br) => {
    const mark = br.closest('mark');
    if (!mark) return;
    const parent = mark.parentNode;
    if (!parent) return;

    // Split mark at the BR position
    const afterRange = document.createRange();
    afterRange.setStartAfter(br);
    afterRange.setEndAfter(mark.lastChild);
    const afterFrag = afterRange.extractContents();

    parent.insertBefore(br, mark.nextSibling);
    if (afterFrag.childNodes.length > 0) {
      const newMark = mark.cloneNode(false);
      newMark.appendChild(afterFrag);
      parent.insertBefore(newMark, br.nextSibling);
    }
  });

  // 2. Flatten nested marks: <mark>...<mark>...</mark>...</mark>
  const innerMarks = container.querySelectorAll('mark mark');
  innerMarks.forEach((inner) => {
    const parent = inner.parentNode;
    if (parent) {
      while (inner.firstChild) parent.insertBefore(inner.firstChild, inner);
      parent.removeChild(inner);
    }
  });

  // 3. Remove empty or whitespace-only marks (pulling out any br first)
  const marks = container.querySelectorAll('mark');
  marks.forEach((m) => {
    const cleanText = (m.textContent || '').replace(/[\uFEFF\u200B\s]/g, '');
    if (!cleanText || cleanText.length === 0) {
      while (m.firstChild) {
        m.parentNode.insertBefore(m.firstChild, m);
      }
      m.remove();
    }
  });

  // 4. Merge adjacent marks of identical color
  const allMarks = Array.from(container.querySelectorAll('mark.baraha-highlight'));
  for (const m of allMarks) {
    if (!m.parentNode) continue;
    let next = m.nextSibling;
    while (next && next.nodeType === Node.TEXT_NODE && next.textContent === '') {
      const empty = next;
      next = next.nextSibling;
      empty.remove();
    }
    if (next && next.tagName === 'MARK' && next.classList.contains('baraha-highlight')) {
      const colorA = (m.getAttribute('data-color') || m.style.backgroundColor || '').toLowerCase();
      const colorB = (next.getAttribute('data-color') || next.style.backgroundColor || '').toLowerCase();
      if (colorA && colorA === colorB) {
        while (next.firstChild) m.appendChild(next.firstChild);
        next.remove();
      }
    }
  }

  // 5. Merge adjacent plain text nodes
  container.normalize();
}

// =========================================================================
// CORE HIGHLIGHT ENGINE
// Google Docs-style highlighting: apply, recolor, remove with selection preservation.
// =========================================================================

/**
 * Applies highlight color to the current window selection.
 *
 * Workflow (matches Google Docs):
 * 1. Selected text immediately receives the new color.
 * 2. If text was already highlighted, color is replaced (never nested, never removed).
 * 3. Selection remains valid and selected.
 * 4. Whitespace-only selections are safely rejected.
 * 5. Works seamlessly across single-line, multi-line, and multi-word selections.
 *
 * @param {string} color CSS hex color (e.g. '#A60000')
 * @param {HTMLElement|null} allowedContainer Optional container boundary
 * @returns {boolean} true if highlight was applied
 */
export function applyHighlight(color, allowedContainer = null) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;

  const range = sel.getRangeAt(0);

  // Reject whitespace-only selections
  const selectedText = range.toString();
  if (!selectedText || selectedText.trim() === '') return false;

  // Determine writing container
  const container = allowedContainer || getWritingContainer(range.commonAncestorContainer) || getWritingContainer(range.startContainer);
  if (!container || !isEditableWritingArea(container)) return false;

  const offsets = getSelectionOffsets(container);
  if (!offsets || offsets.isCollapsed || offsets.start >= offsets.end) return false;

  const { start: selStart, end: selEnd } = offsets;

  // Find all text nodes that intersect [selStart, selEnd]
  const textEntries = getTextNodesWithOffsets(container);
  const targets = textEntries.filter((item) => Math.max(item.start, selStart) < Math.min(item.end, selEnd));
  if (targets.length === 0) return false;

  // Process targets in REVERSE order so text node splits don't affect earlier offsets
  for (let i = targets.length - 1; i >= 0; i--) {
    const item = targets[i];
    let node = item.node;
    if (!node.parentNode) continue;

    const overlapStart = Math.max(item.start, selStart) - item.start;
    const overlapEnd = Math.min(item.end, selEnd) - item.start;

    // Split at start of overlap if necessary
    if (overlapStart > 0) {
      node = node.splitText(overlapStart);
    }

    // Split at end of overlap if necessary
    const targetLength = overlapEnd - overlapStart;
    if (targetLength < node.textContent.length) {
      node.splitText(targetLength);
    }

    // Skip empty or whitespace-only segment
    if (!node.textContent || node.textContent.trim() === '') continue;

    // Never highlight spaces: split off any leading or trailing whitespace so spaces remain plain text
    const leadingWsMatch = node.textContent.match(/^\s+/);
    if (leadingWsMatch) {
      const leadingWsLen = leadingWsMatch[0].length;
      if (leadingWsLen >= node.textContent.length) continue;
      node = node.splitText(leadingWsLen);
    }
    const trailingWsMatch = node.textContent.match(/\s+$/);
    if (trailingWsMatch) {
      const keepLen = node.textContent.length - trailingWsMatch[0].length;
      if (keepLen <= 0) continue;
      node.splitText(keepLen);
    }

    if (!node.textContent || node.textContent.trim() === '') continue;

    // Check if node is inside a mark
    const existingMark = node.parentElement && node.parentElement.tagName === 'MARK' ? node.parentElement : null;

    if (existingMark) {
      // Recolor in place if node is the sole child of existingMark
      if (existingMark.childNodes.length === 1 && existingMark.firstChild === node) {
        existingMark.setAttribute('data-color', color);
        existingMark.style.backgroundColor = color;
        existingMark.style.color = contrastText(color);
        existingMark.className = 'baraha-highlight';
      } else {
        // Split existingMark cleanly around node preserving exact DOM sibling order
        const newMark = document.createElement('mark');
        newMark.className = 'baraha-highlight';
        newMark.setAttribute('data-color', color);
        newMark.style.backgroundColor = color;
        newMark.style.color = contrastText(color);

        // Move siblings after node to a cloned afterMark
        const afterMark = existingMark.cloneNode(false);
        let curr = node.nextSibling;
        while (curr) {
          const next = curr.nextSibling;
          afterMark.appendChild(curr);
          curr = next;
        }

        const markParent = existingMark.parentNode;
        markParent.insertBefore(newMark, existingMark.nextSibling);
        newMark.appendChild(node);

        if (afterMark.childNodes.length > 0) {
          markParent.insertBefore(afterMark, newMark.nextSibling);
        }
        if (!existingMark.textContent) {
          existingMark.remove();
        }
      }
    } else {
      // Wrap node in a new mark
      const mark = document.createElement('mark');
      mark.className = 'baraha-highlight';
      mark.setAttribute('data-color', color);
      mark.style.backgroundColor = color;
      mark.style.color = contrastText(color);

      node.parentNode.insertBefore(mark, node);
      mark.appendChild(node);
    }
  }

  // Normalize DOM: flatten nesting, merge same-colored adjacent marks, move <br> out
  normalizeHighlights(container);

  // Restore selection: user's text remains selected with the new color
  setSelectionOffsets(container, selStart, selEnd);

  return true;
}

/**
 * Removes highlight from the current selection ("No Highlight").
 * Unwraps all marks within the selection, leaving clean plain text.
 * Selection remains valid.
 *
 * @param {HTMLElement|null} allowedContainer Optional container boundary
 * @returns {boolean} true if highlight was removed
 */
export function removeHighlight(allowedContainer = null) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;

  const range = sel.getRangeAt(0);
  const container = allowedContainer || getWritingContainer(range.commonAncestorContainer) || getWritingContainer(range.startContainer);
  if (!container || !isEditableWritingArea(container)) return false;

  const offsets = getSelectionOffsets(container);
  if (!offsets || offsets.isCollapsed || offsets.start >= offsets.end) return false;

  const { start: selStart, end: selEnd } = offsets;

  // Find all text nodes that intersect [selStart, selEnd]
  const textEntries = getTextNodesWithOffsets(container);
  const targets = textEntries.filter((item) => Math.max(item.start, selStart) < Math.min(item.end, selEnd));

  let removedAny = false;

  // Process in reverse order
  for (let i = targets.length - 1; i >= 0; i--) {
    const item = targets[i];
    let node = item.node;
    if (!node.parentNode) continue;

    const mark = node.parentElement && node.parentElement.tagName === 'MARK' ? node.parentElement : null;
    if (!mark) continue; // Not highlighted, nothing to remove

    const overlapStart = Math.max(item.start, selStart) - item.start;
    const overlapEnd = Math.min(item.end, selEnd) - item.start;

    // Split at start of overlap
    if (overlapStart > 0) {
      node = node.splitText(overlapStart);
    }

    // Split at end of overlap
    const targetLength = overlapEnd - overlapStart;
    if (targetLength < node.textContent.length) {
      node.splitText(targetLength);
    }

    // Unwrap this node from mark preserving DOM sibling order
    if (mark.childNodes.length === 1 && mark.firstChild === node) {
      mark.parentNode.insertBefore(node, mark);
      mark.remove();
      removedAny = true;
    } else {
      const afterMark = mark.cloneNode(false);
      let curr = node.nextSibling;
      while (curr) {
        const next = curr.nextSibling;
        afterMark.appendChild(curr);
        curr = next;
      }

      const markParent = mark.parentNode;
      markParent.insertBefore(node, mark.nextSibling);

      if (afterMark.childNodes.length > 0) {
        markParent.insertBefore(afterMark, node.nextSibling);
      }
      if (!mark.textContent) {
        mark.remove();
      }
      removedAny = true;
    }
  }

  // Normalize DOM: removes empty marks, merges adjacent text nodes
  normalizeHighlights(container);

  // Restore selection over the plain text
  setSelectionOffsets(container, selStart, selEnd);

  return removedAny;
}

/**
 * Clears all highlights from the given container element without touching text or line breaks.
 */
export function clearAllHighlights(container) {
  if (!container) return;
  const marks = Array.from(container.querySelectorAll('mark'));
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (parent) {
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      m.remove();
    }
  });
  container.normalize();
}

// =========================================================================
// BOUNDARY CARET ESCAPE HANDLER
// Ensures pressing Space or Enter after a highlight cleanly exits the mark.
// =========================================================================

/**
 * Attaches boundary escape handling so:
 * 1. Pressing Space after highlighting text inserts a normal space OUTSIDE the mark.
 * 2. Pressing Enter after a highlight creates a new line OUTSIDE the mark.
 * 3. The inserted space or newline never inherits the highlight.
 *
 * @param {HTMLElement} editorEl The contenteditable element
 * @param {Function|null} onContentChange Callback when content changes
 */
export function attachHighlightBoundaryHandler(editorEl, onContentChange = null) {
  if (!editorEl) return;
  if (editorEl._hasHighlightBoundary) return; // Prevent duplicate bindings
  editorEl._hasHighlightBoundary = true;

  /**
   * Find the innermost <mark> ancestor of a node (or null if not inside a mark).
   */
  function insideMark(node) {
    if (!node) return null;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node.nodeType === Node.ELEMENT_NODE ? node : null);
    if (!el) return null;
    return el.closest('mark.baraha-highlight');
  }

  /**
   * Insert a plain (non-highlighted) line break after the given mark.
   * Sets the caret to the new line, completely outside any mark.
   */
  function insertBreakAfterMark(mark, sel) {
    const br = document.createElement('br');
    mark.parentNode.insertBefore(br, mark.nextSibling);

    // Use \uFEFF anchor so the browser has a text node to place caret into.
    // This text node is a child of the editor root (not of any mark),
    // so it has no inherited highlight formatting.
    const anchor = document.createTextNode('\uFEFF');
    mark.parentNode.insertBefore(anchor, br.nextSibling);

    const r = document.createRange();
    r.setStart(anchor, 1);
    r.setEnd(anchor, 1);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /**
   * Insert a plain space outside the given mark (after it).
   * Sets the caret after the space.
   */
  function insertSpaceAfterMark(mark, sel) {
    let next = mark.nextSibling;
    if (!next || next.nodeType !== Node.TEXT_NODE) {
      next = document.createTextNode('');
      mark.parentNode.insertBefore(next, mark.nextSibling);
    }
    next.textContent = ' ' + (next.textContent || '');
    const r = document.createRange();
    r.setStart(next, 1);
    r.setEnd(next, 1);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  editorEl.addEventListener('keydown', (e) => {
    const isSpace = e.key === ' ' || e.code === 'Space';
    const isEnter = e.key === 'Enter';
    if (!isSpace && !isEnter) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    // ── Case A: selection spans text inside a mark (e.g. just applied highlight) ──
    // When user presses Space/Enter after highlighting, don't insert inside the mark.
    if (!sel.isCollapsed && isSpace) {
      const ancestor = range.commonAncestorContainer;
      const mark = insideMark(ancestor);
      if (mark) {
        e.preventDefault();
        // Collapse selection to end of the mark, then insert space outside
        insertSpaceAfterMark(mark, sel);
        onContentChange?.();
        return;
      }
    }

    // ── Case B: collapsed caret is ANYWHERE inside a mark ──
    if (sel.isCollapsed) {
      const anchorNode = sel.anchorNode;
      const anchorOffset = sel.anchorOffset;

      // Check if caret is inside a mark
      const mark = insideMark(anchorNode);

      if (mark) {
        e.preventDefault();

        if (isEnter) {
          // Determine if caret is at the very end of the mark
          const markText = mark.textContent;
          let caretPosInMark = 0;
          if (anchorNode.nodeType === Node.TEXT_NODE && anchorNode.parentElement === mark) {
            // Simple case: caret is in a direct text child of mark
            caretPosInMark = anchorOffset;
            const totalLen = markText.length;

            if (caretPosInMark === totalLen) {
              // At end of mark — insert br + anchor AFTER the mark
              insertBreakAfterMark(mark, sel);
            } else {
              // Mid-mark — split the mark at caret, insert br between the two halves
              const textNode = anchorNode;
              const afterText = textNode.splitText(anchorOffset);

              // Create new mark for the text after the caret
              const newMark = mark.cloneNode(false);
              // Move all siblings after the split point into newMark
              let sibling = afterText;
              while (sibling) {
                const nextSib = sibling.nextSibling;
                newMark.appendChild(sibling);
                sibling = nextSib;
              }

              const br = document.createElement('br');
              mark.parentNode.insertBefore(br, mark.nextSibling);
              mark.parentNode.insertBefore(newMark, br.nextSibling);

              // Place caret at start of newMark
              const r = document.createRange();
              r.setStart(newMark, 0);
              r.setEnd(newMark, 0);
              sel.removeAllRanges();
              sel.addRange(r);
            }
          } else {
            // Fallback: caret is at boundary or in mark element itself
            insertBreakAfterMark(mark, sel);
          }
        } else {
          // Space key inside mark
          const textNode = anchorNode;
          if (textNode.nodeType === Node.TEXT_NODE && textNode.parentElement === mark) {
            const offset = anchorOffset;
            const totalLen = textNode.textContent.length;

            if (offset === totalLen) {
              // At end: insert space outside the mark
              insertSpaceAfterMark(mark, sel);
            } else {
              // Mid-mark: allow normal space insertion (browser handles it inside mark)
              // We just let the event proceed naturally.
              // But we must NOT preventDefault here — just return.
              return;
            }
          } else {
            insertSpaceAfterMark(mark, sel);
          }
        }

        onContentChange?.();
        return;
      }

      // ── Case C: caret is just AFTER a mark (previous sibling is a mark) ──
      // This handles the case where the browser has placed the caret on the
      // "outside-right" of a mark but hasn't actually moved into a text node yet.
      let prevMark = null;
      if (anchorNode.nodeType === Node.TEXT_NODE && anchorOffset === 0 && anchorNode.previousSibling && anchorNode.previousSibling.tagName === 'MARK') {
        prevMark = anchorNode.previousSibling;
      } else if (anchorNode.nodeType === Node.ELEMENT_NODE && anchorOffset > 0) {
        const prevChild = anchorNode.childNodes[anchorOffset - 1];
        if (prevChild && prevChild.tagName === 'MARK') prevMark = prevChild;
      }

      if (prevMark && isEnter) {
        e.preventDefault();
        insertBreakAfterMark(prevMark, sel);
        onContentChange?.();
        return;
      }
      if (prevMark && isSpace) {
        e.preventDefault();
        insertSpaceAfterMark(prevMark, sel);
        onContentChange?.();
        return;
      }
    }
  });

  // Do NOT run normalizeHighlights on every input keystroke — it calls
  // container.normalize() which merges text nodes and corrupts the caret position
  // mid-typing. Only call normalizeHighlights explicitly after highlight operations.
}
