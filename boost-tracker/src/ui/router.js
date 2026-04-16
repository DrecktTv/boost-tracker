const _handlers = {};
const VALID_PAGES = ['tracker', 'membres', 'teams', 'cles', 'historique', 'blacklist', 'ladder', 'users'];

/** Enregistre une fonction de rendu pour une page */
export function registerPage(name, renderFn) {
  _handlers[name] = renderFn;
}

/** Navigate vers une page, met à jour le hash URL */
export function go(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.stab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + pageName)?.classList.add('active');
  document.querySelector(`[data-p="${pageName}"]`)?.classList.add('active');
  _handlers[pageName]?.();

  // Mémorise la page dans le hash — survit au refresh
  history.replaceState(null, '', '#' + pageName);
}

/** Restaure la page depuis le hash URL (après refresh ou retour navigateur) */
export function restorePage(fallback = 'tracker') {
  const hash = location.hash.slice(1); // retire le #
  const page = VALID_PAGES.includes(hash) ? hash : fallback;
  go(page);
}

/** Attache les listeners de navigation sur tous les .stab[data-p] */
export function initRouter() {
  document.querySelectorAll('.stab[data-p]').forEach(tab => {
    tab.addEventListener('click', () => go(tab.dataset.p));
  });

  // Gère le bouton Précédent/Suivant du navigateur
  window.addEventListener('popstate', () => {
    const hash = location.hash.slice(1);
    if (VALID_PAGES.includes(hash)) go(hash);
  });
}

/** Attache les listeners sur les onglets ladder */
export function initLadderTabs(renderSession, renderAlltime, renderSmizz, renderWhack) {
  const renders = { session: renderSession, alltime: renderAlltime, smizz: renderSmizz, whack: renderWhack };

  document.querySelectorAll('.ltab').forEach(tab => {
    tab.addEventListener('click', e => {
      document.querySelectorAll('.ltab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ladder-view').forEach(v => v.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const view = e.currentTarget.dataset.view;
      document.getElementById('lv-' + view)?.classList.add('active');
      renders[view]?.();
    });
  });
}
