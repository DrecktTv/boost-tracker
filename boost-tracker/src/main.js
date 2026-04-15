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
import { openAddRun, openAddRunSolo, saveRun, addCleInput, addParticipantInput } from './pages/runs-modal.js';
import { openReset, doReset } from './pages/reset.js';
import { initSmizz }      from './smizz/smizz.js';
import { initRealtime }   from './lib/realtime.js';
import { debounce }       from './lib/utils.js';
import { renderCles }     from './pages/cles.js';
import { initCoverage } from './ui/coverage.js';
import { initSession, renderSignWidget }  from './ui/session.js';
import { initWclImport, openWclImport } from './pages/wcl-import.js';

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

function initWednesdayBanner() {
  const banner = document.getElementById('wednesday-banner');
  if (!banner) return;
  const now = new Date();
  if (now.getDay() !== 3 || now.getHours() < 5) return;

  banner.style.display = 'flex';
  banner.innerHTML = `
    <span class="wb-icon">🔑</span>
    <div class="wb-text">
      <div class="wb-title">Mettez à jour votre clé &amp; vos tradables !</div>
      <div class="wb-sub">C'est mercredi — pensez à mettre à jour votre keystone et vos slots tradables dans l'onglet Membres.</div>
    </div>
    <button class="wb-close" id="wb-close-btn" title="Fermer">✕</button>`;

  document.getElementById('wb-close-btn')?.addEventListener('click', () => {
    banner.style.display = 'none';
  });
}

document.addEventListener('app:ready', () => {
  if (_appReady) return;
  _appReady = true;

  restorePage('tracker');
  initWednesdayBanner(); // reprend la page du hash URL, sinon tracker
  initSmizz();
  initCoverage();
  initSession();
  document.addEventListener('coverage:changed', renderSignWidget);
  initWclImport();

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
  on('btn-wcl-import',   () => openWclImport());
  on('btn-add-run',      () => openAddRun());
  on('btn-add-run-solo', () => openAddRunSolo());
  on('btn-open-reset', () => openReset());

  // Modal Run
  on('btn-save-run',   () => saveRun());
  on('btn-add-cle',         () => addCleInput());
  on('btn-add-participant', () => addParticipantInput());

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
