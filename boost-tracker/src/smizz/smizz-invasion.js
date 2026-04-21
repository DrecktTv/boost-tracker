// ── Smizz Invasion — easter egg ultra rare ────────────────────────────────────
import { supabase } from '../lib/supabase.js';
import { getUser }  from '../lib/state.js';
import { toast }    from '../ui/toast.js';

const ROLL_CHANCE  = 0.01;              // 1% à chaque apparition du Smizz classique
const COOLDOWN_MS  = 4 * 3600_000;      // 4h entre deux invasions
const SMIZZ_COUNT  = 25;                // ~25 Smizz, de partout
const DURATION_MS  = 30_000;            // 30s d'invasion

const SMIZZ_SVG = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;pointer-events:none">
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
  <text x="64" y="44" font-size="9" font-family="Arial Black" font-weight="900" fill="#7a4400" text-anchor="middle">$</text>
  <line x1="40" y1="46" x2="28" y2="64" stroke="#1a1a2e" stroke-width="4.5" stroke-linecap="round"/>
  <ellipse cx="25" cy="67" rx="6" ry="3" fill="#111"/>
  <line x1="40" y1="46" x2="52" y2="62" stroke="#2a2a4e" stroke-width="4.5" stroke-linecap="round"/>
  <ellipse cx="55" cy="65" rx="5" ry="2.5" fill="#222"/>
