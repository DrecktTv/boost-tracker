import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g, setLoading } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { renderLadderRows } from '../ui/components.js';
import { isAdmin, isMember, getState } from '../lib/state.js';

// ── Entrée : rend les 3 vues par défaut (session + alltime) ──────────────────

export async function renderLadder() {
  await Promise.all([renderLadderSession(), renderLadderAlltime()]);
}

// ── Session en cours ─────────────────────────────────────────────────────────

export async function renderLadderSession() {
  const cont = g('lv-session');
  setLoading('lv-session');

  const [runs, membres] = await Promise.all([
    safeQuery('renderLadderSession:runs',    supabase.from('runs').select('*')),
    safeQuery('renderLadderSession:membres', supabase.from('membres').select('*')),
  ]);
  if (runs === null) { cont.innerHTML = renderLadderRows([], 'Aucun run dans la session'); return; }

  const data = {};
  (runs || []).forEach(run => {
    (run.membres || []).forEach(m => {
      if (!m.membre_id || m.role === 'Client') return;
      const mb = (membres || []).find(x => x.id === m.membre_id);
      if (!mb) return;
      if (!data[m.membre_id]) {
        data[m.membre_id] = { nom: mb.nom, spe: mb.spe, classe: mb.classe, earned: 0, runs: 0 };
      }
      data[m.membre_id].earned += (m.tarif || 0);
      data[m.membre_id].runs++;
    });
  });

  const sorted = Object.entries(data).sort((a, b) => b[1].earned - a[1].earned);
  cont.innerHTML = renderLadderRows(sorted, 'Aucun run dans la session en cours');
}

// ── All Time (Supabase table alltime) ────────────────────────────────────────

export async function renderLadderAlltime() {
  const cont = g('lv-alltime');
  setLoading('lv-alltime');

  const rows = await safeQuery('renderLadderAlltime', supabase.from('alltime').select('*').order('earned', { ascending: false }));
  if (rows === null) return;

  const resetBtn = isAdmin()
    ? `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-danger btn-sm" id="btn-reset-alltime">🗑 Reset All Time</button>
      </div>`
    : '';

  const sorted = (rows || []).map(r => [r.membre_id, { nom: r.nom, spe: r.spe, classe: r.classe, earned: r.earned, runs: r.runs }]);
  cont.innerHTML = resetBtn + renderLadderRows(sorted, 'Aucune donnée all time — faites des runs !');

  cont.querySelector('#btn-reset-alltime')?.addEventListener('click', resetAllTime);
}

async function resetAllTime() {
  if (!isAdmin()) { toast('Accès refusé', 'err'); return; }
  if (!confirm('⚠️ Effacer tout le All Time Ladder ? Cette action est irréversible.')) return;
  await safeQuery('resetAllTime',
    supabase.from('alltime').delete().neq('membre_id', '00000000-0000-0000-0000-000000000000')
  );
  toast('All Time Ladder réinitialisé');
  await renderLadderAlltime();
}

// ── Smizz Ladder ─────────────────────────────────────────────────────────────

