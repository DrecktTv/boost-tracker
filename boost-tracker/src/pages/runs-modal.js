import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, gold, g } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { oov, cov } from '../ui/modal.js';
import { isMember, getState } from '../lib/state.js';
import { roleImg, speColor } from '../ui/components.js';
import { SLOT_DEFS, CLE_OPTIONS, ICON_GOLD } from '../constants.js';
import { renderTracker } from './tracker.js';

let _runMode = 'team'; // 'team' | 'solo'

// ── Ouvrir le modal ────────────────────────────────────────────────────────────

function resetModal() {
  g('run-note').value = '';
  g('run-prix').value = '';
  g('run-preview').style.display = 'none';
  g('run-cles-list').innerHTML = '';
  addCleInput();
}

export async function openAddRun() {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  _runMode = 'team';

  const teams = await safeQuery('openAddRun:teams',
    supabase.from('teams').select('*').order('created_at')
  );
  if (teams === null) return;

  g('run-modal-title').textContent = 'Nouveau run';
  g('run-team-wrap').style.display = '';
  g('run-participants-wrap').style.display = 'none';

  const sel = g('run-team');
  sel.innerHTML = '<option value="">— Choisir une team —</option>' +
    teams.map(t => `<option value="${escHtml(t.id)}">${escHtml(t.nom)}</option>`).join('');
  sel.onchange = updateRunPreview;
  g('run-prix').oninput = updateRunPreview;

  resetModal();
  oov('ov-run');
}

export async function openAddRunSolo() {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  _runMode = 'solo';

  const membres = await safeQuery('openAddRunSolo:membres',
    supabase.from('membres').select('id,nom,spe').order('nom')
  );
  if (membres === null) return;

  g('run-modal-title').textContent = 'Run sans team';
  g('run-team-wrap').style.display = 'none';
  g('run-participants-wrap').style.display = '';
  g('run-participants-list').innerHTML = '';
  addParticipantInput(membres);

  g('run-prix').oninput = () => {};

  resetModal();
  // Stocker les membres pour les selects suivants
  g('run-participants-wrap').dataset.membres = JSON.stringify(membres);
  oov('ov-run');
}

// ── Ajouter un participant (mode sans team) ────────────────────────────────────

export function addParticipantInput(membres) {
  // Récupère les membres depuis le dataset si non passés en argument
  const list = g('run-participants-list');
  const mbs  = membres || JSON.parse(g('run-participants-wrap').dataset.membres || '[]');

  const options = mbs.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.nom)}</option>`).join('');
  const isFirst = list.children.length === 0;
  const rmBtn   = isFirst ? '' : '<button class="btn btn-ghost btn-sm" style="padding:5px 8px;flex-shrink:0">✕</button>';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:center';
  row.innerHTML = `<select class="run-participant-sel" style="flex:1"><option value="">— Participant —</option>${options}</select>${rmBtn}`;

  row.querySelector('button')?.addEventListener('click', () => row.remove());
  list.appendChild(row);
}

// ── Ajouter une ligne de clé ───────────────────────────────────────────────────

export function addCleInput() {
  const list    = g('run-cles-list');
  const isFirst = list.children.length === 0;

  const options = CLE_OPTIONS.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  const rmBtn   = isFirst ? '' : '<button class="btn btn-ghost btn-sm" style="padding:5px 8px;flex-shrink:0">✕</button>';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:center';
  row.innerHTML = `<select class="run-cle-sel" style="flex:1"><option value="">— Clé —</option>${options}</select>${rmBtn}`;

  row.querySelector('button')?.addEventListener('click', () => row.remove());
  list.appendChild(row);
}

// ── Aperçu de la team dans le modal ───────────────────────────────────────────

export async function updateRunPreview() {
  const teamId = g('run-team').value;
  const prix   = parseFloat(g('run-prix').value) || 0;
  const prev   = g('run-preview');
  const body   = g('run-preview-body');

  if (!teamId) { prev.style.display = 'none'; return; }
  prev.style.display = 'block';

  const [slots, membres] = await Promise.all([
    safeQuery('updateRunPreview:slots',   supabase.from('team_slots').select('*').eq('team_id', teamId)),
    safeQuery('updateRunPreview:membres', supabase.from('membres').select('*')),
  ]);

  body.innerHTML = SLOT_DEFS.map((def, i) => {
    const slot  = (slots  || []).find(s => s.slot_index === i);
    const mb    = slot?.membre_id ? (membres || []).find(m => m.id === slot.membre_id) : null;
    const nom   = mb ? escHtml(mb.nom) : escHtml(def.lbl) + ' (vide)';
    const color = speColor(mb?.classe || '');

    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)">
      ${roleImg(def.role, 16)}
      <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0"></span>
      <span style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${nom}</span>
      ${prix ? `<span style="display:flex;align-items:center;gap:3px;font-size:13px;font-weight:700;color:var(--gold2)"><img src="${ICON_GOLD}" style="width:13px;height:13px;object-fit:contain"/>${gold(prix)}</span>` : ''}
    </div>`;
  }).join('');
}

// ── Sauvegarder le run ─────────────────────────────────────────────────────────

export async function saveRun() {
  const btn = g('btn-save-run');
  if (btn?.disabled) return;
  if (!isMember()) { toast('Accès refusé', 'err'); return; }

  const teamId = g('run-team').value;
  if (_runMode === 'team' && !teamId) { toast('Choisis une team', 'err'); return; }

  const clesSels = document.querySelectorAll('.run-cle-sel');
  const cles = Array.from(clesSels).map(s => s.value).filter(Boolean);
  if (!cles.length) { toast('Ajoute au moins une clé', 'err'); return; }

  if (btn) btn.disabled = true;
  try {
    const prix = parseFloat(g('run-prix').value) || 0;
    let membres;

    if (_runMode === 'solo') {
      // Mode sans team : participants sélectionnés manuellement
      const mbs = JSON.parse(g('run-participants-wrap').dataset.membres || '[]');
      const byId = Object.fromEntries(mbs.map(m => [m.id, m]));
      const sels = document.querySelectorAll('.run-participant-sel');
      const ids  = Array.from(sels).map(s => s.value).filter(Boolean);
      if (!ids.length) { toast('Ajoute au moins un participant', 'err'); return; }
      membres = ids.map((id, i) => {
        const mb = byId[id] || {};
        return { slot_index: i, role: mb.spe || 'DPS', membre_id: id, tarif: prix };
      });
    } else {
      // Mode avec team : slots de la team
      const slots = await safeQuery('saveRun:slots',
        supabase.from('team_slots').select('*').eq('team_id', teamId)
      );
      if (slots === null) return;
      membres = SLOT_DEFS.map((def, i) => {
        const slot = (slots || []).find(s => s.slot_index === i);
        return { slot_index: i, role: def.role, membre_id: slot?.membre_id || null, tarif: prix };
      });
    }

    const run = {
      team_id: _runMode === 'team' ? teamId : null,
      cle:     cles.join(', '),
      cles,
      note:    g('run-note').value.trim(),
      prix,
      membres,
      paye:    false,
      date:    new Date().toISOString(),
    };

    const data = await safeQuery('saveRun:insert', supabase.from('runs').insert([run]));
    if (data === null) return;

    cov('ov-run');
    toast('🎯 Run créé !');
    await renderTracker();
  } finally {
    if (btn) btn.disabled = false;
  }
}
