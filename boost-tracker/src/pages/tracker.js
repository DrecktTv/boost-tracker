import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, gold, g, setLoading } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { isMember, getMainMembreId } from '../lib/state.js';
import { roleImg, speColor } from '../ui/components.js';
import { ICON_GOLD } from '../constants.js';

const ROLE_ORDER = { DPS: 0, TANK: 1, Heal: 2 };
let _rendering = false; // guard contre les renders concurrents (ex: realtime pendant reset)
let _myMembresIds = new Set(); // ids des persos (main+alt) appartenant à l'utilisateur connecté

function updateStats(runs) {
  let myTotal = 0, total = 0, paid = 0, unpaid = 0;
  runs.forEach(r => {
    if (r.paye) { paid++; }
    else {
      unpaid++;
      total += (r.prix || 0);
      // Gold "perso" : seulement les runs où l'user est dedans
      const isMine = (r.membres || []).some(m => _myMembresIds.has(m.membre_id));
      if (isMine) myTotal += (r.prix || 0);
    }
  });
  g('s-total').textContent  = gold(myTotal);
  g('s-runs').textContent   = runs.length;
  g('s-paid').textContent   = paid;
  g('s-unpaid').textContent = unpaid;
}

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function renderTracker() {
  if (!isMember()) return;
  if (_rendering) return;
  _rendering = true;

  try {
  setLoading('runs-list');

  const [runs, teams, membres] = await Promise.all([
    safeQuery('renderTracker:runs',    supabase.from('runs').select('*').order('date', { ascending: false })),
    safeQuery('renderTracker:teams',   supabase.from('teams').select('*')),
    safeQuery('renderTracker:membres', supabase.from('membres').select('*')),
  ]);
  if (runs === null) return;

  const rl = g('runs-list');
  g('runs-pill').textContent = runs.length + ' run' + (runs.length > 1 ? 's' : '');

  // Calcul des ids "mes persos" : main configuré dans user_roles + tous ses alts
  const mainId = getMainMembreId();
  if (mainId) {
    _myMembresIds = new Set([
      mainId,
      ...(membres || []).filter(m => m.main_id === mainId).map(m => m.id),
    ]);
  } else {
    _myMembresIds = new Set(); // pas de perso configuré → total = 0
  }

  updateStats(runs);

  if (!runs.length) {
    rl.innerHTML = '<div class="empty"><div class="empty-icon">🎯</div><p>Aucun run — clique sur <strong>+ Nouveau run</strong></p></div>';
    return;
  }

  rl.innerHTML = runs.map((run, ri) => {
    const team = (teams || []).find(t => t.id === run.team_id);

    const runMembers = (run.membres || [])
      .filter(m => m.role !== 'Client')
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));

    const membersHTML = runMembers.map(m => {
      const mb    = (membres || []).find(mb2 => mb2.id === m.membre_id);
      const color = speColor(mb?.classe || '');
      return `<div class="run-member">
        ${roleImg(m.role, 18)}
        <span class="class-dot" style="background:${color}"></span>
        <div>
          <div class="run-member-name">${escHtml(mb?.nom || '—')}</div>
          ${mb?.classe ? `<div class="run-member-spe">${escHtml(mb.classe.split(' ')[0])}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    const payeClass = run.paye ? 'ok' : 'no';
    const cles = Array.isArray(run.cles) ? run.cles.map(escHtml).join(', ') : escHtml(run.cle || '—');

    return `<div class="run-card" data-run-prix="${run.prix || 0}">
      <div class="run-head">
        <div class="run-num">${ri + 1}</div>
        <span class="badge b-key">${cles}</span>
        ${team ? `<span style="font-size:12px;color:var(--text2)">${escHtml(team.nom)}</span>` : ''}
        ${run.note ? `<span style="font-size:11px;color:var(--text3);font-style:italic">${escHtml(run.note)}</span>` : ''}
        <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
          <div class="run-gold">
            <img src="${ICON_GOLD}" style="width:18px;height:18px;object-fit:contain"/>
            ${gold(run.prix || 0)}
            <span style="color:var(--text3);font-size:11px;font-weight:400">/p</span>
          </div>
          <span class="run-paid ${payeClass}" data-run-id="${escHtml(run.id)}" data-prix="${run.prix || 0}">
            ${run.paye ? '✓ Payé' : 'Non payé'}
          </span>
          <button class="btn btn-ghost btn-sm" data-del-run="${escHtml(run.id)}">✕</button>
        </div>
      </div>
      <div class="run-members">${membersHTML}</div>
    </div>`;
  }).join('');

  rl.onclick = async e => {
    const paidBtn = e.target.closest('[data-run-id]');
    const delBtn  = e.target.closest('[data-del-run]');
    if (paidBtn && !paidBtn.disabled) await toggleRunPaid(paidBtn.dataset.runId, paidBtn.classList.contains('ok'), paidBtn.dataset.prix);
    if (delBtn  && !delBtn.disabled)  await delRun(delBtn.dataset.delRun, delBtn);
  };

  } finally {
    _rendering = false;
  }
}

// ── Refresh stats seul (sans re-render la liste) ──────────────────────────────

async function refreshStats() {
  const runs = await safeQuery('refreshStats', supabase.from('runs').select('paye,prix,membres'));
  if (!runs) return;
  updateStats(runs);
  g('runs-pill').textContent = runs.length + ' run' + (runs.length > 1 ? 's' : '');
}

// ── Actions ────────────────────────────────────────────────────────────────────

async function toggleRunPaid(id, currentlyPaid, prix) {
  const newPaye = !currentlyPaid;

  // Mise à jour optimiste du bouton — réponse immédiate sans attendre Supabase
  const btn = document.querySelector(`[data-run-id="${id}"]`);
  if (btn) {
    btn.classList.toggle('ok', newPaye);
    btn.classList.toggle('no', !newPaye);
    btn.textContent = newPaye ? '✓ Payé' : 'Non payé';
  }

  const data = await safeQuery('toggleRunPaid',
    supabase.from('runs').update({ paye: newPaye }).eq('id', id)
  );

  if (data === null) {
    // Échec — annuler la mise à jour optimiste
    if (btn) {
      btn.classList.toggle('ok', currentlyPaid);
      btn.classList.toggle('no', !currentlyPaid);
      btn.textContent = currentlyPaid ? '✓ Payé' : 'Non payé';
    }
    return;
  }

  toast(newPaye ? '✓ Payé' : 'Non payé');
  // Recalcule uniquement les stats, pas toute la liste
  await refreshStats();
}

async function delRun(id, btn) {
  if (!confirm('Supprimer ce run ?')) return;
  if (btn) btn.disabled = true;
  const data = await safeQuery('delRun', supabase.from('runs').delete().eq('id', id));
  if (data === null) { if (btn) btn.disabled = false; return; }
  toast('Run supprimé');
  await renderTracker();
}
