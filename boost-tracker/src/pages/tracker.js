import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, gold, g, setLoading, formatDate } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { isMember, getMainMembreId } from '../lib/state.js';
import { doArchiveRun } from './reset.js';
import { roleImg, speColor } from '../ui/components.js';
import { DONJONS } from '../constants.js';

const ROLE_ORDER = { DPS: 0, TANK: 1, Heal: 2 };
let _rendering   = false;
let _myMembresIds = new Set();
const _runsCache  = new Map(); // runId → run (mis à jour après chaque mutation)
let _membresCache = [];        // membres pour résoudre les noms dans les panels

// ── Helpers paiement ──────────────────────────────────────────────────────────

function paidSlots(runMembres) {
  const slots = (runMembres || []).filter(m => (m.membre_id || m.nom_wcl) && m.role !== 'Client');
  return { paid: slots.filter(m => m.paid).length, total: slots.length };
}

function payBtnState(runMembres, runPaye) {
  if (runPaye) return { cls: 'ok', label: '✓ Tous payés' };
  const { paid, total } = paidSlots(runMembres);
  if (!total)          return { cls: 'no', label: 'Non payé' };
  if (paid === total)  return { cls: 'ok', label: '✓ Tous payés' };
  if (paid > 0)        return { cls: 'partial', label: `${paid}/${total} payés` };
  return { cls: 'no', label: 'Non payé' };
}

