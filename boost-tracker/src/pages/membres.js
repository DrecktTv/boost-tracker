import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g } from '../lib/utils.js';
import { speColor } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { oov, cov } from '../ui/modal.js';
import { isMember, isAdmin, getUser, setState, getMainMembreId } from '../lib/state.js';
import { updateUserBarMain } from '../auth/auth.js';
import { SPES } from '../constants.js';

const SPE_LBL = { 'DPS.C': 'DPS C·C', 'DPS.D': 'DPS Dist.', 'TANK': 'Tank', 'Heal': 'Heal' };
const SPE_CLS = { 'DPS.C': 'b-dps',   'DPS.D': 'b-dps',     'TANK': 'b-tank', 'Heal': 'b-heal' };
let _openingModal = false;

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function renderMembres() {
  g('m-body').innerHTML = `<tr><td colspan="7"><div class="sk-wrap-table"><div class="sk-row-sm"></div><div class="sk-row-sm"></div><div class="sk-row-sm"></div></div></td></tr>`;
  const membres = await safeQuery('renderMembres', supabase.from('membres').select('*').order('nom'));
  if (membres === null) return;

  // Mettre à jour le cache state pour les autres pages (teams, runs)
  setState('membres', membres);

  g('m-count').textContent = membres.length + ' membre' + (membres.length > 1 ? 's' : '');
  const tbody = g('m-body');

  if (!membres.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-icon">⚔</div><p>Aucun membre</p></div></td></tr>`;
    return;
  }

  // Index pour résoudre les noms de main
  const byId = Object.fromEntries(membres.map(m => [m.id, m]));
  // Ensemble des ids qui sont main d'au moins un alt
  const mainIds = new Set(membres.filter(m => m.main_id).map(m => m.main_id));

  tbody.innerHTML = membres.map(m => {
    let statutBadge;
    if (m.main_id && byId[m.main_id]) {
      statutBadge = `<span class="badge" style="background:var(--bg3);color:var(--text2);font-size:10px">ALT → ${escHtml(byId[m.main_id].nom)}</span>`;
    } else if (mainIds.has(m.id)) {
      statutBadge = `<span class="badge" style="background:#1a3a1a;color:#4caf50;font-size:10px">MAIN</span>`;
    } else {
      statutBadge = `<span style="color:var(--text3)">—</span>`;
    }

    return `<tr data-id="${escHtml(m.id)}">
    <td>
      <div class="cname">
        <span style="width:5px;height:24px;border-radius:3px;background:${speColor(m.classe || '')};flex-shrink:0"></span>
        <strong>${escHtml(m.nom)}</strong>
      </div>
    </td>
    <td>${m.spe ? `<span class="badge ${SPE_CLS[m.spe] || ''}">${escHtml(SPE_LBL[m.spe] || m.spe)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
    <td style="color:var(--text2)">${escHtml(m.classe || '—')}</td>
    <td style="color:var(--blue2);font-weight:600">${m.ilvl || '—'}</td>
    <td style="color:var(--gold2);font-weight:600">${m.rio || '—'}</td>
    <td>${statutBadge}</td>
    <td>
      <div style="display:flex;gap:5px">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${escHtml(m.id)}">✏</button>
        <button class="btn btn-ghost btn-sm" data-action="del"  data-id="${escHtml(m.id)}">✕</button>
      </div>
    </td>
  </tr>`;
  }).join('');

  // Event delegation sur le tbody — plus d'onclick inline
  tbody.onclick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') await editM(id);
    if (btn.dataset.action === 'del')  await delM(id, btn);
  };
}

// ── Modal CRUD ─────────────────────────────────────────────────────────────────

export function updateSpeList() {
  const role = g('ms').value;
  const sel  = g('mc');
  if (!role) { sel.innerHTML = '<option value="">— Choisir un rôle —</option>'; return; }
  sel.innerHTML = '<option value="">— Spécialisation —</option>' +
    (SPES[role] || []).map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
}

function populateMainSelect(membres, excludeId = null) {
  const sel = g('m-main-id');
  // Only non-alts can be selected as a main (can't chain alts)
  const mains = membres.filter(m => !m.main_id && m.id !== excludeId);
  sel.innerHTML = '<option value="">— Personnage principal (laisser vide si c\'est un main) —</option>' +
    mains.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.nom)}</option>`).join('');
}

export async function openAddM() {
  if (_openingModal) return;
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  _openingModal = true;
  try {
    g('m-id').value = '';
    g('m-title').textContent = 'Ajouter un membre';
    ['mn', 'mi', 'mr'].forEach(id => { g(id).value = ''; });
    g('ms').selectedIndex = 0;
    g('mc').innerHTML = '<option value="">— Choisir un rôle —</option>';
    g('m-trade').value = '';
    const altWrap = document.getElementById('m-alts-wrap');
    if (altWrap) { altWrap.style.display = 'none'; altWrap.innerHTML = ''; }

    const membres = await safeQuery('openAddM:membres', supabase.from('membres').select('id,nom,main_id').order('nom'));
    populateMainSelect(membres || []);

    oov('ov-m');
  } finally {
    _openingModal = false;
  }
}

async function editM(id) {
  const [mResult, allResult] = await Promise.all([
    supabase.from('membres').select('*').eq('id', id).single(),
    safeQuery('editM:membres', supabase.from('membres').select('id,nom,main_id').order('nom')),
  ]);
  const m = mResult.data;
  if (!m) return;

  g('m-id').value   = id;
  g('m-title').textContent = 'Modifier ' + m.nom;
  g('mn').value     = m.nom || '';
  g('ms').value     = m.spe || '';
  updateSpeList();
  g('mc').value     = m.classe || '';
  g('mi').value     = m.ilvl || '';
  g('mr').value     = m.rio || '';
  g('m-trade').value = m.can_trade || '';

  // Populate main select (exclude self so a member can't be its own main)
  populateMainSelect(allResult || [], id);
  g('m-main-id').value = m.main_id || '';

  // Show alts of this member if it's a main
  const alts = (allResult || []).filter(x => x.main_id === id);
  const altWrap = document.getElementById('m-alts-wrap');
  if (altWrap) {
    if (alts.length) {
      altWrap.style.display = 'block';
      altWrap.innerHTML = `<label style="color:var(--text3);font-size:12px;margin-bottom:4px;display:block">Alts liés</label>` +
        alts.map(a => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <span style="flex:1;font-size:13px">${escHtml(a.nom)}</span>
          <button class="btn btn-ghost btn-sm" data-unlink="${escHtml(a.id)}" style="font-size:11px">Délier</button>
        </div>`).join('');
      altWrap.onclick = async e => {
        const btn = e.target.closest('[data-unlink]');
        if (!btn) return;
        btn.disabled = true;
        await safeQuery('unlinkAlt', supabase.from('membres').update({ main_id: null }).eq('id', btn.dataset.unlink));
        toast('Alt délié');
        await editM(id); // re-render modal
      };
    } else {
      altWrap.style.display = 'none';
      altWrap.innerHTML = '';
    }
  }

  oov('ov-m');
}

export async function saveM() {
  const btn = g('btn-save-membre');
  if (btn?.disabled) return;

  const nom = g('mn').value.trim();
  if (!nom) { toast('Nom requis', 'err'); return; }
  const editId = g('m-id').value;

  if (btn) btn.disabled = true;
  try {
    const payload = {
      nom,
      spe:     g('ms').value || null,
      classe:  g('mc').value || null,
      ilvl:      parseInt(g('mi').value) || null,
      rio:       parseInt(g('mr').value) || null,
      can_trade: g('m-trade').value || null,
      main_id:   g('m-main-id').value || null,
      owner_id: getUser()?.id,
    };

    if (editId) {
      const data = await safeQuery('saveM:update', supabase.from('membres').update(payload).eq('id', editId));
      if (data === null) return;
    } else {
      const data = await safeQuery('saveM:insert', supabase.from('membres').insert([payload]));
      if (data === null) return;
    }

    cov('ov-m');
    toast(editId ? '✓ Modifié' : `⚔ ${escHtml(nom)} ajouté`);
    await renderMembres();
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function delM(id, btn) {
  if (btn) btn.disabled = true;

  try {
    if (!isAdmin()) {
      const { data: existing } = await supabase.from('membres').select('owner_id').eq('id', id).single();
      if (existing?.owner_id !== getUser()?.id) {
        toast('Permission refusée', 'err');
        return;
      }
    }

    // Check if this member is a main with alts
    const { data: alts } = await supabase.from('membres').select('nom').eq('main_id', id);
    if (alts?.length) {
      const altNames = alts.map(a => a.nom).join(', ');
      if (!confirm(`Ce personnage est main de : ${altNames}.\nSupprimer quand même ? (les alts seront déliés)`)) return;
    } else {
      if (!confirm('Supprimer ce membre ?')) return;
    }

    const data = await safeQuery('delM', supabase.from('membres').delete().eq('id', id));
    if (data === null) return;

    // Si le perso supprimé était le main de l'utilisateur courant → nettoyer le state
    if (getMainMembreId() === id) {
      setState('currentMainMembreId', null);
      updateUserBarMain(null);
    }

    toast('Supprimé');
    await renderMembres();
  } finally {
    if (btn) btn.disabled = false;
  }
}
