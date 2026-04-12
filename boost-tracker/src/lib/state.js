/**
 * Store pub/sub minimaliste.
 * Remplace les variables globales : currentUser, currentRole, DB.*
 *
 * Aucun module ne déclare ses propres globales — tout passe par getState/setState.
 */

const _state = {
  currentUser:  null,   // Supabase User object
  currentRole:  null,   // 'admin' | 'member' | 'viewer' | null
  membres:      [],     // Cache post-fetch (invalidé après chaque mutation)
  teams:        [],     // Cache post-fetch
};

const _listeners = {};

export function getState(key) {
  return _state[key];
}

export function setState(key, value) {
  _state[key] = value;
  (_listeners[key] || []).forEach(fn => fn(value));
}

/** S'abonner à un changement d'état. Retourne la fonction de désabonnement. */
export function subscribe(key, fn) {
  if (!_listeners[key]) _listeners[key] = [];
  _listeners[key].push(fn);
  return () => { _listeners[key] = _listeners[key].filter(f => f !== fn); };
}

// ── Helpers sémantiques (remplacent need(), currentRole, currentUser) ──

export const getUser  = () => _state.currentUser;
export const getRole  = () => _state.currentRole;
export const isAdmin  = () => _state.currentRole === 'admin';
export const isMember = () => ['admin', 'member'].includes(_state.currentRole);
