/**
 * Échappement HTML — protège contre les injections XSS
 * Toutes les données saisies par l'utilisateur passent ici avant d'être
 * injectées dans un template string utilisé en innerHTML.
 */
export function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Génère un ID unique (format court, compatible URL) */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Formate un nombre en gold français (ex: 1 250 000) */
export function gold(n) {
  return n ? Number(n).toLocaleString('fr-FR') : '0';
}

/** Formate une date ISO en locale française */
export function formatDate(iso, opts = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', opts);
}

/** Raccourci getElementById */
export function g(id) {
  return document.getElementById(id);
}

/** Debounce — évite les appels trop fréquents (ex: recherche) */
export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/**
 * Affiche un skeleton de chargement dans un conteneur.
 * Remplacé automatiquement quand le vrai contenu arrive.
 */
export function setLoading(id, rows = 3) {
  const el = g(id);
  if (!el) return;
  el.innerHTML = `<div class="sk-wrap">${'<div class="sk-row"></div>'.repeat(rows)}</div>`;
}
