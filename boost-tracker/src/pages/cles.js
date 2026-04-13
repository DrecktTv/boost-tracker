import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g, setLoading } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { isMember } from '../lib/state.js';
import { roleImg, speColor } from '../ui/components.js';
import { CLE_OPTIONS, DONJONS } from '../constants.js';
import { refreshCoverage } from '../ui/coverage.js';

const ROLE_ORDER = { 'TANK': 0, 'Heal': 1, 'DPS.C': 2, 'DPS.D': 3 };

function niveauColor(n) {
  if (!n || n < 2) return 'var(--text3)';
  if (n >= 15) return 'var(--gold2)';
  if (n >= 12) return 'var(--blue2)';
  if (n >= 10) return 'var(--green)';
  return 'var(--text2)';
}

function cardHTML(m) {
  const color   = speColor(m.classe || '');
  const roleKey = m.spe?.startsWith('DPS') ? 'DPS' : (m.spe || 'DPS');
  const donjon  = m.cle_donjon || '';
  const niveau  = m.cle_niveau || '';
  const nc      = niveauColor(niveau);
  const dInfo   = donjon ? DONJONS[donjon] : null;

  const options = CLE_OPTIONS.map(c =>
    `<option value="${escHtml(c)}"${donjon === c ? ' selected' : ''}>${escHtml(DONJONS[c]?.fr || c)}</option>`
  ).join('');

  const artContent = dInfo
    ? `<img src="${escHtml(dInfo.img)}" alt="${escHtml(dInfo.en)}" loading="lazy">`
    : `<div class="cle-art-placeholder">🗝️</div>`;

  const namesContent = dInfo
    ? `<div class="cle-art-fr">${escHtml(dInfo.fr)}</div><div class="cle-art-en">${escHtml(dInfo.en)}</div>`
    : `<div class="cle-art-fr cle-art-nokey">Pas de clé définie</div>`;

  return `<div class="cle-card" data-id="${escHtml(m.id)}">
    <div class="cle-art">
      ${artContent}
      <div class="cle-art-overlay"></div>
      <span class="cle-art-level" style="color:${nc}">${niveau ? '+' + niveau : '—'}</span>
      <div class="cle-art-names">${namesContent}</div>
    </div>
    <div class="cle-body">
      <div class="cle-member">
        ${roleImg(roleKey, 16)}
        <span class="cle-dot" style="background:${color}"></span>
        <div class="cle-member-info">
          <div class="cle-nom">${escHtml(m.nom)}</div>
          ${m.classe ? `<div class="cle-spe">${escHtml(m.classe.split(' ')[0])}</div>` : ''}
        </div>
      </div>
      <div class="cle-inputs">
        <select class="cle-donjon slot-inp" data-id="${escHtml(m.id)}">
          <option value="">— Donjon —</option>
          ${options}
        </select>
        <input type="number" class="cle-niveau-inp" data-id="${escHtml(m.id)}"
          value="${escHtml(String(niveau))}" placeholder="Niv." min="1" max="30">
      </div>
    </div>
  </div>`;
}

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function renderCles() {
  if (!isMember()) return;
  setLoading('cles-grid');

  const [membres, teams, slots] = await Promise.all([
    safeQuery('renderCles:membres', supabase.from('membres').select('*').order('nom')),
    safeQuery('renderCles:teams',   supabase.from('teams').select('*').order('created_at')),
    safeQuery('renderCles:slots',   supabase.from('team_slots').select('*')),
  ]);
  if (membres === null) return;

  const grid = g('cles-grid');
  g('cles-count').textContent = membres.length + ' membre' + (membres.length > 1 ? 's' : '');

  if (!membres.length) {
    grid.innerHTML = '<div class="empty"><div class="empty-icon">🗝️</div><p>Aucun membre — ajoute des membres d\'abord</p></div>';
    return;
  }

  const sortByRole = arr => [...arr].sort((a, b) => (ROLE_ORDER[a.spe] ?? 9) - (ROLE_ORDER[b.spe] ?? 9));
  const assignedIds = new Set();

  const sections = (teams || []).map(team => {
    const teamSlots   = (slots || []).filter(s => s.team_id === team.id);
    const teamMembres = teamSlots
      .map(s => membres.find(m => m.id === s.membre_id))
      .filter(Boolean)
      .filter(m => { const seen = assignedIds.has(m.id); assignedIds.add(m.id); return !seen; });

    if (!teamMembres.length) return '';
    return `<div class="cles-section">
      <div class="cles-section-head">${escHtml(team.nom)}</div>
      <div class="cles-team-grid">${sortByRole(teamMembres).map(cardHTML).join('')}</div>
    </div>`;
  });

  // Membres sans team
  const unassigned = sortByRole(membres.filter(m => !assignedIds.has(m.id)));
  if (unassigned.length) {
    sections.push(`<div class="cles-section">
      <div class="cles-section-head">Sans team</div>
      <div class="cles-team-grid">${unassigned.map(cardHTML).join('')}</div>
    </div>`);
  }

  grid.innerHTML = sections.join('');

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

  // Mise à jour inline — level
  const levelEl = card.querySelector('.cle-art-level');
  if (levelEl) { levelEl.textContent = niveau ? '+' + niveau : '—'; levelEl.style.color = niveauColor(niveau); }

  // Mise à jour inline — image du donjon
  const dInfo  = donjon ? DONJONS[donjon] : null;
  const artImg = card.querySelector('.cle-art img');
  const artPh  = card.querySelector('.cle-art-placeholder');
  if (dInfo) {
    if (artImg) { artImg.src = dInfo.img; }
    else if (artPh) { artPh.outerHTML = `<img src="${dInfo.img}" alt="${dInfo.en}" loading="lazy">`; }
  } else {
    if (artImg) { artImg.outerHTML = `<div class="cle-art-placeholder">🗝️</div>`; }
  }

  // Mise à jour inline — noms FR/EN
  const namesEl = card.querySelector('.cle-art-names');
  if (namesEl) {
    namesEl.innerHTML = dInfo
      ? `<div class="cle-art-fr">${dInfo.fr}</div><div class="cle-art-en">${dInfo.en}</div>`
      : `<div class="cle-art-fr cle-art-nokey">Pas de clé définie</div>`;
  }

  toast('🗝️ Clé mise à jour');
  refreshCoverage();
}
