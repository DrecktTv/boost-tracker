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

  cont.innerHTML = teams.map((team, ti) => {
    const ts = (slots || []).filter(s => s.team_id === team.id);

    const slotsHTML = SLOT_DEFS.map((def, i) => {
      const slot = ts.find(s => s.slot_index === i);
      const mb   = slot?.membre_id ? (membres || []).find(m => m.id === slot.membre_id) : null;
      const badgeCls = def.role === 'DPS' ? 'b-dps' : def.role === 'TANK' ? 'b-tank' : 'b-heal';

      const inp = `<select class="slot-inp" data-team="${escHtml(team.id)}" data-slot="${i}" data-role="${def.role}">
        <option value="">— Choisir —</option>
        ${membresForRole(def.role).map(m =>
          `<option value="${escHtml(m.id)}" ${mb?.id === m.id ? 'selected' : ''}>${escHtml(m.nom)}${m.classe ? ' (' + escHtml(m.classe.split(' ')[0]) + ')' : ''}</option>`
        ).join('')}
      </select>`;

      return `<div class="slot-row">
        <span class="badge ${badgeCls}" style="font-size:11px;justify-content:center;display:inline-flex;align-items:center;gap:4px">
          ${roleImg(def.role, 13)}${escHtml(def.lbl)}
        </span>
        ${inp}
      </div>`;
    }).join('');

    return `<div class="team-cfg" data-team-id="${escHtml(team.id)}">
      <div class="team-cfg-head">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
          <div style="width:22px;height:22px;border-radius:50%;background:var(--blue3);border:1px solid var(--blue);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ti + 1}</div>
          <span
            class="team-name-edit"
            data-id="${escHtml(team.id)}"
            contenteditable="true"
            spellcheck="false"
            style="font-size:14px;font-weight:600;color:var(--text);outline:none;border-bottom:1px solid transparent;padding:2px 4px;border-radius:4px;cursor:text;min-width:60px;transition:all .15s"
          >${escHtml(team.nom)}</span>
          <span style="font-size:11px;color:var(--text3);opacity:.5">✏</span>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="del-team" data-id="${escHtml(team.id)}">Supprimer</button>
      </div>
      ${slotsHTML}
    </div>`;
  }).join('');

  // Event delegation — delete team
  cont.onclick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'del-team') await delTeam(btn.dataset.id);
  };

  // Event delegation — slots
  cont.onchange = e => {
    const sel = e.target.closest('.slot-inp');
    if (sel) updateTeamSlot(sel.dataset.team, parseInt(sel.dataset.slot), sel.value, sel.dataset.role);
  };

  // Event delegation — noms d'équipe (contenteditable)
  cont.addEventListener('focusin', e => {
    const el = e.target.closest('.team-name-edit');
    if (!el) return;
    el.style.borderBottomColor = 'var(--blue)';
    el.style.background = 'rgba(74,144,226,.08)';
  });
  cont.addEventListener('focusout', e => {
    const el = e.target.closest('.team-name-edit');
    if (!el) return;
    el.style.borderBottomColor = 'transparent';
    el.style.background = 'transparent';
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

async function delTeam(id) {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  if (!confirm('Supprimer cette team ?')) return;
  await safeQuery('delTeam:slots', supabase.from('team_slots').delete().eq('team_id', id));
  await safeQuery('delTeam:team',  supabase.from('teams').delete().eq('id', id));
  toast('Team supprimée');
  await renderTeams();
}
