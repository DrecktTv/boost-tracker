import { describe, it, expect } from 'vitest';

// ── Logique d'agrégation main/alt (extraite pour être testable) ────────────────
// Même algorithme que ladder.js renderLadderSession et reset.js doReset

function aggregateGold(runs, membres) {
  const byId = Object.fromEntries(membres.map(x => [x.id, x]));
  const data = {};
  runs.forEach(run => {
    (run.membres || []).forEach(m => {
      if (!m.membre_id || m.role === 'Client') return;
      const mb = byId[m.membre_id];
      if (!mb) return;
      const targetId = mb.main_id && byId[mb.main_id] ? mb.main_id : m.membre_id;
      const target   = byId[targetId] || mb;
      if (!data[targetId]) {
        data[targetId] = { nom: target.nom, earned: 0, runs: 0 };
      }
      data[targetId].earned += (m.tarif || 0);
      data[targetId].runs++;
    });
  });
  return data;
}

// ── Logique s-total (extraite pour être testable) ──────────────────────────────

function computeMyTotal(runs, myIds) {
  let myTotal = 0, total = 0;
  runs.forEach(r => {
    if (r.paye) return;
    total += (r.prix || 0);
    const isMine = (r.membres || []).some(m => myIds.has(m.membre_id));
    if (isMine) myTotal += (r.prix || 0);
  });
  return myIds.size > 0 ? myTotal : total;
}

// ── Tests agrégation main/alt ─────────────────────────────────────────────────

describe('aggregateGold — main/alt', () => {
  const membres = [
    { id: 'main-1', nom: 'Arthas',  main_id: null },
    { id: 'alt-1',  nom: 'ArthasAlt', main_id: 'main-1' },
    { id: 'solo-1', nom: 'Jaina',   main_id: null },
  ];

  it('un alt attribue son gold au main', () => {
    const runs = [{
      membres: [{ membre_id: 'alt-1', role: 'DPS', tarif: 10000 }],
    }];
    const result = aggregateGold(runs, membres);
    expect(result['main-1'].earned).toBe(10000);
    expect(result['alt-1']).toBeUndefined();
  });

  it('un main sans alt garde son gold', () => {
    const runs = [{
      membres: [{ membre_id: 'main-1', role: 'DPS', tarif: 5000 }],
    }];
    const result = aggregateGold(runs, membres);
    expect(result['main-1'].earned).toBe(5000);
  });

  it('main + alt cumulent sur le main', () => {
    const runs = [
      { membres: [{ membre_id: 'main-1', role: 'DPS', tarif: 5000 }] },
      { membres: [{ membre_id: 'alt-1',  role: 'DPS', tarif: 3000 }] },
    ];
    const result = aggregateGold(runs, membres);
    expect(result['main-1'].earned).toBe(8000);
    expect(result['main-1'].runs).toBe(2);
  });

  it('perso solo sans main/alt garde son propre gold', () => {
    const runs = [{
      membres: [{ membre_id: 'solo-1', role: 'DPS', tarif: 7000 }],
    }];
    const result = aggregateGold(runs, membres);
    expect(result['solo-1'].earned).toBe(7000);
  });

  it('ignore le rôle Client', () => {
    const runs = [{
      membres: [{ membre_id: 'main-1', role: 'Client', tarif: 50000 }],
    }];
    const result = aggregateGold(runs, membres);
    expect(result['main-1']).toBeUndefined();
  });

  it('ignore un membre_id inconnu', () => {
    const runs = [{
      membres: [{ membre_id: 'unknown-id', role: 'DPS', tarif: 1000 }],
    }];
    const result = aggregateGold(runs, membres);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('alt orphelin (main supprimé) reste sur lui-même', () => {
    const membresOrphan = [
      { id: 'alt-orphan', nom: 'Orphan', main_id: 'deleted-main' },
    ];
    const runs = [{
      membres: [{ membre_id: 'alt-orphan', role: 'DPS', tarif: 2000 }],
    }];
    const result = aggregateGold(runs, membresOrphan);
    expect(result['alt-orphan'].earned).toBe(2000);
  });
});

// ── Tests s-total filtré ──────────────────────────────────────────────────────

describe('computeMyTotal — s-total', () => {
  const runs = [
    { prix: 10000, paye: false, membres: [{ membre_id: 'main-1' }, { membre_id: 'other' }] },
    { prix: 8000,  paye: false, membres: [{ membre_id: 'other' }] },
    { prix: 5000,  paye: true,  membres: [{ membre_id: 'main-1' }] }, // payé → ignoré
  ];

  it('avec main configuré, retourne seulement les runs du main', () => {
    const myIds = new Set(['main-1', 'alt-1']);
    expect(computeMyTotal(runs, myIds)).toBe(10000);
  });

  it('sans main configuré, retourne le total global (non payé)', () => {
    const myIds = new Set();
    expect(computeMyTotal(runs, myIds)).toBe(18000);
  });

  it('ignore les runs payés dans les deux cas', () => {
    const myIds = new Set(['main-1']);
    // Run payé (5000) doit être ignoré
    expect(computeMyTotal(runs, myIds)).toBe(10000);
  });
});
