/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 04 — MIGRATION localStorage → Supabase (one-shot)
 *
 * À exécuter UNE SEULE FOIS depuis la console du navigateur,
 * avec l'ANCIENNE version (indexV2.html) ouverte et un admin connecté.
 *
 * Pré-requis : window.sbAuth doit être disponible (c'est le cas dans V2).
 * ═══════════════════════════════════════════════════════════════════════════
 */

(async function migrate() {
  const DB = JSON.parse(localStorage.getItem('bt_v2') || '{}');
  let ok = 0, err = 0;

  // ── 1. Migrer alltime ─────────────────────────────────────────────────────
  const alltimeEntries = Object.entries(DB.alltime || {});
  console.log(`Alltime : ${alltimeEntries.length} entrée(s) à migrer`);

  for (const [membre_id, d] of alltimeEntries) {
    const row = {
      membre_id,
      nom:    d.nom    || 'Inconnu',
      spe:    d.spe    || null,
      classe: d.classe || null,
      earned: d.earned || 0,
      runs:   d.runs   || 0,
    };
    const { error } = await window.sbAuth
      .from('alltime')
      .upsert([row], { onConflict: 'membre_id' });

    if (error) { console.error('alltime:', membre_id, error.message); err++; }
    else { ok++; }
  }
  console.log(`Alltime migré : ${ok} ok, ${err} erreurs`);

  // ── 2. Migrer blacklist ───────────────────────────────────────────────────
  ok = 0; err = 0;
  const blEntries = DB.blacklist || [];
  console.log(`Blacklist : ${blEntries.length} entrée(s) à migrer`);

  for (const e of blEntries) {
    const row = {
      nom:    e.nom    || '',
      rio:    e.rio    || null,
      raison: e.raison || null,
      date:   e.date   || new Date().toISOString(),
    };
    const { error } = await window.sbAuth.from('blacklist').insert([row]);
    if (error) { console.error('blacklist:', e.nom, error.message); err++; }
    else { ok++; }
  }
  console.log(`Blacklist migrée : ${ok} ok, ${err} erreurs`);

  console.log('✅ Migration terminée !');
})();
