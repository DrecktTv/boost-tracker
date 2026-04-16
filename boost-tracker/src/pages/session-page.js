import { getSetupData, getAllMembres, setSelection } from '../ui/coverage.js';
import { escHtml } from '../lib/utils.js';
import { isMember } from '../lib/state.js';
import { speColor, roleImg } from '../ui/components.js';
import { DUNGEON_LBL, TRADE_SLOTS, CLASS_EN } from '../constants.js';

// ── State ──────────────────────────────────────────────────────────────────────

let _mode           = 'team';
let _selectedTeamId = null;
let _manualKeys     = new Set();   // m:{id}
let _altKeys        = new Set();   // m:{id}
let _swaps          = new Map();   // mainId → altId
let _swapOpen       = null;        // mainId dont le picker est ouvert

const SESSION_LS = 'kc_session_state';

function saveState() {
  try {
    localStorage.setItem(SESSION_LS, JSON.stringify({
      mode:   _mode,
      teamId: _selectedTeamId,
      manual: [..._manualKeys],
      alts:   [..._altKeys],
      swaps:  [..._swaps],
    }));
  } catch { /* ignore */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(SESSION_LS);
    if (!raw) return;
    const s     = JSON.parse(raw);
    _mode           = s.mode   || 'team';
    _selectedTeamId = s.teamId || null;
    _manualKeys     = new Set(s.manual || []);
    _altKeys        = new Set(s.alts   || []);
    _swaps          = new Map(Array.isArray(s.swaps) ? s.swaps : []);
  } catch { /* ignore */ }
}

// ── Getters ────────────────────────────────────────────────────────────────────

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

/** Roster effectif : swaps appliqués, _original = membre remplacé */
function getEffectiveRoster() {
  const { membres } = getSetupData();
  return getMainMembers().map(m => {
    const altId = _swaps.get(m.id);
    if (!altId) return { ...m, _original: null };
    const alt = membres.find(x => x.id === altId);
    return alt ? { ...alt, _original: m } : { ...m, _original: null };
  });
}

/** Alts disponibles pour swapper un slot (exclut ceux déjà utilisés ailleurs) */
function getAvailableAltsForSwap(mainId) {
  const { membres } = getSetupData();
  const altIds     = new Set([..._altKeys].map(k => k.replace('m:', '')));
  const usedAltIds = new Set([..._swaps.entries()]
    .filter(([k]) => k !== mainId).map(([, v]) => v));
  return membres.filter(m => altIds.has(m.id) && !usedAltIds.has(m.id));
}

// ── Sign text ──────────────────────────────────────────────────────────────────

const ROLE_ORDER = { TANK: 0, Heal: 1 };

function formatTrade(canTrade) {
  try {
    let tradable = new Set(), na = new Set();
    if (canTrade) {
      const p = JSON.parse(canTrade);
      if (Array.isArray(p)) { tradable = new Set(p); }
      else { tradable = new Set(p.t || []); na = new Set(p.na || []); }
    }
    const cant = TRADE_SLOTS.filter(s => !tradable.has(s.key) && !na.has(s.key));
    if (!cant.length) return 'Can trade all';
    return `Can't trade: ${cant.map(s => s.short).join(', ')}`;
  } catch { return "Can't trade"; }
}

function memberKey(m) {
  return (m.cle_donjon && m.cle_niveau)
    ? `+${m.cle_niveau} ${DUNGEON_LBL[m.cle_donjon] || m.cle_donjon}`
    : 'no key';
}

