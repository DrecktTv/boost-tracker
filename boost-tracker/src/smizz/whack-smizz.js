// ── Whack-a-Smizz — easter egg ─────────────────────────────────────────────────

const HOLES         = 9;
const GAME_SECS     = 30;
const MIN_SHOW_MS   = 550;
const MAX_SHOW_MS   = 1100;

let _score    = 0;
let _misses   = 0;
let _timeLeft = GAME_SECS;
let _active   = null;   // hole idx currently up
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
// Ctrl+Shift+W → force le jeu (bypass proba + cooldown)
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
  const overlay = document.createElement('div');
  overlay.id    = 'whack-overlay';
  overlay.innerHTML = buildModalHtml();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('whack-show'));
  startRound(overlay);
}

function buildModalHtml() {
  const holes = Array.from({ length: HOLES }, (_, i) => `
    <div class="wh-hole" data-idx="${i}">
      <div class="wh-tube">
        <div class="wh-smizz" data-idx="${i}">🐗</div>
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
  }, 250 + Math.random() * 450);
}

function popUp(overlay, idx) {
  _active = idx;
  overlay.querySelector(`.wh-hole[data-idx="${idx}"]`)?.classList.add('wh-up');

  const dur = MIN_SHOW_MS + Math.random() * (MAX_SHOW_MS - MIN_SHOW_MS);
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
    const tEl  = overlay.querySelector('#wh-time');
    const bar  = overlay.querySelector('#wh-bar');
    if (tEl) tEl.textContent = _timeLeft;
    if (bar) bar.style.width = `${(_timeLeft / GAME_SECS) * 100}%`;
    if (_timeLeft <= 5) bar?.classList.add('wh-bar-red');
    if (_timeLeft <= 0) endGame(overlay);
  }, 1000);
}

// ── End screen ─────────────────────────────────────────────────────────────────

function endGame(overlay) {
  clearAll();
  const modal = overlay.querySelector('.wh-modal');
  if (!modal) return;

  const stars = _score >= 20 ? '★★★' : _score >= 12 ? '★★☆' : _score >= 6 ? '★☆☆' : '☆☆☆';
  const msg   = _score >= 20 ? 'Légendaire — le Smizz te craint.'
              : _score >= 12 ? 'Expert — bon boulot !'
              : _score >= 6  ? 'Pas mal, continue l\'entraînement.'
              : 'Le Smizz a gagné cette fois…';

  modal.innerHTML = `
    <div class="wh-end">
      <div class="wh-end-smizz">🐗</div>
      <div class="wh-end-stars">${stars}</div>
      <div class="wh-end-score">${_score}</div>
      <div class="wh-end-lbl">Smizz tapés en ${GAME_SECS}s</div>
      <div class="wh-end-msg">${msg}</div>
      <div class="wh-end-btns">
        <button class="btn btn-primary" id="wh-retry">Rejouer</button>
        <button class="btn btn-ghost"   id="wh-quit">Fermer</button>
      </div>
    </div>`;

  modal.querySelector('#wh-retry')?.addEventListener('click', () => {
    modal.innerHTML = buildModalHtml().replace(/^<div class="wh-modal">/, '');
    modal.outerHTML; // force reparse — simpler: just rebuild
    overlay.innerHTML = buildModalHtml();
    startRound(overlay);
  });
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
