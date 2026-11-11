/**
 * BARAHA - Pointer-based Drag & Drop for "The Wall" battle poster cards.
 * Provides FLIP animation, dashed tape placeholder, tilt/lift feedback, and Esc cancel.
 */

export function attachWallDrag(gridElement, options = {}) {
  const {
    isPinned = false,
    isSearchActive = () => false,
    onReorder = async (orderedIds) => {},
  } = options;

  let activeCard = null;
  let placeholder = null;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let initialIndex = -1;
  let originalSibling = null;
  let touchTimer = null;
  let isTouchDevice = false;
  let longPressFired = false;

  function onPointerDown(e) {
    if (e.button !== 0) return; // Only left click
    if (isSearchActive()) return; // Disable drag during search

    // Ignore interactive controls inside card
    if (e.target.closest('button, a, input, select, .card-menu-btn, .card-pin-btn, .round-stencil-indicator, .card-menu-dropdown')) {
      return;
    }

    const card = e.target.closest('.battle-wall-card');
    if (!card || card.parentElement !== gridElement) return;

    activeCard = card;
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;
    longPressFired = false;
    isTouchDevice = e.pointerType === 'touch';

    if (isTouchDevice) {
      // Long-press timer (~350ms) before initiating drag
      touchTimer = setTimeout(() => {
        longPressFired = true;
        // Haptic feedback if supported
        try { navigator.vibrate?.(40); } catch (_) {}
        startDrag(e);
      }, 350);
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
  }

  function startDrag(e) {
    isDragging = true;
    document.body.classList.add('is-wall-dragging');

    const rect = activeCard.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    originalSibling = activeCard.nextElementSibling;
    const cards = Array.from(gridElement.querySelectorAll('.battle-wall-card'));
    initialIndex = cards.indexOf(activeCard);

    // Create dashed tape placeholder
    placeholder = document.createElement('div');
    placeholder.className = 'card-drag-placeholder';
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;

    gridElement.insertBefore(placeholder, activeCard);

    // Floating dragged card styles
    activeCard.classList.add('is-dragging');
    activeCard.style.position = 'fixed';
    activeCard.style.width = `${rect.width}px`;
    activeCard.style.height = `${rect.height}px`;
    activeCard.style.left = `${rect.left}px`;
    activeCard.style.top = `${rect.top}px`;
    activeCard.style.zIndex = '1100';
    activeCard.style.pointerEvents = 'none';
    activeCard.style.transform = 'translate3d(0, 0, 0) rotate(2.2deg) scale(1.025)';
    activeCard.style.transition = 'none';
  }

  function onPointerMove(e) {
    if (!activeCard) return;

    if (!isDragging) {
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (isTouchDevice) {
        // If moved more than 10px before long-press fired, user is scrolling: cancel long press
        if (!longPressFired && dist > 10) {
          if (touchTimer) clearTimeout(touchTimer);
          touchTimer = null;
          return;
        }
        if (!longPressFired) return;
      } else {
        if (dist < 6) return;
        startDrag(e);
      }
    }

    e.preventDefault();

    // Position dragged card
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    activeCard.style.left = `${x}px`;
    activeCard.style.top = `${y}px`;

    // Find sibling card under or closest to cursor
    const siblings = Array.from(gridElement.querySelectorAll('.battle-wall-card:not(.is-dragging)'));
    let targetSibling = null;
    let placeAfter = false;

    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      // Check if pointer is vertically and horizontally near sibling
      if (
        e.clientX >= rect.left - 20 &&
        e.clientX <= rect.right + 20 &&
        e.clientY >= rect.top - 20 &&
        e.clientY <= rect.bottom + 20
      ) {
        targetSibling = sib;
        const midX = rect.left + rect.width / 2;
        placeAfter = e.clientX > midX;
        break;
      }
    }

    if (targetSibling && placeholder) {
      const nextPos = placeAfter ? targetSibling.nextElementSibling : targetSibling;
      if (nextPos !== placeholder && targetSibling !== placeholder) {
        // FLIP animation on siblings
        const prevRects = new Map();
        siblings.forEach((s) => prevRects.set(s, s.getBoundingClientRect()));

        if (placeAfter) {
          gridElement.insertBefore(placeholder, targetSibling.nextElementSibling);
        } else {
          gridElement.insertBefore(placeholder, targetSibling);
        }

        // Apply FLIP inversion and transition
        siblings.forEach((s) => {
          const prev = prevRects.get(s);
          const curr = s.getBoundingClientRect();
          const dx = prev.left - curr.left;
          const dy = prev.top - curr.top;
          if (dx !== 0 || dy !== 0) {
            s.style.transform = `translate(${dx}px, ${dy}px)`;
            s.style.transition = 'none';
            requestAnimationFrame(() => {
              s.style.transition = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
              s.style.transform = '';
            });
          }
        });
      }
    }
  }

  function cleanup() {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
    longPressFired = false;
    isTouchDevice = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onKeyDown);
    document.body.classList.remove('is-wall-dragging');

    if (activeCard) {
      activeCard.classList.remove('is-dragging');
      activeCard.style.position = '';
      activeCard.style.width = '';
      activeCard.style.height = '';
      activeCard.style.left = '';
      activeCard.style.top = '';
      activeCard.style.zIndex = '';
      activeCard.style.pointerEvents = '';
      activeCard.style.transform = '';
      activeCard.style.transition = '';
    }

    if (placeholder && placeholder.parentElement) {
      placeholder.remove();
    }

    placeholder = null;
    activeCard = null;
    isDragging = false;
  }

  function cancelDrag() {
    if (!isDragging) {
      cleanup();
      return;
    }
    // Return card to original location
    if (activeCard && gridElement) {
      if (originalSibling && originalSibling.parentElement === gridElement) {
        gridElement.insertBefore(activeCard, originalSibling);
      } else {
        gridElement.appendChild(activeCard);
      }
    }
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cancelDrag();
    }
  }

  function onPointerCancel() {
    cancelDrag();
  }

  async function onPointerUp(e) {
    if (!activeCard) {
      cleanup();
      return;
    }

    if (!isDragging) {
      // Normal click, not a drag. Allow standard navigation
      cleanup();
      return;
    }

    // Place activeCard where placeholder is
    if (placeholder && placeholder.parentElement) {
      gridElement.insertBefore(activeCard, placeholder);
    }

    // Extract new order of card IDs
    const currentCards = Array.from(gridElement.querySelectorAll('.battle-wall-card'));
    const orderedIds = currentCards.map((c) => c.dataset.battleId).filter(Boolean);

    cleanup();

    if (orderedIds.length > 0) {
      try {
        await onReorder(orderedIds);
      } catch (err) {
        console.error('Failed to save wall reorder:', err);
      }
    }
  }

  gridElement.addEventListener('pointerdown', onPointerDown);

  return {
    destroy: () => {
      gridElement.removeEventListener('pointerdown', onPointerDown);
      cleanup();
    },
  };
}