function generateSignText() {
  const effective  = getEffectiveRoster();
  const usedAltIds = new Set(_swaps.values());
  const altsWithKey = getAltMembers()
    .filter(m => !usedAltIds.has(m.id) && m.cle_donjon && m.cle_niveau);

  const sorted = [...effective].sort((a, b) => (ROLE_ORDER[a.spe] ?? 2) - (ROLE_ORDER[b.spe] ?? 2));

  const lines = sorted.map(m => {
    const roleTag = m.spe === 'TANK' ? ':Tank:' : m.spe === 'Heal' ? ':Heal:' : ':DPS:';
    const clsFr   = m.classe?.split(' ')[0] || m.nom;
    const cls     = (CLASS_EN[clsFr] || clsFr).padEnd(14);
    const rio     = m.rio || '?';
    const ilvlStr = m.ilvl ? `${m.ilvl} ilvl` : '';
    const trade   = formatTrade(m.can_trade);
    return `${roleTag}  ${cls} / :Raiderio: ${rio} / :Keystone: ${memberKey(m)} / ${ilvlStr}  / ${trade}`;
  });

  if (altsWithKey.length) {
    const altList = altsWithKey.map(m => {
      const role = m.spe === 'TANK' ? 'Tank' : m.spe === 'Heal' ? 'Heal' : 'DPS';
      const ilvl = m.ilvl ? ` ${m.ilvl}ilvl` : '';
      return `${role}${ilvl} ${memberKey(m)}`;
    }).join(' / ');
    lines.push(`\nAlt Keys: ${altList}`);
  }

  const isFull = (_mode === 'team' && _selectedTeamId) || _manualKeys.size >= 4;
  return (isFull ? 'TT\n' : '') + lines.join('\n');
}

// ── Badges helpers ─────────────────────────────────────────────────────────────

function keyBadge(m) {
  if (!m.cle_donjon || !m.cle_niveau)
    return `<span class="sess-badge sess-badge-nokey">No key</span>`;
  return `<span class="sess-badge sess-badge-key">+${m.cle_niveau} ${DUNGEON_LBL[m.cle_donjon] || m.cle_donjon}</span>`;
}

function ilvlBadge(m) {
  return m.ilvl ? `<span class="sess-badge sess-badge-ilvl">${m.ilvl}</span>` : '';
}

function tradeBadge(canTrade) {
  try {
    if (!canTrade) return '';
    let tradable = new Set(), na = new Set();
    const p = JSON.parse(canTrade);
    if (Array.isArray(p)) tradable = new Set(p);
    else { tradable = new Set(p.t || []); na = new Set(p.na || []); }
    const cant = TRADE_SLOTS.filter(s => !tradable.has(s.key) && !na.has(s.key));
    if (!cant.length) return `<span class="sess-badge sess-badge-trade-all">Trade all</span>`;
    if (cant.length <= 3) return `<span class="sess-badge sess-badge-trade-no" title="Can't trade: ${cant.map(s => s.short).join(', ')}">No ${cant.map(s => s.short).join(' ')}</span>`;
    return `<span class="sess-badge sess-badge-trade-no" title="Can't trade: ${cant.map(s => s.short).join(', ')}">No trade</span>`;
  } catch { return ''; }
}

// ── Condensed row helpers (partagés avec config) ───────────────────────────────

function condensedBadges(m) {
  const roleTag = m.spe === 'TANK' ? 'Tank' : m.spe === 'Heal' ? 'Heal' : 'DPS';
  const ilvlStr = m.ilvl ? `<span class="smr-badge">${m.ilvl}</span>` : '';
  const keyStr  = (m.cle_donjon && m.cle_niveau)
    ? `<span class="smr-badge smr-badge-key">+${m.cle_niveau} ${DUNGEON_LBL[m.cle_donjon] || m.cle_donjon}</span>`
    : '';
  return `<span class="smr-badge smr-badge-role">${roleTag}</span>${ilvlStr}${keyStr}`;
}

function condensedRowHtml(m, inputClass, dataKey, checked, disabled = false) {
  const color = speColor(m.classe || '');
  const role  = m.spe === 'TANK' ? 'TANK' : m.spe === 'Heal' ? 'Heal' : 'DPS';
  return `
  <label class="smr${checked ? ' smr-selected' : ''}${disabled ? ' smr-disabled' : ''}">
    <input type="checkbox" class="${inputClass}" data-key="${escHtml(dataKey)}"
      ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
    <span class="smr-bar" style="background:${color}"></span>
    ${roleImg(role, 18)}
    <span class="smr-name">${escHtml(m.nom)}</span>
    <div class="smr-right">${condensedBadges(m)}</div>
  </label>`;
}

