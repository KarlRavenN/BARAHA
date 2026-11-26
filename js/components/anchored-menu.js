// Keeps a floating menu attached to the element that opened it (a "contextual menu").
//
// Why the old menu drifted: it was positioned once, from the button's rect at the moment it opened,
// and never updated. Now the position is recomputed from the trigger's CURRENT rect on every frame
// while the menu is open (so scrolling, hover lifts and animations all stay attached), and the menu
// is clamped to the viewport. Only positions are set here; colours, sizes and animations stay in the CSS.

const MARGIN = 8; // breathing room from the screen edge
const GAP = 6;    // space between the trigger and the menu

/**
 * Attach `menu` (already in the DOM) to `trigger`.
 * @param {HTMLElement} menu
 * @param {HTMLElement} trigger
 * @param {{ onDetach?: () => void }} [opts]  called once when the menu is no longer attached
 * @returns {() => void} detach function
 */
export function anchorMenu(menu, trigger, { onDetach } = {}) {
  let frame = 0;
  let done = false;

  const detach = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    onDetach?.();
  };

  // Hides the menu when its card scrolls out of view (like VS Code and Notion), instead of floating.
  const trackingLost = (r) => r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;

  function place() {
    if (done) return;
    if (!menu.isConnected || !trigger.isConnected) return detach();
    const r = trigger.getBoundingClientRect();
    if (trackingLost(r)) { menu.remove(); return detach(); }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // No overflow rules here: the submenu lives inside this menu and must not be clipped by it.
    menu.style.maxWidth = `${vw - MARGIN * 2}px`;

    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;

    // Vertical: below the trigger if it fits, otherwise above it, otherwise pinned to the edge.
    const below = vh - r.bottom - GAP;
    const above = r.top - GAP;
    let top = r.bottom + GAP;
    if (mh > below && above > below) top = r.top - GAP - mh;
    top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - mh - MARGIN));

    // Horizontal: align the menu's right edge with the trigger, then clamp inside the screen.
    let left = r.right - mw;
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - mw - MARGIN));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.right = 'auto';
    menu.style.bottom = 'auto';

    // Submenus: open to the side with room, and move up if they would run off the bottom.
    for (const item of menu.querySelectorAll('.menu-item.has-sub')) {
      placeSubmenu(item, menu);
    }
  }

  // Re-check every frame while open. A scroll is only one way the button can move: a card can also
  // lift on hover, animate, or re-layout, and none of those fire a scroll event.
  function tick() {
    place();
    if (!done) frame = requestAnimationFrame(tick);
  }

  place();
  if (!done) frame = requestAnimationFrame(tick);
  return detach;
}

/**
 * Places a submenu inside the viewport. It opens to the right of its row by default, flips to the
 * left when there is no room on the right, and moves up when it would run off the bottom.
 * Uses the row's live rect, so it stays correct while the page scrolls.
 */
export function placeSubmenu(item, menuEl) {
  const sub = item.querySelector('.menu-status-options');
  if (!sub) return;
  const row = item.querySelector('.menu-item-row') || item;
  const rr = row.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sw = Math.max(sub.offsetWidth, 140);
  const sh = Math.max(sub.offsetHeight, 120);

  const fitsRight = rr.right + 4 + sw <= vw - MARGIN;
  const fitsLeft = rr.left - 4 - sw >= MARGIN;
  // Only flip left if it fits there, or if right is the worse option
  const openLeft = !fitsRight && (fitsLeft || rr.left > vw - rr.right);
  sub.classList.toggle('open-left', openLeft);
  sub.style.left = openLeft ? 'auto' : '100%';
  sub.style.right = openLeft ? '100%' : 'auto';
  sub.style.marginLeft = openLeft ? '0' : '4px';
  sub.style.marginRight = openLeft ? '4px' : '0';

  const fitsDown = rr.top + sh <= vh - MARGIN;
  if (fitsDown) {
    sub.style.top = '0';
    sub.style.bottom = 'auto';
  } else {
    sub.style.top = 'auto';
    sub.style.bottom = '0';
  }
}

/**
 * Touch screens have no hover, so a tap on the row opens the submenu. Desktop keeps the hover behaviour.
 */
export function wireSubmenuTaps(menuEl) {
  if (!window.matchMedia('(hover: none)').matches) return;
  for (const item of menuEl.querySelectorAll('.menu-item.has-sub')) {
    const row = item.querySelector('.menu-item-row');
    row?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const open = !item.classList.contains('is-open');
      for (const other of menuEl.querySelectorAll('.menu-item.has-sub.is-open')) other.classList.remove('is-open');
      item.classList.toggle('is-open', open);
      if (open) placeSubmenu(item, menuEl);
    });
  }
}
