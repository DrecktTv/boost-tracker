import { getSetupData, getAllMembres, setSelection, getSelectedMembers } from './coverage.js';
import { escHtml }  from '../lib/utils.js';
import { isMember } from '../lib/state.js';
import { oov, cov } from './modal.js';
import { speColor, roleImg } from './components.js';
import { DUNGEON_LBL, TRADE_SLOTS, CLASS_EN } from '../constants.js';

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

// ── Helper membre row ──────────────────────────────────────────────────────────

function memberRowHtml(m, inputType, inputClass, dataKey, checked, disabled) {
  const color = speColor(m.classe || '');
  const role  = m.spe === 'TANK' ? 'TANK' : m.spe === 'Heal' ? 'Heal' : 'DPS';
  const cls   = m.classe?.split(' ')[0] || '';
  const stats = [];
  if (m.ilvl) stats.push(`<span class="smr-badge">${m.ilvl} ilvl</span>`);
  if (m.rio)  stats.push(`<span class="smr-badge smr-badge-rio">${m.rio} rio</span>`);

  return `
  <label class="smr${checked ? ' smr-selected' : ''}${disabled ? ' smr-disabled' : ''}">
    <input type="${inputType}" class="${inputClass}" data-key="${escHtml(dataKey)}"
      ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
    <span class="smr-bar" style="background:${color}"></span>
    ${roleImg(role, 18)}
    <span class="smr-name">${escHtml(m.nom)}</span>
    <div class="smr-right">
      <span class="smr-cls">${escHtml(cls)}</span>
      ${stats.join('')}
    </div>
  </label>`;
}

// ── Étape 1 : Team principale ou Composition manuelle ─────────────────────────

