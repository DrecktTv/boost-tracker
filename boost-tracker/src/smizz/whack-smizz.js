// ── Whack-a-Smizz — easter egg ─────────────────────────────────────────────────
import { supabase } from '../lib/supabase.js';
import { getUser }  from '../lib/state.js';

const HOLES     = 9;
const GAME_SECS = 30;

// Durée d'affichage : démarre court, devient brutal en fin de partie
function showDur(timeLeft) {
  const progress = 1 - timeLeft / GAME_SECS;          // 0 → 1
  const base     = 620 - progress * 370;               // 620ms → 250ms
  const rng      = Math.random();
  // 20% chance éclair (dangereux), 10% chance long (faux espoir)
  if (rng < 0.20) return base * 0.40 + Math.random() * 60;   // ~80-310ms
  if (rng < 0.30) return base * 1.6  + Math.random() * 100;  // ~500-1100ms
  return base * (0.8 + Math.random() * 0.4);
}

// Délai entre deux apparitions : rapide dès le début, frénétique à la fin
function spawnDelay(timeLeft) {
  const progress = 1 - timeLeft / GAME_SECS;
  return 260 - progress * 160 + Math.random() * 200;  // 260-460ms → 100-300ms
}

const SMIZZ_SVG = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <ellipse cx="40" cy="77" rx="18" ry="4" fill="rgba(0,0,0,0.25)"/>
  <circle cx="40" cy="14" r="10" fill="#e8c87a" stroke="#c8a050" stroke-width="1"/>
  <path d="M30 12 Q40 2 50 12 L50 18 Q40 14 30 18 Z" fill="#1a1a2e"/>
  <rect x="30" y="14" width="6" height="10" fill="#1a1a2e"/>
  <rect x="44" y="14" width="6" height="10" fill="#1a1a2e"/>
  <rect x="32" y="15" width="16" height="5" rx="2" fill="#111" opacity="0.85"/>
  <ellipse cx="36" cy="17" rx="2" ry="1.5" fill="white" opacity="0.9"/>
  <ellipse cx="44" cy="17" rx="2" ry="1.5" fill="white" opacity="0.9"/>
  <path d="M36 21 Q40 24 44 21" stroke="#c8a050" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <line x1="40" y1="24" x2="40" y2="46" stroke="#1a1a2e" stroke-width="5" stroke-linecap="round"/>
  <path d="M36 26 Q28 36 30 46 L36 42 Z" fill="#2a2a4e" opacity="0.8"/>
  <line x1="40" y1="32" x2="22" y2="42" stroke="#1a1a2e" stroke-width="4" stroke-linecap="round"/>
  <circle cx="21" cy="43" r="3.5" fill="#e8c87a"/>
  <line x1="40" y1="32" x2="56" y2="28" stroke="#1a1a2e" stroke-width="4" stroke-linecap="round"/>
  <line x1="57" y1="28" x2="62" y2="35" stroke="#c07800" stroke-width="2"/>
  <circle cx="64" cy="40" r="9" fill="#d49000"/>
  <circle cx="64" cy="40" r="7" fill="#f0b800"/>
  <circle cx="62" cy="38" r="3" fill="#ffe060" opacity="0.6"/>
  <text x="64" y="44" font-size="9" font-family="Arial Black" font-weight="900" fill="#7a4400" text-anchor="middle">$</text>
  <ellipse cx="64" cy="31" rx="4" ry="2.5" fill="#c07800"/>
  <line x1="40" y1="46" x2="28" y2="64" stroke="#1a1a2e" stroke-width="4.5" stroke-linecap="round"/>
  <ellipse cx="25" cy="67" rx="6" ry="3" fill="#111"/>
  <line x1="40" y1="46" x2="52" y2="62" stroke="#2a2a4e" stroke-width="4.5" stroke-linecap="round"/>
  <ellipse cx="55" cy="65" rx="5" ry="2.5" fill="#222"/>
