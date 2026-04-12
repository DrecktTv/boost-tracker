import { g } from '../lib/utils.js';

let _tt;

/**
 * Affiche une notification toast pendant 2.6s.
 * @param {string} msg  - Message à afficher
 * @param {'ok'|'err'} type - Style du toast
 */
export function toast(msg, type = 'ok') {
  const el = g('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(_tt);
  _tt = setTimeout(() => { el.className = 'toast'; }, 2600);
}
