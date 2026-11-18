import { h } from '../core/ui.js';
import { navHistory, goBack } from '../core/nav-history.js';

/**
 * The spray-paint Back button (assets/icons/back-*.png).
 *   fallback       where to go when there is no previous page (the page's parent)
 *   onlyIfPrevious render nothing unless a previous page exists (used on The Wall)
 *   size           'md' = header button (48px art), 'sm' = tight spots (24px art)
 *   onclick        replace the default "go to previous page" (e.g. save, then close an inline editor)
 */
export function backButton({ fallback = '/', onlyIfPrevious = false, size = 'md', onclick = null, label = 'Back' } = {}) {
  if (onlyIfPrevious && !navHistory.previous()) return null;
  const sm = size === 'sm';
  const img = h('img', {
    src: `assets/icons/back-${sm ? 24 : 48}.png`,
    srcset: `assets/icons/back-${sm ? 48 : 96}.png 2x`,
    alt: '', width: sm ? '28' : '44', height: sm ? '28' : '44', draggable: 'false',
  });
  return h('button', {
    type: 'button',
    class: `back-btn${sm ? ' is-sm' : ''}`,
    title: label,
    'aria-label': label,
    onclick: (e) => (onclick ? onclick(e) : goBack(fallback)),
  }, img);
}