export async function renderSmizzLadder() {
  const cont = g('lv-smizz');
  setLoading('lv-smizz');

  const [catches, usersData] = await Promise.all([
    safeQuery('renderSmizzLadder:catches', supabase.from('smizz_catches').select('*').order('date', { ascending: false })),
    safeQuery('renderSmizzLadder:users',   supabase.from('user_roles').select('id,discord_name,discord_avatar')),
  ]);

  const catchList = catches || [];
  const total     = catchList.length;

  const usersMap = {};
  (usersData || []).forEach(u => { usersMap[u.id] = u; });

  const byPlayer = {};
  catchList.forEach(c => {
    if (!c.caught_by) return;
    const u = usersMap[c.caught_by];
    const nom = (u && u.discord_name) || 'Inconnu';
    if (!byPlayer[c.caught_by]) byPlayer[c.caught_by] = { nom, count: 0 };
    byPlayer[c.caught_by].count++;
  });

  const byDay = {};
  catchList.forEach(c => {
    const d = new Date(c.date).toLocaleDateString('fr-FR');
    byDay[d] = (byDay[d] || 0) + 1;
  });

  const lastCatch  = catchList.length
    ? new Date(catchList[0].date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const recordDay  = Object.values(byDay).length ? Math.max(...Object.values(byDay)) : 0;
  const todayKey   = new Date().toLocaleDateString('fr-FR');

  const playersSorted = Object.entries(byPlayer).sort((a, b) => b[1].count - a[1].count);
  const medals = ['🎉', '🥈', '🥉'];

  const playersHTML = playersSorted.length
    ? playersSorted.map(([, d], i) =>
        `<div style="display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid rgba(255,255,255,.04)">
          <span style="font-size:18px;width:28px;text-align:center">${medals[i] || '#' + (i + 1)}</span>
          <span style="flex:1;font-size:14px;font-weight:600;color:var(--text)">${escHtml(d.nom)}</span>
          <span style="font-size:15px;font-weight:700;color:var(--gold2)">🏹 ${d.count}</span>
        </div>`
      ).join('')
    : '<div style="padding:16px 18px;color:var(--text3);font-size:13px">Aucun catch enregistré</div>';

  const resetBtn = isAdmin()
    ? `<div style="display:flex;justify-content:flex-end;margin-bottom:4px">
        <button class="btn btn-danger btn-sm" id="btn-reset-smizz">🗑 Reset Smizz</button>
      </div>`
    : '';

  cont.innerHTML = `<div style="display:flex;flex-direction:column;gap:16px">
    ${resetBtn}
    <div style="background:var(--bg1);border:1px solid rgba(212,160,23,.3);border-radius:var(--rad2);padding:28px;text-align:center">
      <div style="font-size:52px;margin-bottom:8px">🏹</div>
      <div style="font-family:Cinzel,serif;font-size:44px;font-weight:900;color:#e8d44d;line-height:1">${total}</div>
      <div style="font-size:15px;color:var(--text2);margin-top:8px">Smizz livrés au total</div>
      ${lastCatch ? `<div style="font-size:12px;color:var(--text3);margin-top:4px">Dernier : ${lastCatch}</div>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
      <div style="background:var(--bg1);border:1px solid var(--border);border-radius:var(--rad2);padding:14px;text-align:center">
        <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Aujourd'hui</div>
        <div style="font-size:26px;font-weight:700;color:var(--gold2)">${byDay[todayKey] || 0}</div>
      </div>
      <div style="background:var(--bg1);border:1px solid var(--border);border-radius:var(--rad2);padding:14px;text-align:center">
        <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Record/jour</div>
        <div style="font-size:26px;font-weight:700;color:var(--gold2)">${recordDay}</div>
      </div>
      <div style="background:var(--bg1);border:1px solid var(--border);border-radius:var(--rad2);padding:14px;text-align:center">
        <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Chasseurs</div>
        <div style="font-size:26px;font-weight:700;color:var(--gold2)">${playersSorted.length}</div>
      </div>
    </div>
    <div style="background:var(--bg1);border:1px solid var(--border);border-radius:var(--rad2);overflow:hidden">
      <div style="background:var(--bg2);padding:11px 18px;font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border)">🏆 Chasseurs de Smizz</div>
      ${playersHTML}
    </div>
    ${total === 0 ? '<div class="empty"><div class="empty-icon">🏹</div><p>Attrape le Smizz pour commencer !</p></div>' : ''}
  </div>`;

  cont.querySelector('#btn-reset-smizz')?.addEventListener('click', resetSmizzLadder);
}

async function resetSmizzLadder() {
  if (!isAdmin()) { toast('Accès refusé', 'err'); return; }
  if (!confirm('Effacer tout le compteur Smizz ?')) return;
  await safeQuery('resetSmizzLadder',
    supabase.from('smizz_catches').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  );
  toast('Ladder Smizz réinitialisé');
  await renderSmizzLadder();
}