</svg>`;

let _score    = 0;
let _misses   = 0;
let _timeLeft = GAME_SECS;
let _active   = null;
let _timerInt = null;
let _spawnTO  = null;
let _hideTO   = null;

// ── Trigger ────────────────────────────────────────────────────────────────────

export function maybeShowWhackSmizz() {
  if (Math.random() > 0.03) return;          // 3% de chance
  const last = localStorage.getItem('whack_last');
  if (last && Date.now() - +last < 4 * 3600_000) return; // max 1x / 4h
  localStorage.setItem('whack_last', String(Date.now()));
  setTimeout(showGame, 1800);
}

// ── Dev helpers ────────────────────────────────────────────────────────────────
// Ctrl+Alt+W → force le jeu (bypass proba + cooldown)
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.altKey && e.key === 'w') {
    localStorage.removeItem('whack_last');
    showGame();
  }
});

// Exposé en console : window.__whack() pour tester sans clavier
if (import.meta.env.DEV) {
  window.__whack = () => { localStorage.removeItem('whack_last'); showGame(); };
}

// ── Game ───────────────────────────────────────────────────────────────────────

function showGame() {
  if (document.getElementById('whack-overlay')) return; // déjà ouvert
  const overlay = document.createElement('div');
  overlay.id    = 'whack-overlay';
  overlay.innerHTML = buildIntroHtml();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('whack-show'));

  overlay.querySelector('#wh-start')
    ?.addEventListener('click', () => {
      overlay.innerHTML = buildModalHtml();
      startRound(overlay);
    });
  overlay.querySelector('#wh-intro-close')
    ?.addEventListener('click', () => closeGame(overlay));
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeGame(overlay);
  });
}

function buildIntroHtml() {
  return `
    <div class="wh-modal wh-intro">
      <button class="wh-close" id="wh-intro-close">✕</button>
      <div class="wh-intro-smizz">${SMIZZ_SVG}</div>
      <div class="wh-title">⚡ Tu as été sélectionné !</div>
      <div class="wh-intro-rules">
        <div class="wh-rule">🖱️ Clique sur le Smizz avant qu'il disparaisse</div>
        <div class="wh-rule">⏱️ ${GAME_SECS} secondes — fais le meilleur score</div>
        <div class="wh-rule">⚡ Il accélère au fil du temps</div>
        <div class="wh-rule">👻 Attention aux fausses fenêtres !</div>
      </div>
      <button class="btn btn-primary wh-start-btn" id="wh-start">Commencer</button>
    </div>`;
}

function buildModalHtml() {
  const holes = Array.from({ length: HOLES }, (_, i) => `
    <div class="wh-hole" data-idx="${i}">
      <div class="wh-tube">
        <div class="wh-smizz" data-idx="${i}">${SMIZZ_SVG}</div>
      </div>
      <div class="wh-dirt"></div>
    </div>`).join('');

  return `
    <div class="wh-modal">
      <button class="wh-close" id="wh-close">✕</button>
      <div class="wh-head">
        <div class="wh-title">⚡ Tu as été sélectionné !</div>
        <div class="wh-sub">Tape le Smizz avant qu'il disparaisse dans son trou</div>
      </div>
      <div class="wh-hud">
        <div class="wh-stat"><span class="wh-val" id="wh-score">0</span><span class="wh-lbl">Score</span></div>
        <div class="wh-timer-wrap">
          <div class="wh-timer-track"><div class="wh-timer-bar" id="wh-bar"></div></div>
          <span class="wh-timer-num" id="wh-time">30</span>
        </div>
        <div class="wh-stat"><span class="wh-val" id="wh-misses">0</span><span class="wh-lbl">Ratés</span></div>
      </div>
      <div class="wh-grid">${holes}</div>
    </div>`;
}

function startRound(overlay) {
  _score = 0; _misses = 0; _timeLeft = GAME_SECS; _active = null;
  clearAll();

  overlay.querySelector('#wh-close')
    ?.addEventListener('click', () => closeGame(overlay));

  overlay.querySelectorAll('.wh-smizz').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (+el.dataset.idx !== _active) return;
      onHit(overlay, +el.dataset.idx);
    });
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeGame(overlay);
  });

  startTimer(overlay);
  scheduleNext(overlay);
}

// ── Core loop ──────────────────────────────────────────────────────────────────

function scheduleNext(overlay) {
  if (!overlay.isConnected) return;
  clearTimeout(_spawnTO);
  _spawnTO = setTimeout(() => {
    if (!overlay.isConnected) return;
    let idx;
    do { idx = Math.floor(Math.random() * HOLES); } while (idx === _active);
    popUp(overlay, idx);
  }, spawnDelay(_timeLeft));
}

function popUp(overlay, idx) {
  _active = idx;
  overlay.querySelector(`.wh-hole[data-idx="${idx}"]`)?.classList.add('wh-up');

  const dur = showDur(_timeLeft);
  _hideTO = setTimeout(() => {
    if (_active !== idx) return;
    _misses++;
    const el = overlay.querySelector('#wh-misses');
    if (el) el.textContent = _misses;
    popDown(overlay, idx);
    scheduleNext(overlay);
  }, dur);
}

function popDown(overlay, idx) {
  _active = null;
  overlay.querySelector(`.wh-hole[data-idx="${idx}"]`)?.classList.remove('wh-up');
}

function onHit(overlay, idx) {
  clearTimeout(_hideTO);
  _score++;
  overlay.querySelector('#wh-score').textContent = _score;

  const hole = overlay.querySelector(`.wh-hole[data-idx="${idx}"]`);
  hole?.classList.remove('wh-up');
  hole?.classList.add('wh-hit');
  setTimeout(() => hole?.classList.remove('wh-hit'), 300);

  scheduleNext(overlay);
}

// ── Timer ──────────────────────────────────────────────────────────────────────

function startTimer(overlay) {
  _timeLeft = GAME_SECS;
  _timerInt = setInterval(() => {
    _timeLeft--;
    const tEl = overlay.querySelector('#wh-time');
    const bar = overlay.querySelector('#wh-bar');
    if (tEl) tEl.textContent = _timeLeft;
    if (bar) bar.style.width = `${(_timeLeft / GAME_SECS) * 100}%`;
    if (_timeLeft <= 5) bar?.classList.add('wh-bar-red');
    if (_timeLeft <= 0) endGame(overlay);
  }, 1000);
}

// ── End screen ─────────────────────────────────────────────────────────────────

async function endGame(overlay) {
  clearAll();
  const modal = overlay.querySelector('.wh-modal');
  if (!modal) return;

  // Sauvegarde le score en DB (colonne whack_score)
  const user = getUser();
  if (user && _score > 0) {
    supabase.from('smizz_catches').insert([{
      date:        new Date().toISOString(),
      caught_by:   user.id,
      whack_score: _score,
    }]).then(() => {});  // fire & forget
  }

  const stars = _score >= 20 ? '★★★' : _score >= 12 ? '★★☆' : _score >= 6 ? '★☆☆' : '☆☆☆';
  const msg   = _score >= 20 ? 'Légendaire — le Smizz te craint.'
              : _score >= 12 ? 'Expert — bon boulot !'
              : _score >= 6  ? "Pas mal, continue l'entraînement."
              : 'Le Smizz a gagné cette fois…';

  modal.innerHTML = `
    <div class="wh-end">
      <div class="wh-end-smizz">${SMIZZ_SVG}</div>
      <div class="wh-end-stars">${stars}</div>
      <div class="wh-end-score">${_score}</div>
      <div class="wh-end-lbl">Smizz tapés en ${GAME_SECS}s</div>
      <div class="wh-end-msg">${msg}</div>
      <div class="wh-end-btns">
        <button class="btn btn-ghost" id="wh-quit">Fermer</button>
      </div>
    </div>`;

  modal.querySelector('#wh-quit')?.addEventListener('click', () => closeGame(overlay));
}

function closeGame(overlay) {
  clearAll();
  overlay.classList.remove('whack-show');
  setTimeout(() => overlay.remove(), 300);
}

function clearAll() {
  clearInterval(_timerInt);
  clearTimeout(_spawnTO);
  clearTimeout(_hideTO);
  _timerInt = _spawnTO = _hideTO = null;
}
