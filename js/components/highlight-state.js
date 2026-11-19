import { getSetting, setSetting } from '../core/store.js';

/**
 * Shared highlight colour state: the toolbar highlight button, the right-click menu and the
 * "More colors" palette all read and write the SAME "last used" colour and recent list.
 * Saved in settings under 'highlightLast' / 'highlightRecent' (same keys as before).
 */

export const HIGHLIGHT_PALETTE = [
  { label: 'Red',    color: '#A60000', title: 'Red (Danger / Key Bar)' },
  { label: 'Orange', color: '#D97706', title: 'Orange (Angle / Setup)' },
  { label: 'Yellow', color: '#B45309', title: 'Yellow (Rhyme / Payoff)' },
  { label: 'Green',  color: '#15803D', title: 'Green (Completed Bar)' },
  { label: 'Blue',   color: '#1D4ED8', title: 'Blue (Delivery Cue)' },
  { label: 'Purple', color: '#7E22CE', title: 'Purple (Scheme / Concept)' },
];

export const MAX_RECENT = 10;
export const DEFAULT_HIGHLIGHT = HIGHLIGHT_PALETTE[0].color;
const HEX = /^#[0-9a-f]{6}$/i;
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

let last = DEFAULT_HIGHLIGHT;
let recent = [];
let loadPromise = null;
const listeners = new Set();

function notify() { listeners.forEach((fn) => { try { fn(); } catch { /* a bad listener must not break the others */ } }); }

/** Loads the saved colours once. Safe to call many times. */
export function loadHighlightState() {
  if (!loadPromise) {
    loadPromise = Promise.all([getSetting('highlightLast', null), getSetting('highlightRecent', [])])
      .then(([l, r]) => {
        const lastVal = l && typeof l === 'object' && 'value' in l ? l.value : l;
        const recVal = r && typeof r === 'object' && 'value' in r ? r.value : r;
        if (typeof lastVal === 'string' && HEX.test(lastVal)) last = lastVal;
        if (Array.isArray(recVal)) recent = recVal.filter((c) => HEX.test(c)).slice(0, MAX_RECENT);
        notify();
      })
      .catch(() => {});
  }
  return loadPromise;
}

export const getLastColor = () => last;
export const getRecentColors = () => recent.slice();

/** Call after a colour was really applied: it becomes "last used" and moves to the front of recents. */
export function recordHighlightColor(color) {
  if (!HEX.test(color)) return;
  last = color;
  recent = [color, ...recent.filter((c) => !same(c, color))].slice(0, MAX_RECENT);
  setSetting('highlightLast', color).catch(() => {});
  setSetting('highlightRecent', recent).catch(() => {});
  notify();
}

export function onHighlightStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
