import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g, setLoading } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { isMember, getState, setState } from '../lib/state.js';
import { SLOT_DEFS } from '../constants.js';

/** Filtre les membres du state par rôle */
function membresForRole(role) {
  return (getState('membres') || []).filter(m => {
    if (!m.spe) return false;
    if (role === 'DPS')  return m.spe === 'DPS.C' || m.spe === 'DPS.D';
    if (role === 'TANK') return m.spe === 'TANK';
    if (role === 'Heal') return m.spe === 'Heal';
    return false;
  });
}

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function renderTeams() {
  setLoading('teams-cfg');
  // Charger teams + slots depuis Supabase (plus de localStorage)
  const [teams, slots, membres] = await Promise.all([
    safeQuery('renderTeams:teams', supabase.from('teams').select('*').order('created_at')),
    safeQuery('renderTeams:slots', supabase.from('team_slots').select('*')),
    safeQuery('renderTeams:membres', supabase.from('membres').select('*').order('nom')),
  ]);
  if (teams === null) return;

  // Mettre à jour le cache membres (utilisé par runs-modal)
  setState('membres', membres || []);

  g('tm-count').textContent = teams.length + ' team' + (teams.length > 1 ? 's' : '');
  const cont = g('teams-cfg');

  if (!teams.length) {
    cont.innerHTML = `<div class="empty"><div class="empty-icon">🐗</div><p>Aucune team</p></div>`;
    return;
  }

  // Ordre d'affichage : Tank, Heal, DPS1, DPS2
  const DISPLAY_ORDER = [2, 3, 0, 1];

  cont.innerHTML = `<div class="teams-grid">${teams.map((team, ti) => {
    const ts = (slots || []).filter(s => s.team_id === team.id);

    // Chips de statut
    const dpsCount  = [0, 1].filter(i => ts.find(s => s.slot_index === i)?.membre_id).length;
    const tankFilled = !!ts.find(s => s.slot_index === 2)?.membre_id;
    const healFilled = !!ts.find(s => s.slot_index === 3)?.membre_id;

    const chipDps  = dpsCount > 0
      ? `<span class="tc-chip chip-dps">⚔️ ${dpsCount} DPS</span>`
      : `<span class="tc-chip chip-empty">⚔️ —</span>`;
    const chipTank = tankFilled
      ? `<span class="tc-chip chip-tank">🛡 Tank</span>`
      : `<span class="tc-chip chip-empty">🛡 —</span>`;
    const chipHeal = healFilled
      ? `<span class="tc-chip chip-heal">🍃 Heal</span>`
      : `<span class="tc-chip chip-empty">🍃 —</span>`;

    // Rows des slots dans l'ordre Tank, Heal, DPS1, DPS2
    const dotClass = { DPS: 'dot-dps', TANK: 'dot-tank', Heal: 'dot-heal' };
    const slotsHTML = DISPLAY_ORDER.map(i => {
      const def  = SLOT_DEFS[i];
      const slot = ts.find(s => s.slot_index === i);
      const mb   = slot?.membre_id ? (membres || []).find(m => m.id === slot.membre_id) : null;

      return `<div class="tc-row">
        <div class="tc-dot ${dotClass[def.role] || ''}"></div>
        <span class="tc-lbl">${def.lbl}</span>
        <select class="slot-inp" data-team="${escHtml(team.id)}" data-slot="${i}" data-role="${def.role}">
          <option value="">— Vide —</option>
          ${membresForRole(def.role).map(m =>
            `<option value="${escHtml(m.id)}"${mb?.id === m.id ? ' selected' : ''}>${escHtml(m.nom)}${m.classe ? ' (' + escHtml(m.classe.split(' ')[0]) + ')' : ''}</option>`
          ).join('')}
        </select>
      </div>`;
    }).join('');

    return `<div class="team-card" data-team-id="${escHtml(team.id)}">
      <div class="tc-top">
        <div class="tc-top-row">
          <div class="team-card-num">${ti + 1}</div>
          <span class="team-name-edit" data-id="${escHtml(team.id)}" contenteditable="true" spellcheck="false">${escHtml(team.nom)}</span>
          <button class="btn btn-ghost btn-sm team-card-del" data-action="del-team" data-id="${escHtml(team.id)}">✕</button>
        </div>
        <div class="tc-chips">${chipTank}${chipHeal}${chipDps}</div>
      </div>
      <div class="tc-members">${slotsHTML}</div>
    </div>`;
  }).join('')}</div>`;

  // Event delegation — delete team
  cont.onclick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.action === 'del-team') await delTeam(btn.dataset.id, btn);
  };

  // Event delegation — slots
  cont.onchange = e => {
    const sel = e.target.closest('.slot-inp');
    if (sel) updateTeamSlot(sel.dataset.team, parseInt(sel.dataset.slot), sel.value, sel.dataset.role);
  };

  // Event delegation — noms d'équipe (contenteditable)
  cont.addEventListener('focusout', e => {
    const el = e.target.closest('.team-name-edit');
    if (!el) return;
    saveTeamName(el.dataset.id, el);
  });
  cont.addEventListener('keydown', e => {
    const el = e.target.closest('.team-name-edit');
    if (el && e.key === 'Enter') { e.preventDefault(); el.blur(); }
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────────

async function updateTeamSlot(teamId, slotIndex, membreId, role) {
  if (!isMember()) return;
  const { data: existing } = await supabase.from('team_slots').select('id')
    .eq('team_id', teamId).eq('slot_index', slotIndex).maybeSingle();

  if (existing) {
    await safeQuery('updateTeamSlot:update',
      supabase.from('team_slots').update({ membre_id: membreId || null }).eq('id', existing.id)
    );
  } else if (membreId) {
    await safeQuery('updateTeamSlot:insert',
      supabase.from('team_slots').insert([{ team_id: teamId, slot_index: slotIndex, role, membre_id: membreId, paye: false, tarif: 0 }])
    );
  }
  toast('Slot mis à jour');
}

async function saveTeamName(id, el) {
  if (!isMember()) return;
  const nom = el.textContent.trim();
  if (!nom) { renderTeams(); return; }
  await safeQuery('saveTeamName', supabase.from('teams').update({ nom }).eq('id', id));
  toast('✓ Team renommée');
}

export async function addTeam() {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  const existing = await safeQuery('addTeam:count', supabase.from('teams').select('id'));
  const num = (existing?.length || 0) + 1;
  await safeQuery('addTeam:insert', supabase.from('teams').insert([{ nom: 'Team ' + num }]));
  toast('Team créée');
  await renderTeams();
}

async function delTeam(id, btn) {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  if (!confirm('Supprimer cette team ?')) return;
  if (btn) btn.disabled = true;
  await safeQuery('delTeam:slots', supabase.from('team_slots').delete().eq('team_id', id));
  await safeQuery('delTeam:team',  supabase.from('teams').delete().eq('id', id));
  toast('Team supprimée');
  await renderTeams();
}
