import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { isMember } from '../lib/state.js';

const COVERAGE_DEFS = [
  { key: 'Sky',   lbl: 'SR'   },
  { key: 'Pit',   lbl: 'POS'  },
  { key: 'MT',    lbl: 'MT'   },
  { key: 'Nexus', lbl: 'NPX'  },
  { key: 'WS',    lbl: 'WS'   },
  { key: 'Seat',  lbl: 'SEAT' },
  { key: 'MC',    lbl: 'MC'   },
  { key: 'AA',    lbl: 'AA'   },
];

let _membres         = [];
let _teams           = [];
let _slots           = [];
let _selectedTeamIds = new Set();

export async function initCoverage() {
  const wrap = document.getElementById('key-coverage');
  if (!wrap) return;
  if (!isMember()) { wrap.style.display = 'none'; return; }

  const [membres, teams, slots] = await Promise.all([
    safeQuery('coverage:membres', supabase.from('membres').select('id,cle_donjon,cle_niveau')),
    safeQuery('coverage:teams',   supabase.from('teams').select('id,nom').order('created_at')),
    safeQuery('coverage:slots',   supabase.from('team_slots').select('team_id,membre_id')),
  ]);
  if (!membres || !teams) return;

  _membres = membres;
  _teams   = teams  || [];
  _slots   = slots  || [];

  // Init selection: keep previous selection if teams still exist, otherwise select all
  const existingIds = new Set(_teams.map(t => t.id));
  if (_selectedTeamIds.size === 0) {
    _selectedTeamIds = new Set(existingIds);
  } else {
    for (const id of [..._selectedTeamIds]) {
      if (!existingIds.has(id)) _selectedTeamIds.delete(id);
    }
  }

  wrap.style.display = '';
  renderWidget(wrap);
}

function renderWidget(wrap) {
  const badgesHTML = COVERAGE_DEFS.map(def => {
    const has = hasCoverage(def.key);
    return `<div class="kc-badge${has ? ' kc-have' : ''}">${def.lbl}</div>`;
  }).join('');

  const teamsHTML = _teams.map(t =>
    `<div class="kc-team-pill${_selectedTeamIds.has(t.id) ? ' kc-team-on' : ''}" data-tid="${t.id}">${t.nom}</div>`
  ).join('');

  wrap.innerHTML = `<div class="kc-badges">${badgesHTML}</div><div class="kc-teams">${teamsHTML}</div>`;

  wrap.querySelectorAll('.kc-team-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const tid = pill.dataset.tid;
      if (_selectedTeamIds.has(tid)) _selectedTeamIds.delete(tid);
      else _selectedTeamIds.add(tid);
      renderWidget(wrap);
    });
  });
}

function hasCoverage(donjonKey) {
  const memberIds = new Set(
    _slots
      .filter(s => _selectedTeamIds.has(s.team_id))
      .map(s => s.membre_id)
  );
  return _membres.some(m =>
    memberIds.has(m.id) &&
    m.cle_donjon === donjonKey &&
    (m.cle_niveau || 0) >= 10
  );
}

// Called by realtime when membres table changes
export async function refreshCoverage() {
  const wrap = document.getElementById('key-coverage');
  if (!wrap || wrap.style.display === 'none') return;

  const membres = await safeQuery('coverage:refresh',
    supabase.from('membres').select('id,cle_donjon,cle_niveau')
  );
  if (!membres) return;

  _membres = membres;
  renderWidget(wrap);
}
