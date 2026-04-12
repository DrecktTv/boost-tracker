import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, gold, g, setLoading } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { isMember, isAdmin } from '../lib/state.js';
import { roleImg, speColor } from '../ui/components.js';
import { ICON_GOLD } from '../constants.js';

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function renderHist() {
  if (!isMember()) return;

  setLoading('hist-body');
  const hist = await safeQuery('renderHist',
    supabase.from('historique_resets').select('*').order('date', { ascending: false })
  );
  if (hist === null) return;

  g('h-count').textContent = hist.length + ' session' + (hist.length > 1 ? 's' : '');
  const body = g('hist-body');

  if (!hist.length) {
    body.innerHTML = '<div class="empty"><div class="empty-icon">🪙</div><p>Aucun historique</p></div>';
    return;
  }

  body.innerHTML = hist.map(h => {
    let snap = null;
    try { snap = JSON.parse(h.snapshot); } catch {}
    const session = Object.values(snap?.session_gold || {})
      .sort((a, b) => b.earned - a.earned);

    const sessionHTML = session.map(d => {
      const color = speColor(d.classe || '');
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 18px;border-bottom:1px solid rgba(255,255,255,.04)">
        ${roleImg(d.spe || 'DPS', 16)}
        <span style="width:5px;height:5px;border-radius:50%;background:${color};flex-shrink:0"></span>
        <span style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${escHtml(d.nom)}</span>
        <span style="font-size:11px;color:var(--text3)">${d.runs} run${d.runs > 1 ? 's' : ''}</span>
        <div style="display:flex;align-items:center;gap:4px;font-weight:700;color:var(--gold2);font-size:13px">
          <img src="${ICON_GOLD}" style="width:14px;height:14px;object-fit:contain"/>
          ${gold(d.earned)}
        </div>
      </div>`;
    }).join('');

    const dateStr = new Date(h.date).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const delBtn = isAdmin()
      ? `<button class="btn btn-ghost btn-sm" data-hid="${escHtml(h.id)}">✕</button>`
      : '';

    return `<div class="hcard" data-hist-id="${escHtml(h.id)}">
      <div class="hcard-head">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(h.note || '')}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${dateStr}</div>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <div style="text-align:right">
            <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Total session</div>
            <div style="display:flex;align-items:center;gap:5px;font-size:18px;font-weight:700;color:var(--gold2)">
              <img src="${ICON_GOLD}" style="width:18px;height:18px;object-fit:contain"/>
              ${gold(h.total || 0)}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;color:var(--blue2)">${h.runs_count || 0} run${(h.runs_count || 0) > 1 ? 's' : ''}</div>
          </div>
          ${delBtn}
        </div>
      </div>
      ${sessionHTML}
    </div>`;
  }).join('');

  // Event delegation — boutons suppression
  body.onclick = async e => {
    const btn = e.target.closest('[data-hid]');
    if (btn) await delHist(btn.dataset.hid);
  };
}

// ── Supprimer une session ──────────────────────────────────────────────────────

async function delHist(id) {
  if (!confirm('Supprimer cette session ?')) return;
  const data = await safeQuery('delHist', supabase.from('historique_resets').delete().eq('id', id));
  if (data === null) return;
  toast('Session supprimée');
  await renderHist();
}