function renderStep1(body) {
  const { teams, slots, membres: allM } = getSetupData();

  // Helper : membres d'une team
  const teamMembers = (teamId) => {
    const ids = slots.filter(s => s.team_id === teamId).map(s => s.membre_id);
    return ids.map(id => allM.find(m => m.id === id)).filter(Boolean);
  };

  // Cards team
  const teamOptions = teams.map(t => {
    const tMembers = teamMembers(t.id);
    const isSelected = _mode === 'team' && _selectedTeamId === t.id;

    const memberRows = tMembers.map(m => {
      const color = speColor(m.classe || '');
      const role  = m.spe === 'TANK' ? 'TANK' : m.spe === 'Heal' ? 'Heal' : 'DPS';
      const cls   = m.classe?.split(' ')[0] || '';
      return `
      <div class="stc-member">
        <span class="stc-member-bar" style="background:${color}"></span>
        ${roleImg(role, 16)}
        <span class="stc-member-name">${escHtml(m.nom)}</span>
        <span class="stc-member-cls">${escHtml(cls)}</span>
      </div>`;
    }).join('');

    return `
    <label class="stc${isSelected ? ' stc-selected' : ''}">
      <input type="radio" name="setup-team" class="setup-radio" value="${escHtml(t.id)}"
        ${isSelected ? 'checked' : ''} style="display:none">
      <div class="stc-head">
        <span class="stc-icon">🐗</span>
        <span class="stc-name">${escHtml(t.nom)}</span>
        <span class="stc-count">${tMembers.length} membre${tMembers.length > 1 ? 's' : ''}</span>
      </div>
      <div class="stc-members">${memberRows || '<span class="stc-empty">Aucun membre</span>'}</div>
    </label>`;
  }).join('');

  // Rows composition manuelle
  const manualCount = _manualKeys.size;
  const manualItems = allM.map(m => {
    const k        = `m:${m.id}`;
    const checked  = _manualKeys.has(k);
    const disabled = !checked && manualCount >= 4;
    return memberRowHtml(m, 'checkbox', 'setup-manual-cb', k, checked, disabled);
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
        <div class="setup-team-grid">${teamOptions || '<p class="setup-empty">Aucune team enregistrée.</p>'}</div>
      ` : `
        <p class="setup-hint"><strong>${manualCount}/4</strong> personnages sélectionnés</p>
        <div class="setup-smr-list">${manualItems}</div>
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
    radio.addEventListener('change', () => { _selectedTeamId = radio.value; renderStep1(body); });
  });
  // Clic sur la card entière
  body.querySelectorAll('.stc').forEach(card => {
    card.addEventListener('click', () => {
      const radio = card.querySelector('.setup-radio');
      if (radio) { _selectedTeamId = radio.value; renderStep1(body); }
    });
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
  const { slots } = getSetupData();
  const allMembres = getAllMembres();

  // IDs déjà dans le roster principal → à exclure
  const mainIds = new Set();
  if (_mode === 'team' && _selectedTeamId) {
    slots.filter(s => s.team_id === _selectedTeamId).forEach(s => mainIds.add(s.membre_id));
  } else {
    _manualKeys.forEach(k => mainIds.add(k.replace('m:', '')));
  }

  const available = allMembres.filter(m => !mainIds.has(m.id));

  // Retirer de _altKeys les membres qui sont maintenant dans le roster principal
  _altKeys.forEach(k => { if (mainIds.has(k.replace('m:', ''))) _altKeys.delete(k); });

  const altItems = available.length
    ? available.map(m => {
        const k       = `m:${m.id}`;
        const checked = _altKeys.has(k);
        return memberRowHtml(m, 'checkbox', 'setup-alt-cb', k, checked, false);
      }).join('')
    : '<p class="setup-empty">Tous les personnages sont déjà dans le roster principal.</p>';

  body.innerHTML = `
    <div class="setup-wizard-head">
      <span class="setup-step-lbl">Étape 2 sur 2</span>
      <span class="setup-step-title">ALTs potentiels</span>
    </div>
    <p class="setup-hint">Personnages susceptibles de rejoindre la session en remplacement.</p>
    <div class="setup-smr-list">${altItems}</div>
    <div class="setup-foot">
      <button class="btn btn-ghost" id="setup-back">← Retour</button>
      <button class="btn btn-primary" id="setup-validate">Valider</button>
    </div>`;

  body.querySelectorAll('.setup-alt-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _altKeys.add(cb.dataset.key);
      else _altKeys.delete(cb.dataset.key);
      cb.closest('.smr')?.classList.toggle('smr-selected', cb.checked);
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
  renderSignWidget();
}

// ── Génère le texte signe Discord ─────────────────────────────────────────────

const ROLE_ORDER = { TANK: 0, Heal: 1 };
const SLOT_SHORT  = Object.fromEntries(TRADE_SLOTS.map(s => [s.key, s.short]));

function formatTrade(canTrade) {
  try {
    const tradable = canTrade ? new Set(JSON.parse(canTrade)) : new Set();
    if (tradable.size === TRADE_SLOTS.length) return 'Can trade all';
    const missing = TRADE_SLOTS.filter(s => !tradable.has(s.key)).map(s => s.short);
    if (!missing.length) return 'Can trade all';
    return `Can't trade: ${missing.join(', ')}`;
  } catch {
    return "Can't trade";
  }
}

function memberKey(m) {
  return (m.cle_donjon && m.cle_niveau)
    ? `+${m.cle_niveau} ${DUNGEON_LBL[m.cle_donjon] || m.cle_donjon}`
    : 'no key';
}

function generateSignText(mainMembers, altMembers) {
  const sorted = [...mainMembers].sort((a, b) => {
    return (ROLE_ORDER[a.spe] ?? 2) - (ROLE_ORDER[b.spe] ?? 2);
  });

  const lines = sorted.map(m => {
    const roleTag = m.spe === 'TANK' ? ':Tank:' : m.spe === 'Heal' ? ':Heal:' : ':DPS:';
    const clsFr   = m.classe?.split(' ')[0] || m.nom;
    const cls     = (CLASS_EN[clsFr] || clsFr).padEnd(14);
    const rio     = m.rio ? m.rio : '?';
    const ilvlStr = m.ilvl ? `${m.ilvl} ilvl` : '';
    const trade   = formatTrade(m.can_trade);
    return `${roleTag}  ${cls} / :Raiderio: ${rio} / :Keystone: ${memberKey(m)} / ${ilvlStr}  / ${trade}`;
  });

  if (altMembers.length) {
    const altKeys = altMembers.map(m => memberKey(m)).join(', ');
    lines.push(`\nAlt Keys: ${altKeys}`);
  }

  return lines.join('\n');
}

// ── Membres du roster principal seulement (sans les ALTs) ─────────────────────

function getMainMembers() {
  const { slots, membres } = getSetupData();
  const mainIds = new Set();
  if (_mode === 'team' && _selectedTeamId) {
    slots.filter(s => s.team_id === _selectedTeamId).forEach(s => mainIds.add(s.membre_id));
  } else {
    _manualKeys.forEach(k => mainIds.add(k.replace('m:', '')));
  }
  return membres.filter(m => mainIds.has(m.id));
}

function getAltMembers() {
  const { membres } = getSetupData();
  const altIds = new Set([..._altKeys].map(k => k.replace('m:', '')));
  return membres.filter(m => altIds.has(m.id));
}

// ── Widget signe dans la sidebar ───────────────────────────────────────────────

export function renderSignWidget() {
  const wrap = document.getElementById('session-sign-wrap');
  if (!wrap) return;

  const members = getMainMembers();
  if (!members.length) { wrap.style.display = 'none'; return; }
  const alts = getAltMembers();

  const text = generateSignText(members, alts);

  wrap.style.display = '';
  wrap.innerHTML = `
    <div class="sign-widget">
      <div class="sign-widget-head">
        <span class="sign-widget-lbl">📋 Signe · ${members.length} membres</span>
        <button class="sign-copy-btn" id="btn-copy-sign">Copier</button>
      </div>
      <textarea class="sign-textarea" id="sign-text" readonly spellcheck="false">${escHtml(text)}</textarea>
    </div>`;

  wrap.querySelector('#btn-copy-sign')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      const btn = wrap.querySelector('#btn-copy-sign');
      btn.textContent = '✓ Copié !';
      btn.classList.add('sign-copy-ok');
      setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('sign-copy-ok'); }, 2000);
    } catch { /* ignore */ }
  });
}