function renderPaymentPanel(run) {
  const slots = (run.membres || [])
    .map((m, i) => ({ ...m, _idx: i }))
    .filter(m => (m.membre_id || m.nom_wcl) && m.role !== 'Client')
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));

  if (!slots.length) return '<div style="padding:10px;color:var(--text3);font-size:13px">Aucun membre</div>';

  return slots.map(m => {
    const mb   = _membresCache.find(x => x.id === m.membre_id);
    const nom  = mb?.nom || m.nom_wcl || '—';
    const paid = !!m.paid;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border)">
      ${roleImg(m.role, 16)}
      <span style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${escHtml(nom)}${!mb && m.nom_wcl ? ' <span style="font-size:10px;color:var(--text3)">(WCL)</span>' : ''}</span>
      <span style="font-size:13px;color:var(--gold2);min-width:60px;text-align:right">${gold(m.tarif || 0)}</span>
      <button class="btn btn-sm ${paid ? 'btn-primary' : 'btn-ghost'}"
        data-member-paid="${escHtml(run.id)}"
        data-idx="${m._idx}"
        data-paid="${paid}"
        style="min-width:110px;font-size:12px">
        ${paid ? '✓ Payé' : 'Marquer payé'}
      </button>
    </div>`;
  }).join('');
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function updateStats(runs) {
  let myTotal = 0, total = 0, paid = 0, unpaid = 0;
  runs.forEach(r => {
    if (r.paye) { paid++; return; }
    unpaid++;
    total += (r.prix || 0);
    const myUnpaid = (r.membres || []).some(m => _myMembresIds.has(m.membre_id) && !m.paid);
    if (myUnpaid) myTotal += (r.prix || 0);
  });
  g('s-total').textContent  = gold(_myMembresIds.size > 0 ? myTotal : total);
  g('s-runs').textContent   = runs.length;
  g('s-paid').textContent   = paid;
  g('s-unpaid').textContent = unpaid;
  // Barre de ratio
  const pct = runs.length ? Math.round(paid / runs.length * 100) : 0;
  const ratio = g('s-ratio'); if (ratio) ratio.style.width = pct + '%';
  const lbl = g('s-ratio-lbl'); if (lbl) lbl.textContent = `${paid} / ${runs.length}`;

}

// ── Rendu ─────────────────────────────────────────────────────────────────────

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

    // Mise à jour des caches
    _membresCache = membres || [];
    _runsCache.clear();
    (runs || []).forEach(r => _runsCache.set(r.id, r));

    const rl = g('runs-list');
    g('runs-pill').textContent = runs.length + ' run' + (runs.length > 1 ? 's' : '');

    const mainId = getMainMembreId();
    _myMembresIds = mainId
      ? new Set([mainId, ..._membresCache.filter(m => m.main_id === mainId).map(m => m.id)])
      : new Set();

    updateStats(runs);

    if (!runs.length) {
      rl.innerHTML = '<div class="empty"><div class="empty-icon">🎯</div><p>Aucun run — clique sur <strong>+ Nouveau run</strong></p></div>';
      return;
    }

    rl.innerHTML = runs.map((run, ri) => {
      const team   = (teams || []).find(t => t.id === run.team_id);
      const donjon = DONJONS[run.cle] || null;
      const imgUrl = donjon?.img || '';
      const { cls, label } = payBtnState(run.membres, run.paye);

      // Barre de progression
      const { paid: pSlots, total: tSlots } = paidSlots(run.membres);
      const barPct = tSlots ? Math.round(pSlots / tSlots * 100) : (run.paye ? 100 : 0);

      const runMembers = (run.membres || [])
        .filter(m => m.role !== 'Client')
        .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));

      const membersHTML = runMembers.map(m => {
        const mb    = _membresCache.find(mb2 => mb2.id === m.membre_id);
        const color = speColor(mb?.classe || '');
        return `<div class="run-member">
          ${roleImg(m.role, 14)}
          <span class="class-dot" style="background:${color}"></span>
          <span class="run-member-name">${escHtml(mb?.nom || '—')}</span>
          ${mb?.classe ? `<span class="run-member-spe">${escHtml(mb.classe.split(' ')[0])}</span>` : ''}
        </div>`;
      }).join('');

      const clientEntry = (run.membres || []).find(m => m.role === 'Client');
      const clientHTML  = clientEntry?.nom_wcl
        ? `<div class="run-client">👤 <span>${escHtml(clientEntry.nom_wcl)}</span></div>`
        : '';

      const dateStr = run.date ? formatDate(run.date, { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';

      return `<div class="run-card" data-run-id="${escHtml(run.id)}">
        <div class="run-img" ${imgUrl ? `style="background-image:url(${escHtml(imgUrl)})"` : ''}>
          <div class="run-img-overlay"></div>
          <div class="run-num">${ri + 1}</div>
        </div>
        <div class="run-content">
          <div class="run-top">
            <span class="run-cle">${escHtml(run.cle || '—')}</span>
            <span class="run-donjon">${donjon ? escHtml(donjon.fr) : escHtml(run.cle || '—')}</span>
            ${team ? `<span class="run-team">${escHtml(team.nom)}</span>` : '<span class="run-notag">Sans team</span>'}
            ${run.note ? `<span class="run-date" style="font-style:italic">${escHtml(run.note)}</span>` : ''}
            ${dateStr ? `<span class="run-date">🕐 ${escHtml(dateStr)}</span>` : ''}
            <div class="run-top-right">
              <div class="run-gold">🪙 ${gold(run.prix || 0)}<span>/p</span></div>
              <span class="run-paid ${cls}" data-open-panel="${escHtml(run.id)}">${label}</span>
              ${pSlots === tSlots && tSlots > 0 ? `<button class="btn btn-sm run-archive-btn" data-archive-run="${escHtml(run.id)}" title="Archiver ce run">📦</button>` : ''}
              <button class="run-del" data-del-run="${escHtml(run.id)}">✕</button>
            </div>
          </div>
          <div class="run-members">${membersHTML}</div>
          ${clientHTML}
          <div class="run-bar"><div class="run-bar-fill ${cls}" style="width:${barPct}%"></div></div>
          <div class="run-payment-panel" style="display:none;border-top:1px solid var(--border)"></div>
        </div>
      </div>`;
    }).join('');

    rl.onclick = async e => {
      const memberBtn  = e.target.closest('[data-member-paid]');
      const openPanel  = e.target.closest('[data-open-panel]');
      const delBtn     = e.target.closest('.run-del[data-del-run]');
      const archiveBtn = e.target.closest('[data-archive-run]');

      if (memberBtn && !memberBtn.disabled) {
        await toggleMemberPaid(memberBtn.dataset.memberPaid, parseInt(memberBtn.dataset.idx), memberBtn.dataset.paid === 'true');
      } else if (openPanel) {
        togglePaymentPanel(openPanel.dataset.openPanel);
      }
      if (delBtn && !delBtn.disabled) await delRun(delBtn.dataset.delRun, delBtn);
      if (archiveBtn && !archiveBtn.disabled) {
        archiveBtn.disabled = true;
        await doArchiveRun(archiveBtn.dataset.archiveRun);
        archiveBtn.disabled = false;
      }
    };

  } finally {
    _rendering = false;
  }
}

// ── Panel paiement ────────────────────────────────────────────────────────────

function togglePaymentPanel(runId) {
  const card = document.querySelector(`.run-card[data-run-id="${runId}"]`);
  if (!card) return;
  const panel = card.querySelector('.run-payment-panel');
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  const run = _runsCache.get(runId);
  if (!run) return;
  panel.innerHTML = renderPaymentPanel(run);
  panel.style.display = 'block';
}

async function toggleMemberPaid(runId, idx, currentPaid) {
  const run = _runsCache.get(runId);
  if (!run) return;

  const btn = document.querySelector(`[data-member-paid="${runId}"][data-idx="${idx}"]`);
  if (btn) btn.disabled = true;

  const newMembres = (run.membres || []).map((m, i) =>
    i === idx ? { ...m, paid: !currentPaid } : m
  );
  const allPaid = newMembres
    .filter(m => m.membre_id && m.role !== 'Client')
    .every(m => m.paid);

  const data = await safeQuery('toggleMemberPaid',
    supabase.from('runs').update({ membres: newMembres, paye: allPaid }).eq('id', runId)
  );
  if (data === null) { if (btn) btn.disabled = false; return; }

  // Mise à jour du cache
  const updated = { ...run, membres: newMembres, paye: allPaid };
  _runsCache.set(runId, updated);

  // Mise à jour inline — pas de re-render complet
  const card = document.querySelector(`.run-card[data-run-id="${runId}"]`);
  if (card) {
    const panel = card.querySelector('.run-payment-panel');
    if (panel && panel.style.display !== 'none') panel.innerHTML = renderPaymentPanel(updated);
    const payBtn = card.querySelector('[data-open-panel]');
    if (payBtn) {
      const { cls, label } = payBtnState(newMembres, allPaid);
      payBtn.className = `run-paid ${cls}`;
      payBtn.textContent = label;
    }
  }

  updateStats(Array.from(_runsCache.values()));
  toast(!currentPaid ? '✓ Marqué payé' : 'Annulé');
  if (btn) btn.disabled = false;
}

// ── Supprimer un run ──────────────────────────────────────────────────────────

async function delRun(id, btn) {
  if (!confirm('Supprimer ce run ?')) return;
  if (btn) btn.disabled = true;
  const data = await safeQuery('delRun', supabase.from('runs').delete().eq('id', id));
  if (data === null) { if (btn) btn.disabled = false; return; }
  _runsCache.delete(id);
  toast('Run supprimé');
  await renderTracker();
}
