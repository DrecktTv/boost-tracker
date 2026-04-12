import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g, setLoading } from '../lib/utils.js';
import { speColor } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { oov, cov } from '../ui/modal.js';
import { isMember, isAdmin, getUser, setState } from '../lib/state.js';
import { SPES } from '../constants.js';

const SPE_LBL = { 'DPS.C': 'DPS C·C', 'DPS.D': 'DPS Dist.', 'TANK': 'Tank', 'Heal': 'Heal' };
const SPE_CLS = { 'DPS.C': 'b-dps',   'DPS.D': 'b-dps',     'TANK': 'b-tank', 'Heal': 'b-heal' };

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function renderMembres() {
  g('m-body').innerHTML = `<tr><td colspan="6"><div class="sk-wrap-table"><div class="sk-row-sm"></div><div class="sk-row-sm"></div><div class="sk-row-sm"></div></div></td></tr>`;
  const membres = await safeQuery('renderMembres', supabase.from('membres').select('*').order('nom'));
  if (membres === null) return;

  // Mettre à jour le cache state pour les autres pages (teams, runs)
  setState('membres', membres);

  g('m-count').textContent = membres.length + ' membre' + (membres.length > 1 ? 's' : '');
  const tbody = g('m-body');

  if (!membres.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-icon">⚔</div><p>Aucun membre</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = membres.map(m => `<tr data-id="${escHtml(m.id)}">
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
    <td>
      <div style="display:flex;gap:5px">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${escHtml(m.id)}">✏</button>
        <button class="btn btn-ghost btn-sm" data-action="del"  data-id="${escHtml(m.id)}">✕</button>
      </div>
    </td>
  </tr>`).join('');

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

export function openAddM() {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  g('m-id').value = '';
  g('m-title').textContent = 'Ajouter un membre';
  ['mn', 'mi', 'mr'].forEach(id => { g(id).value = ''; });
  g('ms').selectedIndex = 0;
  g('mc').innerHTML = '<option value="">— Choisir un rôle —</option>';
  oov('ov-m');
}

async function editM(id) {
  const { data: m } = await supabase.from('membres').select('*').eq('id', id).single();
  if (!m) return;
  g('m-id').value   = id;
  g('m-title').textContent = 'Modifier ' + m.nom;
  g('mn').value     = m.nom || '';
  g('ms').value     = m.spe || '';
  updateSpeList();
  g('mc').value     = m.classe || '';
  g('mi').value     = m.ilvl || '';
  g('mr').value     = m.rio || '';
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
      spe:    g('ms').value || null,
      classe: g('mc').value || null,
      ilvl:   parseInt(g('mi').value) || null,
      rio:    parseInt(g('mr').value) || null,
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
  if (!confirm('Supprimer ce membre ?')) return;
  if (btn) btn.disabled = true;

  try {
    if (!isAdmin()) {
      const { data: existing } = await supabase.from('membres').select('owner_id').eq('id', id).single();
      if (existing?.owner_id !== getUser()?.id) {
        toast('Permission refusée', 'err');
        return;
      }
    }

    const data = await safeQuery('delM', supabase.from('membres').delete().eq('id', id));
    if (data === null) return;
    toast('Supprimé');
    await renderMembres();
  } finally {
    if (btn) btn.disabled = false;
  }
}