</svg>`;

let _active = false;

// ── Trigger ────────────────────────────────────────────────────────────────────
// Appelé par smizz.js à chaque apparition du Smizz classique.
// 1% de chance → invasion (avec cooldown 4h entre deux).

export function maybeTriggerInvasion() {
  if (_active) return false;
  if (document.hidden) return false;
  if (document.getElementById('whack-overlay')) return false;
  const last = localStorage.getItem('invasion_last');
  if (last && Date.now() - +last < COOLDOWN_MS) return false;
  if (Math.random() > ROLL_CHANCE) return false;
  localStorage.setItem('invasion_last', String(Date.now()));
  startInvasion();
  return true;
}

// Dev helpers : Ctrl+Alt+I (bypass cooldown), window.__invasion() en dev
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.altKey && e.key === 'i') {
    localStorage.removeItem('invasion_last');
    if (!_active) startInvasion();
  }
});
if (import.meta.env.DEV) {
  window.__invasion = () => { localStorage.removeItem('invasion_last'); if (!_active) startInvasion(); };
}

// ── Invasion ──────────────────────────────────────────────────────────────────

// Position souris globale (partagée par tous les sprites)
let _mouseX = -9999, _mouseY = -9999;

function startInvasion() {
  if (_active) return;
  _active = true;

  const container = document.createElement('div');
  container.id = 'smizz-invasion';
  document.body.appendChild(container);

  // Track mouse pour évitement
  const onMove = e => { _mouseX = e.clientX; _mouseY = e.clientY; };
  window.addEventListener('mousemove', onMove);

  // Banner "Invasion !"
  const banner = document.createElement('div');
  banner.className = 'inv-banner';
  banner.innerHTML = `
    <span class="inv-b-icon">⚠</span>
    <div class="inv-b-text">
      <div class="inv-b-title">Invasion de Smizz !</div>
      <div class="inv-b-sub" id="inv-counter">0 / ${SMIZZ_COUNT} attrapés</div>
    </div>`;
  container.appendChild(banner);

  let caught = 0;
  const updateCounter = () => {
    const el = document.getElementById('inv-counter');
    if (el) el.textContent = `${caught} / ${SMIZZ_COUNT} attrapés`;
  };

  for (let i = 0; i < SMIZZ_COUNT; i++) {
    spawnSmizz(container, () => { caught++; updateCounter(); });
  }

  // Fin d'invasion
  setTimeout(() => {
    container.querySelectorAll('.inv-smizz').forEach(el => el.classList.add('inv-flee'));
    banner.classList.add('inv-banner-fade');
    setTimeout(() => {
      container.remove();
      window.removeEventListener('mousemove', onMove);
      _active = false;
      if (caught >= SMIZZ_COUNT) toast(`🏆 Tous les Smizz attrapés !`, 'ok');
      else if (caught > 0)       toast(`${caught}/${SMIZZ_COUNT} Smizz attrapés`);
    }, 900);
  }, DURATION_MS);
}

function spawnSmizz(container, onCatch) {
  const el = document.createElement('div');
  el.className = 'inv-smizz';
  el.innerHTML = SMIZZ_SVG;

  const size = 36 + Math.random() * 32; // 36-68px (plus petits = plus dur à cliquer)
  const W = window.innerWidth, H = window.innerHeight;
  let x  = Math.random() * (W - size);
  let y  = Math.random() * (H - size);

  // Vitesses de base plus rapides (±1.5 à ±5)
  const rSpd = () => (1.2 + Math.random() * 3.5) * (Math.random() < 0.5 ? -1 : 1);
  let vx = rSpd(), vy = rSpd();

  const EVASION_RADIUS = 110;  // détection du curseur
  const EVASION_FORCE  = 0.8;  // push appliqué par frame quand proche
  const MAX_SPEED      = 9;
  const FRICTION       = 0.985;

  el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;cursor:pointer;pointer-events:auto;transition:opacity .15s`;
  container.appendChild(el);

  let alive = true, caught = false;

  function tick() {
    if (!alive) return;

    // 1. Évitement du curseur
    const cx = x + size / 2, cy = y + size / 2;
    const dx = cx - _mouseX, dy = cy - _mouseY;
    const dist = Math.hypot(dx, dy);
    if (dist < EVASION_RADIUS && dist > 0) {
      const intensity = (EVASION_RADIUS - dist) / EVASION_RADIUS; // 0..1
      vx += (dx / dist) * EVASION_FORCE * intensity * 2;
      vy += (dy / dist) * EVASION_FORCE * intensity * 2;
    }

    // 2. Bursts aléatoires (jinks imprévisibles ~2% par frame)
    if (Math.random() < 0.02) {
      vx += (Math.random() - 0.5) * 5;
      vy += (Math.random() - 0.5) * 5;
    }

    // 3. Friction + clamp vitesse max
    vx *= FRICTION; vy *= FRICTION;
    const spd = Math.hypot(vx, vy);
    if (spd > MAX_SPEED) { vx = (vx / spd) * MAX_SPEED; vy = (vy / spd) * MAX_SPEED; }
    // Vitesse minimum pour ne jamais s'arrêter
    if (spd < 1) { vx = rSpd() * 0.5; vy = rSpd() * 0.5; }

    x += vx; y += vy;

    // Rebonds sur les bords
    if (x < 0)         { x = 0;         vx = -vx; }
    if (x > W - size)  { x = W - size;  vx = -vx; }
    if (y < 0)         { y = 0;         vy = -vy; }
    if (y > H - size)  { y = H - size;  vy = -vy; }

    el.style.transform = vx < 0 ? 'scaleX(-1)' : 'scaleX(1)';
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Petite chance de téléporter quand survolé (avant le click) → feinte
  el.addEventListener('mouseenter', () => {
    if (!alive || caught) return;
    if (Math.random() < 0.35) {
      x = Math.random() * (W - size);
      y = Math.random() * (H - size);
      vx = rSpd() * 1.3; vy = rSpd() * 1.3;
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
      el.classList.add('inv-teleport');
      setTimeout(() => el.classList.remove('inv-teleport'), 300);
    }
  });

  el.addEventListener('click', async () => {
    if (caught) return;
    caught = true; alive = false;
    el.classList.add('inv-caught');
    setTimeout(() => el.remove(), 400);

    onCatch?.();
    const user = getUser();
    if (user) {
      supabase.from('smizz_catches').insert([{
        date:        new Date().toISOString(),
        caught_by:   user.id,
      }]).then(() => {});
    }
  });
}
