/**
 * Inline SVG icons for the BARAHA toolbar.
 * All icons use currentColor, so they inherit the theme text colour and hover states.
 * They replace emoji and font glyphs (🔍, ⭳) that rendered in the wrong colour or went missing on phones.
 */
const PATHS = {
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  export: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  highlighter: '<path d="M14.5 4.5l5 5-8 8H6.5v-5z"/><path d="M12 7l5 5"/>',
  caret: '<path d="M7 10l5 5 5-5"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M12 6v12"/><path d="M6 12h12"/>',
  none: '<circle cx="12" cy="12" r="7.5"/><path d="M6.7 17.3l10.6-10.6"/>',
  check: '<path d="M5.5 12.5l4.2 4.2 8.8-9.4"/>',
};

export function iconSvg(name, size = 18) {
  const body = PATHS[name] || '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Returns a <span class="tb-icon tb-svg"> holding the icon. */
export function iconEl(name, size = 18, extraClass = '') {
  const el = document.createElement('span');
  el.className = `tb-icon tb-svg ${extraClass}`.trim();
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = iconSvg(name, size);
  return el;
}