// ── Render roster panel ────────────────────────────────────────────────────────

function renderRosterPanel() {
  const effective = getEffectiveRoster();

  if (!effective.length) {
    return `<section class="sess-panel sess-roster-panel">
      <div class="sess-panel-head">
        <span class="sess-panel-title">Roster actif</span>
      </div>
      <div class="sess-empty-state">
        <div class="sess-empty-icon">⚡</div>
        <p>Aucune session configurée.<br>Choisis ton roster ci-dessous et clique sur <strong>Appliquer</strong>.</p>
      </div>
    </section>`;
  }

  const usedAltIds    = new Set(_swaps.values());
  const remainingAlts = getAltMembers().filter(m => !usedAltIds.has(m.id));
  const sorted        = [...effective].sort((a, b) => (ROLE_ORDER[a.spe] ?? 2) - (ROLE_ORDER[b.spe] ?? 2));

  const memberRows = sorted.map(m => {
    const color    = speColor(m.classe || '');
    const role     = m.spe === 'TANK' ? 'TANK' : m.spe === 'Heal' ? 'Heal' : 'DPS';
    const isSwap   = !!m._original;
    const pickerId = isSwap ? m._original.id : m.id;
    const isOpen   = _swapOpen === pickerId;
    const avails   = getAvailableAltsForSwap(pickerId);

    const pickerHtml = isOpen ? `
      <div class="sess-swap-picker">
        ${avails.length ? avails.map(a => {
          const ac = speColor(a.classe || '');
          const ar = a.spe === 'TANK' ? 'TANK' : a.spe === 'Heal' ? 'Heal' : 'DPS';
          return `<button class="sess-alt-pick" data-main-id="${escHtml(pickerId)}" data-alt-id="${escHtml(a.id)}">
            <span class="sess-pick-dot" style="background:${ac}"></span>
            ${roleImg(ar, 14)}
            <span class="sess-pick-name">${escHtml(a.nom)}</span>
            ${ilvlBadge(a)}${keyBadge(a)}
          </button>`;
        }).join('') : `<span class="sess-pick-empty">Aucun alt disponible</span>`}
        ${isSwap ? `<button class="sess-cancel-swap" data-main-id="${escHtml(pickerId)}">✕ Annuler le swap</button>` : ''}
      </div>` : '';

    return `<div class="sess-member-row${isSwap ? ' sess-member-swapped' : ''}">
      <span class="sess-member-bar" style="background:${color}"></span>
      ${roleImg(role, 16)}
      <div class="sess-member-info">
        <span class="sess-member-name">${escHtml(m.nom)}</span>
        ${m.classe ? `<span class="sess-member-cls">${escHtml(m.classe.split(' ')[0])}</span>` : ''}
        ${isSwap ? `<span class="sess-swap-lbl">remplace ${escHtml(m._original.nom)}</span>` : ''}
      </div>
      <div class="sess-member-badges">
        ${ilvlBadge(m)}${keyBadge(m)}${tradeBadge(m.can_trade)}
      </div>
      <button class="sess-swap-btn${isOpen ? ' active' : ''}" data-swap-id="${escHtml(pickerId)}" title="Swapper ce joueur">↕</button>
      ${pickerHtml}
    </div>`;
  }).join('');

  const altRows = remainingAlts.length ? remainingAlts.map(m => {
    const color = speColor(m.classe || '');
    const role  = m.spe === 'TANK' ? 'TANK' : m.spe === 'Heal' ? 'Heal' : 'DPS';
    return `<div class="sess-alt-row">
      <span class="sess-member-bar" style="background:${color}"></span>
      ${roleImg(role, 14)}
      <span class="sess-alt-name">${escHtml(m.nom)}</span>
      <div class="sess-member-badges">${ilvlBadge(m)}${keyBadge(m)}${tradeBadge(m.can_trade)}</div>
    </div>`;
  }).join('') : '';

  return `<section class="sess-panel sess-roster-panel">
    <div class="sess-panel-head">
      <span class="sess-panel-title">Roster actif</span>
      <button class="sess-copy-btn" id="sess-copy-btn">📋 Copier le texte</button>
    </div>
    <div class="sess-main-list">${memberRows}</div>
    ${altRows ? `<div class="sess-alts-section">
      <div class="sess-section-lbl">Alts disponibles</div>
      <div class="sess-alts-list">${altRows}</div>
    </div>` : ''}
  </section>`;
}

