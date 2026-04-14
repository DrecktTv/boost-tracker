import { supabase } from '../lib/supabase.js';
import { getUser } from '../lib/state.js';
import { renderSmizzLadder } from '../pages/ladder.js';

// ── Easter egg : Le Smizz ─────────────────────────────────────────────────────
// Personnage stickman animé qui traverse l'écran.
// Cliquer dessus l'attrape et incrémente smizz_catches dans Supabase.

export function initSmizz() {
  const wrap = document.getElementById('smizz-wrap');
  if (!wrap) return;

  let x = -90, vx = 2.8, visible = false, running = false, caught = false;

  function scheduleAppear() {
    const delay = (20 + Math.random() * 40) * 1000;
    setTimeout(appear, delay);
  }

  function appear() {
    if (caught) return;
    const fromLeft = Math.random() > 0.5;
    x = fromLeft ? -90 : window.innerWidth + 10;

    // 10% de chance de passage éclair
    const speed = Math.random() < 0.10
      ? 7 + Math.random() * 3        // 7–10 px/frame
      : 2.0 + Math.random() * 3.5;   // 2–5.5 px/frame
    vx = fromLeft ? speed : -speed;
    wrap.style.left      = x + 'px';
    wrap.style.transform = fromLeft ? 'scaleX(1)' : 'scaleX(-1)';
    wrap.style.display   = 'block';
    visible = true;
    running = true;
    run();
  }

  function run() {
    if (!running || caught) return;
    x += vx;
    wrap.style.left = x + 'px';
    if (x > window.innerWidth + 100 || x < -100) {
      hide();
      scheduleAppear();
      return;
    }
    requestAnimationFrame(run);
  }

  function hide() {
    running = false;
    visible = false;
    wrap.style.display = 'none';
  }

  async function catchSmizz() {
    if (!visible) return;
    running = false;

    // 5% de chance que le Smizz se barre en disant "Cheh"
    if (Math.random() < 0.05) {
      cheh();
      return;
    }

    caught = true;
    wrap.style.display = 'none';

    // Incrémenter dans Supabase
    await supabase.from('smizz_catches').insert([{
      date:       new Date().toISOString(),
      caught_by:  getUser()?.id || null,
    }]);

    // Rafraîchir le ladder smizz si la vue est active
    const lv = document.getElementById('lv-smizz');
    if (lv?.classList.contains('active')) {
      await renderSmizzLadder();
    }

    // Afficher le modal catch
    const modal = document.getElementById('smizz-modal');
    if (modal) modal.style.display = 'flex';

    // Réapparaitre après 3 min
    setTimeout(() => { caught = false; scheduleAppear(); }, 180000);
  }

  function cheh() {
    // Afficher "Cheh !" au-dessus du Smizz puis s'enfuir en accélérant
    const chehEl = document.createElement('div');
    chehEl.textContent = 'Cheh !';
    chehEl.style.cssText = `
      position:fixed;
      top:${wrap.getBoundingClientRect().top - 36}px;
      left:${wrap.getBoundingClientRect().left}px;
      font-family:Cinzel,serif;font-size:22px;font-weight:900;
      color:#e8d44d;text-shadow:0 0 8px #e8d44d88;
      pointer-events:none;z-index:9999;
      animation:smizz-cheh .8s ease-out forwards;
    `;
    document.body.appendChild(chehEl);
    setTimeout(() => chehEl.remove(), 900);

    // Le Smizz accélère et se barre
    vx = vx > 0 ? 9 : -9;
    running = true;
    run();
  }

  // Premier test rapide : 10-20s
  setTimeout(appear, (10 + Math.random() * 10) * 1000);

  // Attacher le click handler
  wrap.addEventListener('click', catchSmizz);
}
