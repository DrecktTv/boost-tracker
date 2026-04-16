import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { g } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { oov, cov } from '../ui/modal.js';
import { isMember } from '../lib/state.js';
import { renderTracker } from './tracker.js';

// ── Ouvrir le modal reset ──────────────────────────────────────────────────────

export function openReset() {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  g('reset-note').value = '';
  oov('ov-reset');
}

// ── Exécuter le reset & archiver ───────────────────────────────────────────────

export async function doReset() {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }

  const note = g('reset-note').value.trim()
    || ('Session du ' + new Date().toLocaleDateString('fr-FR'));

  const [runs, membres] = await Promise.all([
    safeQuery('doReset:runs',    supabase.from('runs').select('*')),
    safeQuery('doReset:membres', supabase.from('membres').select('*')),
  ]);
  if (runs === null) return;

  // Bloquer si des membres ne sont pas encore payés
  const unpaidMembers = (runs || []).flatMap(r =>
    (r.membres || []).filter(m => m.membre_id && m.role !== 'Client' && !m.paid)
  );
  if (unpaidMembers.length) {
    toast(`${unpaidMembers.length} membre(s) pas encore payé(s) — règle les paiements avant d'archiver`, 'err');
    cov('ov-reset');
    return;
  }

  const total  = runs.reduce((s, r) => s + (r.prix || 0), 0);
  const paid   = runs.filter(r =>  r.paye).length;
  const unpaid = runs.filter(r => !r.paye).length;

  // Calcul des gains par membre — si alt, on agrège sur le main
  const byId = Object.fromEntries(membres.map(x => [x.id, x]));
  const sessionGold = {};
  runs.forEach(run => {
    (run.membres || []).forEach(m => {
      if (!m.membre_id || m.role === 'Client') return;
      const mb = byId[m.membre_id];
      if (!mb) return;

      const targetId = mb.main_id && byId[mb.main_id] ? mb.main_id : m.membre_id;
      const target   = byId[targetId] || mb;

      if (!sessionGold[targetId]) {
        sessionGold[targetId] = { nom: target.nom, spe: target.spe, classe: target.classe, earned: 0, runs: 0 };
      }
      sessionGold[targetId].earned += (m.tarif || 0);
      sessionGold[targetId].runs++;
    });
  });

  // Upsert alltime — lectures en parallèle, puis écritures en parallèle
  const entries = Object.entries(sessionGold);
  const existing = await Promise.all(
    entries.map(([membre_id]) =>
      safeQuery('doReset:alltime:get',
        supabase.from('alltime').select('earned,runs').eq('membre_id', membre_id).maybeSingle()
      )
    )
  );
  await Promise.all(
    entries.map(([membre_id, data], i) => {
      const prev = existing[i];
      if (prev) {
        return safeQuery('doReset:alltime:update',
          supabase.from('alltime').update({
            earned:     prev.earned + data.earned,
            runs:       prev.runs   + data.runs,
            nom:        data.nom,
            spe:        data.spe,
            classe:     data.classe,
            updated_at: new Date().toISOString(),
          }).eq('membre_id', membre_id)
        );
      }
      return safeQuery('doReset:alltime:insert',
        supabase.from('alltime').insert([{ membre_id, ...data }])
      );
    })
  );

  // Archiver dans historique_resets
  await safeQuery('doReset:historique', supabase.from('historique_resets').insert([{
    date:          new Date().toISOString(),
    note,
    total,
    paid_count:    paid,
    unpaid_count:  unpaid,
    runs_count:    runs.length,
    snapshot:      JSON.stringify({
      date: new Date().toISOString(),
      note, total, paid, unpaid,
      session_gold: sessionGold,
      runs,
    }),
  }]));

  // Supprimer tous les runs de la session
  if (runs.length) {
    await safeQuery('doReset:delete',
      supabase.from('runs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    );
  }

  cov('ov-reset');
  toast('↺ Session archivée !');
  await renderTracker();
}

// ── Archiver uniquement les runs entièrement payés ─────────────────────────────

export async function doArchivePaid() {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }

  const [runs, membres] = await Promise.all([
    safeQuery('doArchivePaid:runs',    supabase.from('runs').select('*')),
    safeQuery('doArchivePaid:membres', supabase.from('membres').select('*')),
  ]);
  if (runs === null) return;

  // Filtrer les runs dont tous les membres sont payés
  const paidRuns = (runs || []).filter(r => {
    const slots = (r.membres || []).filter(m => (m.membre_id || m.nom_wcl) && m.role !== 'Client');
    return slots.length > 0 && slots.every(m => m.paid);
  });

  if (!paidRuns.length) { toast('Aucun run entièrement payé', 'err'); return; }
  if (!confirm(`Archiver ${paidRuns.length} run(s) entièrement payé(s) ?`)) return;

  const byId = Object.fromEntries(membres.map(x => [x.id, x]));

  // Calcul des gains par membre pour ces runs uniquement
  const sessionGold = {};
  paidRuns.forEach(run => {
    (run.membres || []).forEach(m => {
      if (!m.membre_id || m.role === 'Client') return;
      const mb = byId[m.membre_id];
      if (!mb) return;
      const targetId = mb.main_id && byId[mb.main_id] ? mb.main_id : m.membre_id;
      const target   = byId[targetId] || mb;
      if (!sessionGold[targetId]) {
        sessionGold[targetId] = { nom: target.nom, spe: target.spe, classe: target.classe, earned: 0, runs: 0 };
      }
      sessionGold[targetId].earned += (m.tarif || 0);
      sessionGold[targetId].runs++;
    });
  });

  // Upsert alltime
  const entries = Object.entries(sessionGold);
  if (entries.length) {
    const existing = await Promise.all(
      entries.map(([membre_id]) =>
        safeQuery('doArchivePaid:alltime:get',
          supabase.from('alltime').select('earned,runs').eq('membre_id', membre_id).maybeSingle()
        )
      )
    );
    await Promise.all(
      entries.map(([membre_id, data], i) => {
        const prev = existing[i];
        if (prev) {
          return safeQuery('doArchivePaid:alltime:update',
            supabase.from('alltime').update({
              earned:     prev.earned + data.earned,
              runs:       prev.runs   + data.runs,
              nom:        data.nom,
              updated_at: new Date().toISOString(),
            }).eq('membre_id', membre_id)
          );
        }
        return safeQuery('doArchivePaid:alltime:insert',
          supabase.from('alltime').insert([{ membre_id, ...data }])
        );
      })
    );
  }

  // Archiver dans historique
  const total = paidRuns.reduce((s, r) => s + (r.prix || 0), 0);
  await safeQuery('doArchivePaid:historique', supabase.from('historique_resets').insert([{
    date:         new Date().toISOString(),
    note:         `Archivage partiel — ${paidRuns.length} run(s) payé(s)`,
    total,
    paid_count:   paidRuns.length,
    unpaid_count: 0,
    runs_count:   paidRuns.length,
    snapshot:     JSON.stringify({ date: new Date().toISOString(), total, session_gold: sessionGold, runs: paidRuns }),
  }]));

  // Supprimer uniquement ces runs
  const ids = paidRuns.map(r => r.id);
  await safeQuery('doArchivePaid:delete',
    supabase.from('runs').delete().in('id', ids)
  );

  toast(`✓ ${paidRuns.length} run(s) archivé(s)`);
  await renderTracker();
}
