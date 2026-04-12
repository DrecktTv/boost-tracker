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
    x  = fromLeft ? -90 : window.innerWidth + 10;
    vx = fromLeft ? 2.8 : -2.8;
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
    caught  = true;
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

  // Premier test rapide : 10-20s
  setTimeout(appear, (10 + Math.random() * 10) * 1000);

  // Attacher le click handler
  wrap.addEventListener('click', catchSmizz);
}