// ── Render config panel ────────────────────────────────────────────────────────

function renderConfigPanel() {
  const { teams, slots, membres: allM } = getSetupData();

  // Team cards
  const teamCards = teams.map(t => {
    const tMembres  = slots.filter(s => s.team_id === t.id)
      .map(s => allM.find(m => m.id === s.membre_id)).filter(Boolean);
    const isSelected = _mode === 'team' && _selectedTeamId === t.id;

    const memberRows = tMembres.map(m => {
      const color = speColor(m.classe || '');
      const role  = m.spe === 'TANK' ? 'TANK' : m.spe === 'Heal' ? 'Heal' : 'DPS';
      return `<div class="stc-member">
        <span class="stc-member-bar" style="background:${color}"></span>
        ${roleImg(role, 14)}
        <span class="stc-member-name">${escHtml(m.nom)}</span>
        <div class="stc-member-right">${condensedBadges(m)}</div>
      </div>`;
    }).join('');

    return `<label class="stc${isSelected ? ' stc-selected' : ''}">
      <input type="radio" name="sess-team" class="sess-team-radio" value="${escHtml(t.id)}"
        ${isSelected ? 'checked' : ''} style="display:none">
      <div class="stc-head">
        <span class="stc-icon">🐗</span>
        <span class="stc-name">${escHtml(t.nom)}</span>
        <span class="stc-count">${tMembres.length} membre${tMembres.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="stc-members">${memberRows || '<span class="stc-empty">Aucun membre</span>'}</div>
    </label>`;
  }).join('');

  // Manual list
  const manualCount = _manualKeys.size;
  const manualItems = allM.map(m => {
    const k       = `m:${m.id}`;
    const checked  = _manualKeys.has(k);
    const disabled = !checked && manualCount >= 4;
    return condensedRowHtml(m, 'sess-manual-cb', k, checked, disabled);
  }).join('');

  // Alts config — membres hors roster principal
  const mainIds = new Set();
  if (_mode === 'team' && _selectedTeamId) {
    slots.filter(s => s.team_id === _selectedTeamId).forEach(s => mainIds.add(s.membre_id));
  } else {
    _manualKeys.forEach(k => mainIds.add(k.replace('m:', '')));
  }
  const availForAlts = allM.filter(m => !mainIds.has(m.id));
  const altItems = availForAlts.map(m => {
    const k = `m:${m.id}`;
    return condensedRowHtml(m, 'sess-alt-cb', k, _altKeys.has(k));
  }).join('');

  return `<section class="sess-panel sess-config-panel">
    <div class="sess-panel-head">
      <span class="sess-panel-title">Configuration</span>
    </div>

    <div class="setup-mode-tabs">
      <button class="setup-mode-tab${_mode === 'team'   ? ' active' : ''}" data-mode="team">Team</button>
      <button class="setup-mode-tab${_mode === 'manual' ? ' active' : ''}" data-mode="manual">Composition manuelle</button>
    </div>

    <div class="sess-config-body">
      ${_mode === 'team'
        ? `<div class="setup-team-grid">${teamCards || '<p class="setup-empty">Aucune team enregistrée.</p>'}</div>`
        : `<p class="setup-hint"><strong>${manualCount}/4</strong> sélectionnés</p>
           <div class="setup-smr-list">${manualItems}</div>`
      }
    </div>

    ${availForAlts.length ? `
    <div class="sess-alts-config">
      <div class="sess-section-lbl">Alts potentiels</div>
      <div class="setup-smr-list">${altItems}</div>
    </div>` : ''}

    <div class="sess-config-foot">
      <button class="btn btn-primary" id="sess-apply-btn">⚡ Appliquer la session</button>
    </div>
  </section>`;
}

