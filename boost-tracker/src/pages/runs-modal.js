import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, gold, g } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { oov, cov } from '../ui/modal.js';
import { isMember, getState } from '../lib/state.js';
import { roleImg, speColor } from '../ui/components.js';
import { SLOT_DEFS, CLE_OPTIONS, ICON_GOLD } from '../constants.js';
import { renderTracker } from './tracker.js';

// ── Ouvrir le modal ────────────────────────────────────────────────────────────

export async function openAddRun() {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }

  const teams = await safeQuery('openAddRun:teams',
    supabase.from('teams').select('*').order('created_at')
  );
  if (teams === null) return;

  const sel = g('run-team');
  sel.innerHTML = '<option value="">— Choisir une team —</option>' +
    teams.map(t => `<option value="${escHtml(t.id)}">${escHtml(t.nom)}</option>`).join('');

  g('run-note').value = '';
  g('run-prix').value = '';
  g('run-preview').style.display = 'none';
  g('run-cles-list').innerHTML = '';
  addCleInput();

  sel.onchange = updateRunPreview;
  g('run-prix').oninput = updateRunPreview;

  oov('ov-run');
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
  if (!isMember()) { toast('Accès refusé', 'err'); return; }

  const teamId = g('run-team').value;
  if (!teamId) { toast('Choisis une team', 'err'); return; }

  const clesSels = document.querySelectorAll('.run-cle-sel');
  const cles = Array.from(clesSels).map(s => s.value).filter(Boolean);
  if (!cles.length) { toast('Ajoute au moins une clé', 'err'); return; }

  const prix = parseFloat(g('run-prix').value) || 0;

  const slots = await safeQuery('saveRun:slots',
    supabase.from('team_slots').select('*').eq('team_id', teamId)
  );
  if (slots === null) return;

  const membres = SLOT_DEFS.map((def, i) => {
    const slot = (slots || []).find(s => s.slot_index === i);
    return { slot_index: i, role: def.role, membre_id: slot?.membre_id || null, tarif: prix };
  });

  const run = {
    team_id: teamId,
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
}
