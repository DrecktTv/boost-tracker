/**
 * Ouvre / ferme les modals (overlays).
 * Les boutons ✕ et Annuler dans le HTML appelleront ces fonctions
 * via des listeners attachés dans main.js.
 */
export function oov(id) {
  document.getElementById(id)?.classList.add('open');
}

export function cov(id) {
  document.getElementById(id)?.classList.remove('open');
}

/** Ferme tous les overlays ouverts */
export function closeAll() {
  document.querySelectorAll('.overlay.open').forEach(el => el.classList.remove('open'));
}

/** Init : ferme les overlays quand on clique sur le fond noir ou un [data-close] */
export function initModals() {
  document.querySelectorAll('.overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) cov(overlay.id);
    });
  });

  // Boutons ✕ / Annuler avec data-close="overlay-id"
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-close]');
    if (btn) cov(btn.dataset.close);
  });
}