// ── Page entry point ───────────────────────────────────────────────────────────

export function renderSession() {
  const page = document.getElementById('page-session');
  if (!page) return;
  if (!isMember()) {
    page.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><p>Accès réservé aux membres.</p></div>';
    return;
  }

  loadState();

  page.innerHTML = `
    <div class="page-head"><span class="page-title">Session</span></div>
    <div class="sess-layout">
      ${renderRosterPanel()}
      ${renderConfigPanel()}
    </div>`;

  wireListeners(page);
}

// ── Event wiring ───────────────────────────────────────────────────────────────

function wireListeners(page) {
  // Mode tabs
  page.querySelectorAll('.setup-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _mode = btn.dataset.mode;
      if (_mode === 'team') _manualKeys = new Set();
      renderSession();
    });
  });

  // Team radio / card click
  page.querySelectorAll('.sess-team-radio').forEach(radio => {
    radio.addEventListener('change', () => { _selectedTeamId = radio.value; renderSession(); });
  });
  page.querySelectorAll('.stc').forEach(card => {
    card.addEventListener('click', () => {
      const radio = card.querySelector('.sess-team-radio');
      if (radio && _mode === 'team') { _selectedTeamId = radio.value; renderSession(); }
    });
  });

  // Manual checkboxes
  page.querySelectorAll('.sess-manual-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _manualKeys.add(cb.dataset.key);
      else _manualKeys.delete(cb.dataset.key);
      renderSession();
    });
  });

  // Alt checkboxes (config)
  page.querySelectorAll('.sess-alt-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _altKeys.add(cb.dataset.key);
      else _altKeys.delete(cb.dataset.key);
      cb.closest('.smr')?.classList.toggle('smr-selected', cb.checked);
    });
  });

  // Apply
  page.querySelector('#sess-apply-btn')?.addEventListener('click', () => {
    _swaps = new Map();
    applyAndSave();
    renderSession();
  });

  // Copy sign text
  page.querySelector('#sess-copy-btn')?.addEventListener('click', async () => {
    const btn = page.querySelector('#sess-copy-btn');
    try {
      await navigator.clipboard.writeText(generateSignText());
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '✓ Copié !';
        btn.classList.add('sign-copy-ok');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('sign-copy-ok'); }, 2000);
      }
    } catch { /* ignore */ }
  });

  // Swap button (toggle picker)
  page.querySelectorAll('.sess-swap-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.swapId;
      _swapOpen = _swapOpen === id ? null : id;
      renderSession();
    });
  });

  // Alt pick (inside picker)
  page.querySelectorAll('.sess-alt-pick').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _swaps.set(btn.dataset.mainId, btn.dataset.altId);
      _swapOpen = null;
      applyAndSave();
      renderSession();
    });
  });

  // Cancel swap
  page.querySelectorAll('.sess-cancel-swap').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _swaps.delete(btn.dataset.mainId);
      _swapOpen = null;
      applyAndSave();
      renderSession();
    });
  });

  // Close picker on click outside
  if (_swapOpen) {
    const onOutside = () => { _swapOpen = null; renderSession(); };
    document.addEventListener('click', onOutside, { once: true });
  }
}

function applyAndSave() {
  if (_mode === 'team' && _selectedTeamId) {
    setSelection([_selectedTeamId, ..._altKeys]);
  } else {
    setSelection([..._manualKeys, ..._altKeys]);
  }
  saveState();
}
