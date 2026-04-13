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

  const selectedCount = _selectedTeamIds.size;
  const totalCount    = _teams.length;
  const btnLabel      = selectedCount === totalCount
    ? 'Toutes les teams'
    : selectedCount === 0
      ? 'Aucune team'
      : `${selectedCount} / ${totalCount} teams`;

  const dropItems = _teams.map(t => {
    const checked = _selectedTeamIds.has(t.id) ? ' checked' : '';
    return `<label class="kc-drop-item">
      <input type="checkbox" class="kc-cb" data-tid="${t.id}"${checked}>
      <span>${t.nom}</span>
    </label>`;
  }).join('');

  wrap.innerHTML = `
    <div class="kc-badges">${badgesHTML}</div>
    <div class="kc-dropdown">
      <button class="kc-drop-btn" type="button">${btnLabel} ▾</button>
      <div class="kc-drop-menu">${dropItems}</div>
    </div>`;

  // Toggle dropdown open/close
  const btn  = wrap.querySelector('.kc-drop-btn');
  const menu = wrap.querySelector('.kc-drop-menu');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('kc-drop-open');
  });

  // Close on outside click
  const closeMenu = () => menu.classList.remove('kc-drop-open');
  document.addEventListener('click', closeMenu, { once: true });

  // Checkbox changes — re-render badges without closing dropdown
  wrap.querySelectorAll('.kc-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const tid = cb.dataset.tid;
      if (cb.checked) _selectedTeamIds.add(tid);
      else _selectedTeamIds.delete(tid);
      // Update badges and button label only, keep dropdown open
      updateBadges(wrap);
      updateBtnLabel(wrap);
    });
  });
}

function updateBadges(wrap) {
  wrap.querySelectorAll('.kc-badge').forEach((el, i) => {
    const has = hasCoverage(COVERAGE_DEFS[i].key);
    el.classList.toggle('kc-have', has);
  });
}

function updateBtnLabel(wrap) {
  const selectedCount = _selectedTeamIds.size;
  const totalCount    = _teams.length;
  const btn = wrap.querySelector('.kc-drop-btn');
  if (!btn) return;
  btn.textContent = selectedCount === totalCount
    ? 'Toutes les teams ▾'
    : selectedCount === 0
      ? 'Aucune team ▾'
      : `${selectedCount} / ${totalCount} teams ▾`;
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
