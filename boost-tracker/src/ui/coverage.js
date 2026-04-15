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

// _selected contient des team IDs et des "m:{membreId}" pour les membres sans team
let _membres  = [];
let _teams    = [];
let _slots    = [];
let _selected = new Set();

// ── Helpers IDs ────────────────────────────────────────────────────────────────

const mKey  = id => `m:${id}`;
const isMId = k  => k.startsWith('m:');
const rawId = k  => k.slice(2);

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
    localStorage.setItem(LS_KEY, JSON.stringify([..._selected]));
  } catch { /* ignore */ }
  document.dispatchEvent(new CustomEvent('coverage:changed'));
}

// ── Export pour session widget ─────────────────────────────────────────────────

export function getSelectedMembers() {
  const ids = new Set(_slots.filter(s => _selected.has(s.team_id)).map(s => s.membre_id));
  for (const k of _selected) { if (isMId(k)) ids.add(rawId(k)); }
  return _membres.filter(m => ids.has(m.id));
}

export function getCoveredDungeons() {
  return COVERAGE_DEFS.filter(def => hasCoverage(def.key)).map(def => def.key);
}

// Données brutes pour le sélecteur inline du widget session
export function getSetupData() {
  const assignedIds  = new Set(_slots.map(s => s.membre_id));
  const noTeamMembres = _membres.filter(m => !assignedIds.has(m.id));
  return {
    teams:     _teams,
    noTeam:    noTeamMembres,
    selected:  _selected,
    slots:     _slots,
    membres:   _membres,
    keyOf:     { team: id => id, membre: id => mKey(id) },
  };
}

// Toggle un chip team ou membre depuis le widget session
export function toggleSetupKey(key) {
  if (_selected.has(key)) _selected.delete(key);
  else _selected.add(key);
  saveSelection();
  updateBadges();
}

// Remplace toute la sélection (composition manuelle)
export function setSelection(keys) {
  _selected = new Set(keys);
  saveSelection();
  updateBadges();
}

// Tous les membres (pour composition manuelle)
export function getAllMembres() {
  return _membres;
}

// ── Init ───────────────────────────────────────────────────────────────────────

export async function initCoverage() {
  const wrap = document.getElementById('key-coverage');
  if (!wrap) return;
  if (!isMember()) { wrap.style.display = 'none'; return; }

  const [membres, teams, slots] = await Promise.all([
    safeQuery('coverage:membres', supabase.from('membres').select('id,nom,spe,classe,rio,ilvl,cle_donjon,cle_niveau,can_trade')),
    safeQuery('coverage:teams',   supabase.from('teams').select('id,nom').order('created_at')),
    safeQuery('coverage:slots',   supabase.from('team_slots').select('team_id,membre_id')),
  ]);
  if (!membres || !teams) return;

  _membres = membres;
  _teams   = teams  || [];
  _slots   = slots  || [];

  const teamIds      = new Set(_teams.map(t => t.id));
  const assignedIds  = new Set(_slots.map(s => s.membre_id));
  const noTeamMIds   = new Set(_membres.filter(m => !assignedIds.has(m.id)).map(m => mKey(m.id)));
  // allValid inclut tous les m:{id} (pas seulement sans-team) pour que la
  // sélection manuelle de la session survive au rechargement
  const allMIds      = new Set(_membres.map(m => mKey(m.id)));
  const allValid     = new Set([...teamIds, ...allMIds]);
  const defaultSel   = new Set([...teamIds, ...noTeamMIds]);

  const saved = loadSelection();
  if (saved) {
    _selected = new Set([...saved].filter(k => allValid.has(k)));
    if (_selected.size === 0) _selected = new Set(defaultSel);
  } else {
    _selected = new Set(defaultSel);
  }

  wrap.style.display = '';
  renderWidget(wrap);
  mountModal();
  document.dispatchEvent(new CustomEvent('coverage:changed'));
}

// ── Widget ─────────────────────────────────────────────────────────────────────

function renderWidget(wrap) {
  const badgesHTML = COVERAGE_DEFS.map(def => {
    const has = hasCoverage(def.key);
    return `<div class="kc-badge${has ? ' kc-have' : ''}">${def.lbl}</div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="kc-header">
      <span class="kc-title">Couverture clés</span>
    </div>
    <div class="kc-badges">${badgesHTML}</div>`;
}

// ── Modal ──────────────────────────────────────────────────────────────────────

function mountModal() {
  if (document.getElementById('kc-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'kc-modal';
  modal.className = 'kc-modal-backdrop';
  modal.innerHTML = `
    <div class="kc-modal-box">
      <div class="kc-modal-head">
        <span>Membres inclus</span>
        <button class="kc-modal-close" id="kc-close-modal" type="button">✕</button>
      </div>
      <div class="kc-modal-body" id="kc-modal-body"></div>
      <div class="kc-modal-foot">
        <button class="kc-modal-all"  id="kc-select-all"  type="button">Tout sélectionner</button>
        <button class="kc-modal-none" id="kc-select-none" type="button">Tout désélectionner</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.getElementById('kc-close-modal').addEventListener('click', closeModal);

  document.getElementById('kc-select-all').addEventListener('click', () => {
    const assignedIds = new Set(_slots.map(s => s.membre_id));
    _selected = new Set([
      ..._teams.map(t => t.id),
      ..._membres.filter(m => !assignedIds.has(m.id)).map(m => mKey(m.id)),
    ]);
    saveSelection();
    refreshModalCheckboxes();
    updateBadges();
  });

  document.getElementById('kc-select-none').addEventListener('click', () => {
    _selected = new Set();
    saveSelection();
    refreshModalCheckboxes();
    updateBadges();
  });
}

function openModal() {
  const modal = document.getElementById('kc-modal');
  const body  = document.getElementById('kc-modal-body');
  if (!modal || !body) return;

  const assignedIds  = new Set(_slots.map(s => s.membre_id));
  const noTeamMembres = _membres.filter(m => !assignedIds.has(m.id));

  const teamsHTML = _teams.map(t => `
    <label class="kc-modal-item">
      <input type="checkbox" class="kc-cb" data-key="${t.id}"${_selected.has(t.id) ? ' checked' : ''}>
      <span>${t.nom}</span>
    </label>`).join('');

  const noTeamHTML = noTeamMembres.length ? `
    <div class="kc-modal-sep"></div>
    <div class="kc-modal-section-lbl">Sans team</div>
    ${noTeamMembres.map(m => `
    <label class="kc-modal-item kc-modal-item-sub">
      <input type="checkbox" class="kc-cb" data-key="${mKey(m.id)}"${_selected.has(mKey(m.id)) ? ' checked' : ''}>
      <span>${m.nom}</span>
    </label>`).join('')}` : '';

  body.innerHTML = teamsHTML + noTeamHTML;

  body.querySelectorAll('.kc-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _selected.add(cb.dataset.key);
      else _selected.delete(cb.dataset.key);
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
    cb.checked = _selected.has(cb.dataset.key);
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
  // Membres via leurs teams sélectionnées
  const memberIds = new Set(
    _slots.filter(s => _selected.has(s.team_id)).map(s => s.membre_id)
  );

  // Membres sans team sélectionnés individuellement
  for (const k of _selected) {
    if (isMId(k)) memberIds.add(rawId(k));
  }

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
    supabase.from('membres').select('id,nom,spe,classe,rio,ilvl,cle_donjon,cle_niveau,can_trade')
  );
  if (!membres) return;

  _membres = membres;
  updateBadges();
  document.dispatchEvent(new CustomEvent('coverage:changed'));
}
