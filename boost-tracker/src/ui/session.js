import { getSetupData, getAllMembres, setSelection } from './coverage.js';
import { escHtml }  from '../lib/utils.js';
import { isMember } from '../lib/state.js';
import { oov, cov } from './modal.js';

// ── State wizard ───────────────────────────────────────────────────────────────
let _step        = 1;           // 1 | 2
let _mode        = 'team';      // 'team' | 'manual'
let _selectedTeamId  = null;    // ID de la team choisie
let _manualKeys  = new Set();   // m:{id} pour composition manuelle
let _altKeys     = new Set();   // m:{id} pour les ALTs potentiels (étape 2)

// ── Init ───────────────────────────────────────────────────────────────────────

export function initSession() {
  const wrap = document.getElementById('session-btn-wrap');
  if (!wrap || !isMember()) return;
  wrap.style.display = '';
  document.getElementById('btn-setup-session')?.addEventListener('click', openSetupModal);
}

// ── Ouvre la modale ────────────────────────────────────────────────────────────

function openSetupModal() {
  _step = 1;
  renderStep();
  oov('ov-setup-session');
}

// ── Dispatch ───────────────────────────────────────────────────────────────────

function renderStep() {
  const body = document.getElementById('setup-session-body');
  if (!body) return;
  if (_step === 1) renderStep1(body);
  if (_step === 2) renderStep2(body);
}

// ── Étape 1 : Team principale ou Composition manuelle ─────────────────────────

function renderStep1(body) {
  const { teams } = getSetupData();
  const membres   = getAllMembres();

  // Sélecteur : une team OU composition manuelle
  const teamOptions = teams.map(t => `
    <label class="setup-item${_mode === 'team' && _selectedTeamId === t.id ? ' setup-item-selected' : ''}">
      <input type="radio" name="setup-team" class="setup-radio" value="${escHtml(t.id)}"
        ${_mode === 'team' && _selectedTeamId === t.id ? 'checked' : ''}>
      <span class="setup-item-name">🐗 ${escHtml(t.nom)}</span>
    </label>`).join('');

  const manualCount = _manualKeys.size;
  const manualItems = membres.map(m => {
    const k        = `m:${m.id}`;
    const checked  = _manualKeys.has(k);
    const disabled = !checked && manualCount >= 4;
    const icon     = m.spe === 'TANK' ? '🛡' : m.spe === 'Heal' ? '💚' : '⚔';
    const cls      = m.classe?.split(' ')[0] || '';
    const stats    = [m.ilvl ? `${m.ilvl} ilvl` : '', m.rio ? `${m.rio} rio` : ''].filter(Boolean).join(' · ');
    return `<label class="setup-item${disabled ? ' setup-item-disabled' : ''}${checked ? ' setup-item-selected' : ''}">
      <input type="checkbox" class="setup-manual-cb" data-key="${escHtml(k)}"
        ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span class="setup-item-name">${icon} ${escHtml(m.nom)}</span>
      <span class="setup-item-cls">${escHtml(cls)}</span>
      ${stats ? `<span class="setup-item-stats">${stats}</span>` : ''}
    </label>`;
  }).join('');

  body.innerHTML = `
    <div class="setup-wizard-head">
      <span class="setup-step-lbl">Étape 1 sur 2</span>
      <span class="setup-step-title">Roster principal</span>
    </div>

    <div class="setup-mode-tabs">
      <button class="setup-mode-tab${_mode === 'team'   ? ' active' : ''}" data-mode="team">Team</button>
      <button class="setup-mode-tab${_mode === 'manual' ? ' active' : ''}" data-mode="manual">Composition manuelle</button>
    </div>

    <div id="setup-mode-content">
      ${_mode === 'team' ? `
        <div class="setup-items">${teamOptions || '<p class="setup-empty">Aucune team enregistrée.</p>'}</div>
      ` : `
        <p class="setup-hint"><strong>${manualCount}/4</strong> personnages sélectionnés</p>
        <div class="setup-items">${manualItems}</div>
      `}
    </div>

    <div class="setup-foot">
      <button class="btn btn-ghost" data-close="ov-setup-session">Annuler</button>
      <button class="btn btn-primary" id="setup-next">Suivant →</button>
    </div>`;

  // Onglets mode
  body.querySelectorAll('.setup-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _mode = btn.dataset.mode;
      renderStep1(body);
    });
  });

  // Radio teams
  body.querySelectorAll('.setup-radio').forEach(radio => {
    radio.addEventListener('change', () => { _selectedTeamId = radio.value; });
  });

  // Checkboxes composition manuelle
  body.querySelectorAll('.setup-manual-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _manualKeys.add(cb.dataset.key);
      else _manualKeys.delete(cb.dataset.key);
      renderStep1(body);
    });
  });

  // Suivant
  body.querySelector('#setup-next')?.addEventListener('click', () => {
    if (_mode === 'team' && !_selectedTeamId) return;
    if (_mode === 'manual' && _manualKeys.size === 0) return;
    _step = 2;
    renderStep();
  });
}

