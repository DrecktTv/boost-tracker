import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g, setLoading } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { isMember } from '../lib/state.js';
import { roleImg, speColor } from '../ui/components.js';
import { CLE_OPTIONS } from '../constants.js';

const ROLE_ORDER = { 'TANK': 0, 'Heal': 1, 'DPS.C': 2, 'DPS.D': 3 };

function niveauColor(n) {
  if (!n || n < 2) return 'var(--text3)';
  if (n >= 15) return 'var(--gold2)';
  if (n >= 12) return 'var(--blue2)';
  if (n >= 10) return 'var(--green)';
  return 'var(--text2)';
}

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function renderCles() {
  if (!isMember()) return;
  setLoading('cles-grid');

  const membres = await safeQuery('renderCles',
    supabase.from('membres').select('*').order('nom')
  );
  if (membres === null) return;

  const grid = g('cles-grid');
  g('cles-count').textContent = membres.length + ' membre' + (membres.length > 1 ? 's' : '');

  if (!membres.length) {
    grid.innerHTML = '<div class="empty"><div class="empty-icon">🗝️</div><p>Aucun membre — ajoute des membres d\'abord</p></div>';
    return;
  }

  // Tri : Tank → Heal → DPS
  const sorted = [...membres].sort((a, b) =>
    (ROLE_ORDER[a.spe] ?? 9) - (ROLE_ORDER[b.spe] ?? 9)
  );

  grid.innerHTML = sorted.map(m => {
    const color   = speColor(m.classe || '');
    const roleKey = m.spe?.startsWith('DPS') ? 'DPS' : (m.spe || 'DPS');
    const donjon  = m.cle_donjon || '';
    const niveau  = m.cle_niveau || '';
    const nc      = niveauColor(niveau);

    const options = CLE_OPTIONS.map(c =>
      `<option value="${escHtml(c)}"${donjon === c ? ' selected' : ''}>${escHtml(c)}</option>`
    ).join('');

    return `<div class="cle-card" data-id="${escHtml(m.id)}">
      <div class="cle-card-head">
        ${roleImg(roleKey, 20)}
        <span style="background:${color};width:7px;height:7px;border-radius:50%;flex-shrink:0"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(m.nom)}</div>
          ${m.classe ? `<div style="font-size:11px;color:var(--text3)">${escHtml(m.classe.split(' ')[0])}</div>` : ''}
        </div>
        <span class="cle-niveau-badge" style="font-size:18px;font-weight:700;color:${nc};flex-shrink:0;min-width:36px;text-align:right">
          ${niveau ? '+' + niveau : '—'}
        </span>
      </div>
      <div class="cle-card-inputs">
        <select class="cle-donjon slot-inp" data-id="${escHtml(m.id)}">
          <option value="">— Donjon —</option>
          ${options}
        </select>
        <input
          type="number"
          class="cle-niveau-inp"
          data-id="${escHtml(m.id)}"
          value="${escHtml(String(niveau))}"
          placeholder="Niv."
          min="1" max="30"
        />
      </div>
    </div>`;
  }).join('');

  // Sauvegarde auto — event delegation
  grid.onchange = e => {
    const target = e.target.closest('.cle-donjon, .cle-niveau-inp');
    if (target) saveCle(target.dataset.id);
  };
}

// ── Sauvegarde ─────────────────────────────────────────────────────────────────

async function saveCle(membreId) {
  const card = document.querySelector(`.cle-card[data-id="${membreId}"]`);
  if (!card) return;

  const donjon = card.querySelector('.cle-donjon').value || null;
  const niveau = parseInt(card.querySelector('.cle-niveau-inp').value) || null;

  const data = await safeQuery('saveCle',
    supabase.from('membres').update({ cle_donjon: donjon, cle_niveau: niveau }).eq('id', membreId)
  );
  if (data === null) return;

  // Mise à jour du badge inline sans re-render complet
  const badge = card.querySelector('.cle-niveau-badge');
  if (badge) {
    badge.textContent = niveau ? '+' + niveau : '—';
    badge.style.color = niveauColor(niveau);
  }

  toast('🗝️ Clé mise à jour');
}
