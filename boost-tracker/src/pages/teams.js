import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g, setLoading } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { isMember, getState, setState } from '../lib/state.js';
import { roleImg } from '../ui/components.js';
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

  cont.innerHTML = `<div class="teams-grid">${teams.map((team, ti) => {
    const ts = (slots || []).filter(s => s.team_id === team.id);

    const roleAccent = { DPS: 'var(--red2)', TANK: 'var(--blue3)', Heal: 'rgba(76,175,120,.2)' };
    const slotsHTML = SLOT_DEFS.map((def, i) => {
      const slot = ts.find(s => s.slot_index === i);
      const mb   = slot?.membre_id ? (membres || []).find(m => m.id === slot.membre_id) : null;

      const filled = !!mb;
      return `<div class="team-slot${filled ? ' team-slot-filled' : ''}" data-slot-role="${def.role}">
        <div class="team-slot-icon" style="background:${roleAccent[def.role] || 'var(--bg2)'}">
          ${roleImg(def.role, 20)}
        </div>
        <span class="team-slot-lbl">${def.lbl}</span>
        <select class="slot-inp" data-team="${escHtml(team.id)}" data-slot="${i}" data-role="${def.role}">
          <option value="">—</option>
          ${membresForRole(def.role).map(m =>
            `<option value="${escHtml(m.id)}"${mb?.id === m.id ? ' selected' : ''}>${escHtml(m.nom)}${m.classe ? ' (' + escHtml(m.classe.split(' ')[0]) + ')' : ''}</option>`
          ).join('')}
        </select>
      </div>`;
    }).join('');

    return `<div class="team-card" data-team-id="${escHtml(team.id)}">
      <div class="team-card-head">
        <div class="team-card-num">${ti + 1}</div>
        <span
          class="team-name-edit"
          data-id="${escHtml(team.id)}"
          contenteditable="true"
          spellcheck="false"
        >${escHtml(team.nom)}</span>
        <button class="btn btn-ghost btn-sm team-card-del" data-action="del-team" data-id="${escHtml(team.id)}">✕</button>
      </div>
      <div class="team-card-slots">${slotsHTML}</div>
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