// ── Étape 2 : ALTs potentiels ──────────────────────────────────────────────────

function renderStep2(body) {
  // Exclure les membres déjà dans la sélection principale
  const { teams, keyOf } = getSetupData();
  const allMembres = getAllMembres();

  // IDs déjà dans le roster principal
  const mainIds = new Set();
  if (_mode === 'team' && _selectedTeamId) {
    const { _slots } = getSetupData(); // on récupère via getAllMembres
    // On utilise getAllMembres() côté couverture — les slots sont dans getSetupData
  }
  // Simplification : on inclut tout le monde dans step 2, l'utilisateur choisit
  const altItems = allMembres.map(m => {
    const k       = `m:${m.id}`;
    const checked = _altKeys.has(k);
    const icon    = m.spe === 'TANK' ? '🛡' : m.spe === 'Heal' ? '💚' : '⚔';
    const cls     = m.classe?.split(' ')[0] || '';
    const stats   = [m.ilvl ? `${m.ilvl} ilvl` : '', m.rio ? `${m.rio} rio` : ''].filter(Boolean).join(' · ');
    return `<label class="setup-item${checked ? ' setup-item-selected' : ''}">
      <input type="checkbox" class="setup-alt-cb" data-key="${escHtml(k)}" ${checked ? 'checked' : ''}>
      <span class="setup-item-name">${icon} ${escHtml(m.nom)}</span>
      <span class="setup-item-cls">${escHtml(cls)}</span>
      ${stats ? `<span class="setup-item-stats">${stats}</span>` : ''}
    </label>`;
  }).join('');

  body.innerHTML = `
    <div class="setup-wizard-head">
      <span class="setup-step-lbl">Étape 2 sur 2</span>
      <span class="setup-step-title">ALTs potentiels</span>
    </div>
    <p class="setup-hint">Personnages susceptibles de rejoindre la session en remplacement.</p>
    <div class="setup-items">${altItems}</div>
    <div class="setup-foot">
      <button class="btn btn-ghost" id="setup-back">← Retour</button>
      <button class="btn btn-primary" id="setup-validate">Valider</button>
    </div>`;

  body.querySelectorAll('.setup-alt-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _altKeys.add(cb.dataset.key);
      else _altKeys.delete(cb.dataset.key);
      // Highlight sans re-render
      cb.closest('.setup-item')?.classList.toggle('setup-item-selected', cb.checked);
    });
  });

  body.querySelector('#setup-back')?.addEventListener('click', () => { _step = 1; renderStep(); });

  body.querySelector('#setup-validate')?.addEventListener('click', () => {
    applySelection();
    cov('ov-setup-session');
  });
}

// ── Applique la sélection finale ───────────────────────────────────────────────

function applySelection() {
  if (_mode === 'team' && _selectedTeamId) {
    setSelection([_selectedTeamId, ..._altKeys]);
  } else {
    setSelection([..._manualKeys, ..._altKeys]);
  }
}
