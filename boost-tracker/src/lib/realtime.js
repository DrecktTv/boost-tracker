import { supabase } from './supabase.js';
import { refreshCoverage } from '../ui/coverage.js';

let _initialized = false;

/** Renvoie true si la page `name` est actuellement visible */
function isActive(page) {
  return document.getElementById('page-' + page)?.classList.contains('active') ?? false;
}

/**
 * Initialise tous les canaux Supabase Realtime.
 * Ne s'exécute qu'une seule fois (guard _initialized).
 * Les callbacks ne se déclenchent que si la page concernée est active.
 */
export function initRealtime({ tracker, ladderSession, ladderAlltime, membres, cles, teams, blacklist, smizz, whack }) {
  if (_initialized) return;
  _initialized = true;

  // Runs → Tracker + Ladder session
  supabase.channel('rt-runs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' }, () => {
      if (isActive('tracker')) tracker?.();
      if (isActive('ladder'))  ladderSession?.();
    })
    .subscribe();

  // Alltime → Ladder alltime
  supabase.channel('rt-alltime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alltime' }, () => {
      if (isActive('ladder')) ladderAlltime?.();
    })
    .subscribe();

  // Membres + Clés (même table)
  supabase.channel('rt-membres')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'membres' }, () => {
      if (isActive('membres')) membres?.();
      if (isActive('cles'))    cles?.();
      refreshCoverage(); // sidebar widget — toujours actif
    })
    .subscribe();

  // Teams + slots
  supabase.channel('rt-teams')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
      if (isActive('teams')) teams?.();
    })
    .subscribe();

  supabase.channel('rt-team-slots')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_slots' }, () => {
      if (isActive('teams')) teams?.();
    })
    .subscribe();

  // Blacklist
  supabase.channel('rt-blacklist')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'blacklist' }, () => {
      if (isActive('blacklist')) blacklist?.();
    })
    .subscribe();

  // Smizz catches → Ladder smizz + whack
  supabase.channel('rt-smizz')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'smizz_catches' }, () => {
      if (isActive('ladder')) { smizz?.(); whack?.(); }
    })
    .subscribe();
}
