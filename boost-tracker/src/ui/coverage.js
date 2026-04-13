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

const LS_KEY = 'kc_selected_teams';

let _membres         = [];
let _teams           = [];
let _slots           = [];
let _selectedTeamIds = new Set();

// ── Persistence ────────────────────────────────────────────────────────────────

function loadSelection() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return new Set(JSON.parse(saved));
  } catch { /* ignore */ }
  return null;
}

function saveSelection() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([..._selectedTeamIds]));
  } catch { /* ignore */ }
}

// ── Init ───────────────────────────────────────────────────────────────────────

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
  const saved = loadSelection();

  if (saved) {
    // Restore persisted selection, drop any teams that no longer exist
    _selectedTeamIds = new Set([...saved].filter(id => existingIds.has(id)));
    // If all were removed, fall back to all selected
    if (_selectedTeamIds.size === 0) _selectedTeamIds = new Set(existingIds);
  } else {
    _selectedTeamIds = new Set(existingIds);
  }

  wrap.style.display = '';
  renderWidget(wrap);
  mountModal();
}

// ── Widget (badges + gear button) ──────────────────────────────────────────────

function renderWidget(wrap) {
  const badgesHTML = COVERAGE_DEFS.map(def => {
    const has = hasCoverage(def.key);
    return `<div class="kc-badge${has ? ' kc-have' : ''}">${def.lbl}</div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="kc-header">
      <span class="kc-title">Couverture clés</span>
      <button class="kc-gear" id="kc-open-modal" title="Filtrer les teams" type="button">⚙</button>
    </div>
    <div class="kc-badges">${badgesHTML}</div>`;

  document.getElementById('kc-open-modal')?.addEventListener('click', openModal);
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function mountModal() {
  if (document.getElementById('kc-modal')) return; // already mounted

  const modal = document.createElement('div');
  modal.id = 'kc-modal';
  modal.className = 'kc-modal-backdrop';
  modal.innerHTML = `
    <div class="kc-modal-box">
      <div class="kc-modal-head">
        <span>Teams incluses</span>
        <button class="kc-modal-close" id="kc-close-modal" type="button">✕</button>
      </div>
      <div class="kc-modal-body" id="kc-modal-body"></div>
      <div class="kc-modal-foot">
        <button class="kc-modal-all" id="kc-select-all" type="button">Tout sélectionner</button>
        <button class="kc-modal-none" id="kc-select-none" type="button">Tout désélectionner</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.getElementById('kc-close-modal').addEventListener('click', closeModal);
  document.getElementById('kc-select-all').addEventListener('click', () => {
    _selectedTeamIds = new Set(_teams.map(t => t.id));
    saveSelection();
    refreshModalCheckboxes();
    updateBadges();
  });
  document.getElementById('kc-select-none').addEventListener('click', () => {
    _selectedTeamIds = new Set();
    saveSelection();
    refreshModalCheckboxes();
    updateBadges();
  });
}

function openModal() {
  const modal = document.getElementById('kc-modal');
  const body  = document.getElementById('kc-modal-body');
  if (!modal || !body) return;

  body.innerHTML = _teams.map(t => `
    <label class="kc-modal-item">
      <input type="checkbox" class="kc-cb" data-tid="${t.id}"${_selectedTeamIds.has(t.id) ? ' checked' : ''}>
      <span>${t.nom}</span>
    </label>`).join('');

  body.querySelectorAll('.kc-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _selectedTeamIds.add(cb.dataset.tid);
      else _selectedTeamIds.delete(cb.dataset.tid);
      saveSelection();
      updateBadges();
    });
  });

  modal.classList.add('kc-modal-open');
}

function closeModal() {
  document.getElementById('kc-modal')?.classList.remove('kc-modal-open');
}

function refreshModalCheckboxes() {
  document.querySelectorAll('#kc-modal-body .kc-cb').forEach(cb => {
    cb.checked = _selectedTeamIds.has(cb.dataset.tid);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function updateBadges() {
  const wrap = document.getElementById('key-coverage');
  wrap?.querySelectorAll('.kc-badge').forEach((el, i) => {
    el.classList.toggle('kc-have', hasCoverage(COVERAGE_DEFS[i].key));
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

// ── Realtime refresh ───────────────────────────────────────────────────────────

export async function refreshCoverage() {
  const wrap = document.getElementById('key-coverage');
  if (!wrap || wrap.style.display === 'none') return;

  const membres = await safeQuery('coverage:refresh',
    supabase.from('membres').select('id,cle_donjon,cle_niveau')
  );
  if (!membres) return;

  _membres = membres;
  updateBadges();
}
