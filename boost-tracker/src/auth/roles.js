import { getRole } from '../lib/state.js';

/**
 * Applique les restrictions visuelles selon le rôle.
 *
 * admin  → affiche les éléments .admin-only
 * member → masque les boutons de suppression (.btn-danger)
 * viewer → ne voit QUE le Ladder (tous les autres onglets masqués)
 */
export function applyRoleRestrictions(role) {
  if (role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
  }

  if (role === 'member') {
    document.querySelectorAll('.btn-danger').forEach(btn => btn.style.display = 'none');
  }

  if (role === 'viewer') {
    // Masquer TOUS les onglets sauf le Ladder
    ['tracker', 'membres', 'teams', 'cles', 'historique', 'blacklist', 'users'].forEach(p => {
      const tab = document.querySelector(`[data-p="${p}"]`);
      if (tab) tab.style.display = 'none';
    });
    // Masquer tous les boutons d'action
    document.querySelectorAll('.btn-primary, .btn-danger, .btn-gold, .btn-ghost').forEach(btn => {
      if (!btn.id?.includes('discord') && !btn.id?.includes('logout')) {
        btn.style.display = 'none';
      }
    });
  }
}
