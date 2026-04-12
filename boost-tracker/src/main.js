import './styles.css';
import { initAuth, loginWithDiscord, logout } from './auth/auth.js';
import { initRouter, initLadderTabs, registerPage, go, restorePage } from './ui/router.js';
import { initModals } from './ui/modal.js';
import { renderTracker }  from './pages/tracker.js';
import { renderMembres, openAddM, saveM, updateSpeList } from './pages/membres.js';
import { renderTeams, addTeam }   from './pages/teams.js';
import { renderBlacklist, filterBL, openAddBL, saveBL } from './pages/blacklist.js';
import { renderHist }     from './pages/historique.js';
import { renderLadder, renderLadderSession, renderLadderAlltime, renderSmizzLadder } from './pages/ladder.js';
import { loadUsers }      from './pages/users.js';
import { openAddRun, saveRun, addCleInput } from './pages/runs-modal.js';
import { openReset, doReset } from './pages/reset.js';
import { initSmizz }      from './smizz/smizz.js';
import { initRealtime }   from './lib/realtime.js';
import { debounce }       from './lib/utils.js';
import { renderCles }     from './pages/cles.js';

// ── Enregistrement des pages ───────────────────────────────────────────────────

registerPage('tracker',    renderTracker);
registerPage('membres',    renderMembres);
registerPage('teams',      renderTeams);
registerPage('cles',       renderCles);
registerPage('historique', renderHist);
registerPage('blacklist',  renderBlacklist);
registerPage('ladder',     renderLadder);
registerPage('users',      loadUsers);

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initModals();
  initRouter();
  initLadderTabs(renderLadderSession, renderLadderAlltime, renderSmizzLadder);
  wireButtons();
  initAuth();   // dispatch 'app:ready' une fois authentifié
});

// Guard contre le double-fire de app:ready (onAuthStateChange + getSession)
let _appReady = false;

document.addEventListener('app:ready', () => {
  if (_appReady) return;
  _appReady = true;

  restorePage('tracker'); // reprend la page du hash URL, sinon tracker
  initSmizz();

  // Realtime — toutes les tables surveillées
  initRealtime({
    tracker:       renderTracker,
    ladderSession: renderLadderSession,
    ladderAlltime: renderLadderAlltime,
    membres:       renderMembres,
    cles:          renderCles,
    teams:         renderTeams,
    blacklist:     renderBlacklist,
    smizz:         renderSmizzLadder,
  });
});

// ── Wiring des boutons (remplace les onclick="..." inline) ────────────────────

function wireButtons() {
  // Tracker
  on('btn-add-run',    () => openAddRun());
  on('btn-open-reset', () => openReset());

  // Modal Run
  on('btn-save-run',   () => saveRun());
  on('btn-add-cle',    () => addCleInput());

  // Modal Reset
  on('btn-do-reset', () => doReset());

  // Membres
  on('btn-add-membre',  () => openAddM());
  on('btn-save-membre', () => saveM());
  document.getElementById('ms')?.addEventListener('change', updateSpeList);

  // Teams
  on('btn-add-team', () => addTeam());

  // Blacklist — debounce 250ms sur la recherche (client-side)
  on('btn-add-bl',  () => openAddBL());
  on('btn-save-bl', () => saveBL());
  document.getElementById('bl-search')
    ?.addEventListener('input', debounce(e => filterBL(e.target.value), 250));

  // Smizz modal — fermer au clic
  document.getElementById('smizz-modal')
    ?.addEventListener('click', e => { e.currentTarget.style.display = 'none'; });

  // Auth
  on('btn-discord-login', () => loginWithDiscord());
  on('btn-logout',        () => logout());
}

function on(id, fn) {
  document.getElementById(id)?.addEventListener('click', fn);
}
