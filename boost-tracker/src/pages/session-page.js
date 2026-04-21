import { getSetupData, getAllMembres, setSelection } from '../ui/coverage.js';
import { escHtml } from '../lib/utils.js';
import { isMember } from '../lib/state.js';
import { speColor, roleImg } from '../ui/components.js';
import { DUNGEON_LBL, TRADE_SLOTS, CLASS_EN } from '../constants.js';

// ── State ──────────────────────────────────────────────────────────────────────

let _step           = 1;        // 1 | 2 | 'roster'
let _mode           = 'team';   // 'team' | 'manual'
let _selectedTeamId = null;
let _manualKeys     = new Set();
let _altKeys        = new Set();
let _swaps          = new Map(); // mainId → altId
let _swapOpen       = null;      // mainId dont le picker est ouvert

const SESSION_LS = 'kc_session_state';

function saveState() {
  try {
    localStorage.setItem(SESSION_LS, JSON.stringify({
      step:   _step,
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
    const s = JSON.parse(raw);
    _selectedTeamId = s.teamId || null;
    _manualKeys     = new Set(s.manual || []);
    _altKeys        = new Set(s.alts   || []);
    _swaps          = new Map(Array.isArray(s.swaps) ? s.swaps : []);
    // Si une session était validée → on repart sur le roster avec le mode sauvé
    const hasConfig = (s.mode === 'team' && _selectedTeamId) || _manualKeys.size > 0;
    if (s.step === 'roster' && hasConfig) {
      _step = 'roster';
      _mode = s.mode || 'team';
    } else {
      // Sinon on repart toujours en étape 1, mode team par défaut
      _step = 1;
      _mode = 'team';
    }
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

function getEffectiveRoster() {
  const { membres } = getSetupData();
  return getMainMembers().map(m => {
    const altId = _swaps.get(m.id);
    if (!altId) return { ...m, _original: null };
    const alt = membres.find(x => x.id === altId);
    return alt ? { ...alt, _original: m } : { ...m, _original: null };
  });
}

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
      if (Array.isArray(p)) tradable = new Set(p);
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

  // Mentions Discord — si c'est un alt swappé, on prend le tag du main
  const discordMentions = sorted
    .map(m => {
      const tag = m._original?.discord_tag || m.discord_tag;
      return tag ? `@${tag}` : null;
    })
    .filter(Boolean)
    .join(' ');

  const isFull = (_mode === 'team' && _selectedTeamId) || _manualKeys.size >= 4;
  const body   = (isFull ? 'TT\n' : '') + lines.join('\n');
  return discordMentions ? `${body}\n\n${discordMentions}` : body;
}

// ── Badge helpers ──────────────────────────────────────────────────────────────

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
    const label = cant.length <= 3
      ? `No ${cant.map(s => s.short).join(' ')}`
      : 'No trade';
    return `<span class="sess-badge sess-badge-trade-no" title="Can't trade: ${cant.map(s => s.short).join(', ')}">${label}</span>`;
  } catch { return ''; }
}

// ── Condensed row (config steps) ──────────────────────────────────────────────

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

// ── Step indicator ─────────────────────────────────────────────────────────────

function stepIndicator(current) {
  const steps = [
    { n: 1, lbl: 'Roster principal' },
    { n: 2, lbl: 'Alts potentiels'  },
  ];
  return `<div class="sess-steps">
    ${steps.map(s => `
      <div class="sess-step${s.n === current ? ' active' : s.n < current ? ' done' : ''}">
        <span class="sess-step-n">${s.n < current ? '✓' : s.n}</span>
        <span class="sess-step-lbl">${s.lbl}</span>
      </div>
      ${s.n < steps.length ? '<div class="sess-step-line"></div>' : ''}
    `).join('')}
  </div>`;
}

function sessHero({ eye, title, sub, right = '' }) {
  return `<div class="sess-hero">
    <div class="sess-hero-inner">
      <div class="sess-hero-left">
        <div class="sess-eyebrow">${eye}</div>
        <h1 class="sess-h-title">${title}</h1>
        <p class="sess-h-sub">${sub}</p>
      </div>
      ${right ? `<div class="sess-h-right">${right}</div>` : ''}
    </div>
  </div>`;
}

// ── Step 1 : Roster principal ──────────────────────────────────────────────────

function renderStep1(page) {
  const { teams, slots, membres: allM } = getSetupData();

  const teamCards = teams.map(t => {
    const tMembres = slots.filter(s => s.team_id === t.id)
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
        <span class="stc-sel-dot"></span>
      </div>
      <div class="stc-members">${memberRows || '<span class="stc-empty">Aucun membre</span>'}</div>
    </label>`;
  }).join('');

  const manualCount = _manualKeys.size;
  const roleGroup = role => allM
    .filter(m => role === 'TANK' ? m.spe === 'TANK' : role === 'Heal' ? m.spe === 'Heal' : (m.spe !== 'TANK' && m.spe !== 'Heal'))
    .map(m => {
      const k       = `m:${m.id}`;
      const checked  = _manualKeys.has(k);
      const disabled = !checked && manualCount >= 4;
      return condensedRowHtml(m, 'sess-manual-cb', k, checked, disabled);
    }).join('');

  const manualItems = `
    <div class="sess-role-group">
      <div class="sess-role-lbl">Tank</div>
      <div class="setup-smr-list">${roleGroup('TANK') || '<p class="setup-empty">Aucun tank</p>'}</div>
    </div>
    <div class="sess-role-group">
      <div class="sess-role-lbl">Heal</div>
      <div class="setup-smr-list">${roleGroup('Heal') || '<p class="setup-empty">Aucun heal</p>'}</div>
    </div>
    <div class="sess-role-group">
      <div class="sess-role-lbl">DPS</div>
      <div class="setup-smr-list">${roleGroup('DPS') || '<p class="setup-empty">Aucun DPS</p>'}</div>
    </div>`;

  page.innerHTML = `
    <div class="sess-container">
      ${sessHero({
        eye:  'Étape 1 / 3 · Composition',
        title:'Qui compose la <em>session</em> ?',
        sub:  "Choisis une team enregistrée ou construis une composition manuelle avec 4 personnages (un tank, un heal, deux DPS).",
      })}
      ${stepIndicator(1)}

      <div class="setup-mode-tabs">
        <button class="setup-mode-tab${_mode === 'team'   ? ' active' : ''}" data-mode="team">Team</button>
        <button class="setup-mode-tab${_mode === 'manual' ? ' active' : ''}" data-mode="manual">Composition manuelle</button>
      </div>

      <div class="sess-step-body">
        ${_mode === 'team' ? `
          <div class="setup-team-grid">
            ${teamCards || '<p class="setup-empty">Aucune team enregistrée.</p>'}
          </div>
        ` : `
          <p class="setup-hint"><strong>${manualCount}/4</strong> personnages sélectionnés</p>
          ${manualItems}
        `}
      </div>

      <div class="sess-foot">
        <span></span>
        <button class="btn btn-primary" id="sess-next">Suivant →</button>
      </div>
    </div>`;

  // Mode tabs
  page.querySelectorAll('.setup-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _mode = btn.dataset.mode;
      if (_mode === 'team') _manualKeys = new Set();
      renderStep1(page);
    });
  });

  // Team radio / card click
  page.querySelectorAll('.sess-team-radio').forEach(r => {
    r.addEventListener('change', () => { _selectedTeamId = r.value; renderStep1(page); });
  });
  page.querySelectorAll('.stc').forEach(card => {
    card.addEventListener('click', () => {
      const r = card.querySelector('.sess-team-radio');
      if (r && _mode === 'team') { _selectedTeamId = r.value; renderStep1(page); }
    });
  });

  // Manual checkboxes
  page.querySelectorAll('.sess-manual-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _manualKeys.add(cb.dataset.key);
      else _manualKeys.delete(cb.dataset.key);
      renderStep1(page);
    });
  });

  // Suivant
  page.querySelector('#sess-next')?.addEventListener('click', () => {
    if (_mode === 'team' && !_selectedTeamId) return;
    if (_mode === 'manual' && _manualKeys.size === 0) return;
    _step = 2;
    renderStep2(page);
  });
}

// ── Step 2 : Alts potentiels ───────────────────────────────────────────────────

function altRowHtml(m) {
  const k       = `m:${m.id}`;
  const checked  = _altKeys.has(k);
  const color    = speColor(m.classe || '');
  const role     = m.spe === 'TANK' ? 'TANK' : m.spe === 'Heal' ? 'Heal' : 'DPS';
  const roleTag  = m.spe === 'TANK' ? 'Tank' : m.spe === 'Heal' ? 'Heal' : 'DPS';
  const ilvlStr  = m.ilvl ? `<span class="smr-badge">${m.ilvl}</span>` : '';
  const keyStr   = (m.cle_donjon && m.cle_niveau)
    ? `<span class="smr-badge smr-badge-key">+${m.cle_niveau} ${DUNGEON_LBL[m.cle_donjon] || m.cle_donjon}</span>`
    : '';
  const tradeStr = tradeBadgeSmr(m.can_trade);
  return `
  <label class="smr${checked ? ' smr-selected' : ''}">
    <input type="checkbox" class="sess-alt-cb" data-key="${escHtml(k)}"
      ${checked ? 'checked' : ''}>
    <span class="smr-bar" style="background:${color}"></span>
    ${roleImg(role, 18)}
    <span class="smr-name">${escHtml(m.nom)}</span>
    <div class="smr-right">
      <span class="smr-badge smr-badge-role">${roleTag}</span>
      ${ilvlStr}${keyStr}${tradeStr}
    </div>
  </label>`;
}

function tradeBadgeSmr(canTrade) {
  try {
    if (!canTrade) return '';
    let tradable = new Set(), na = new Set();
    const p = JSON.parse(canTrade);
    if (Array.isArray(p)) tradable = new Set(p);
    else { tradable = new Set(p.t || []); na = new Set(p.na || []); }
    const cant = TRADE_SLOTS.filter(s => !tradable.has(s.key) && !na.has(s.key));
    if (!cant.length) return `<span class="smr-badge smr-badge-trade-all">Trade all</span>`;
    const label = cant.length <= 3 ? `No ${cant.map(s => s.short).join(' ')}` : 'No trade';
    return `<span class="smr-badge smr-badge-trade-no" title="Can't trade: ${cant.map(s => s.short).join(', ')}">${label}</span>`;
  } catch { return ''; }
}

function renderStep2(page) {
  const allMembres = getAllMembres();
  const { slots }  = getSetupData();

  const mainIds = new Set();
  if (_mode === 'team' && _selectedTeamId) {
    slots.filter(s => s.team_id === _selectedTeamId).forEach(s => mainIds.add(s.membre_id));
  } else {
    _manualKeys.forEach(k => mainIds.add(k.replace('m:', '')));
  }

  _altKeys.forEach(k => { if (mainIds.has(k.replace('m:', ''))) _altKeys.delete(k); });

  const available = allMembres.filter(m => !mainIds.has(m.id));

  const roleGroup2 = role => available
    .filter(m => role === 'TANK' ? m.spe === 'TANK' : role === 'Heal' ? m.spe === 'Heal' : (m.spe !== 'TANK' && m.spe !== 'Heal'))
    .map(altRowHtml).join('');

  const altItems = available.length ? `
    <div class="sess-role-group">
      <div class="sess-role-lbl">Tank</div>
      <div class="setup-smr-list">${roleGroup2('TANK') || '<p class="setup-empty">Aucun tank</p>'}</div>
    </div>
    <div class="sess-role-group">
      <div class="sess-role-lbl">Heal</div>
      <div class="setup-smr-list">${roleGroup2('Heal') || '<p class="setup-empty">Aucun heal</p>'}</div>
    </div>
    <div class="sess-role-group">
      <div class="sess-role-lbl">DPS</div>
      <div class="setup-smr-list">${roleGroup2('DPS') || '<p class="setup-empty">Aucun DPS</p>'}</div>
    </div>`
    : '<p class="setup-empty">Tous les personnages sont dans le roster principal.</p>';

  page.innerHTML = `
    <div class="sess-container">
      ${sessHero({
        eye:  'Étape 2 / 3 · Alts potentiels',
        title:'Prévois des <em>remplaçants</em>',
        sub:  "Sélectionne les personnages qui pourront remplacer un membre principal en cours de soirée. Leurs clés et stuff apparaîtront pour un swap rapide.",
      })}
      ${stepIndicator(2)}
      <div class="sess-step-body">${altItems}</div>
      <div class="sess-foot">
        <button class="btn btn-ghost" id="sess-back">← Retour</button>
        <button class="btn btn-primary" id="sess-validate">Valider la session</button>
      </div>
    </div>`;

  page.querySelectorAll('.sess-alt-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _altKeys.add(cb.dataset.key);
      else _altKeys.delete(cb.dataset.key);
      cb.closest('.smr')?.classList.toggle('smr-selected', cb.checked);
    });
  });

  page.querySelector('#sess-back')?.addEventListener('click', () => {
    _step = 1;
    renderStep1(page);
  });

  page.querySelector('#sess-validate')?.addEventListener('click', () => {
    _step  = 'roster';
    _swaps = new Map();
    applyAndSave();
    renderRoster(page);
  });
}

// ── Roster : vue session active ────────────────────────────────────────────────

function renderRoster(page) {
  const effective  = getEffectiveRoster();
  const usedAltIds = new Set(_swaps.values());
  const alts       = getAltMembers().filter(m => !usedAltIds.has(m.id));
  const sorted     = [...effective].sort((a, b) => (ROLE_ORDER[a.spe] ?? 2) - (ROLE_ORDER[b.spe] ?? 2));

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
      <div class="sess-member-badges">${ilvlBadge(m)}${keyBadge(m)}${tradeBadge(m.can_trade)}</div>
      <button class="sess-swap-btn${isOpen ? ' active' : ''}" data-swap-id="${escHtml(pickerId)}" title="Swapper">↕</button>
      ${pickerHtml}
    </div>`;
  }).join('');

  const altRows = alts.map(m => {
    const color = speColor(m.classe || '');
    const role  = m.spe === 'TANK' ? 'TANK' : m.spe === 'Heal' ? 'Heal' : 'DPS';
    return `<div class="sess-alt-row">
      <span class="sess-member-bar" style="background:${color}"></span>
      ${roleImg(role, 14)}
      <span class="sess-alt-name">${escHtml(m.nom)}</span>
      <div class="sess-member-badges">${ilvlBadge(m)}${keyBadge(m)}${tradeBadge(m.can_trade)}</div>
    </div>`;
  }).join('');

  // Warnings : membres avec infos manquantes
  const allVisible = [...sorted, ...alts];
  const warnings = allVisible.map(m => {
    const missing = [];
    if (!m.ilvl)                          missing.push('stuff');
    if (!m.cle_donjon || !m.cle_niveau)   missing.push('clé');
    if (!m.can_trade)                     missing.push('tradable');
    if (!missing.length) return '';
    const isAlt = alts.some(a => a.id === m.id);
    return `<div class="sess-warn-row">
      <span class="sess-warn-icon">⚠</span>
      <span><strong>${escHtml(m.nom)}</strong>${isAlt ? ' (alt)' : ''} — ${missing.join(', ')} non renseigné${missing.length > 1 ? 's' : ''}</span>
    </div>`;
  }).filter(Boolean).join('');

  const teamName = _mode === 'team' && _selectedTeamId
    ? (getSetupData().teams.find(t => t.id === _selectedTeamId)?.nom || '')
    : 'Composition manuelle';

  page.innerHTML = `
    <div class="sess-container">
      ${sessHero({
        eye:  'Session · En cours',
        title:`Roster <em>${escHtml(teamName)}</em>`,
        sub:  `${sorted.length} personnage${sorted.length > 1 ? 's' : ''} principal${sorted.length > 1 ? 's' : ''}${alts.length ? ` · ${alts.length} alt${alts.length > 1 ? 's' : ''} en réserve` : ''}. Swap un membre à tout moment, puis copie le texte pour la sign Discord.`,
        right:`
          <button class="btn btn-ghost btn-sm" id="sess-edit-btn">Modifier</button>
          <button class="sess-copy-btn" id="sess-copy-btn">Copier le texte</button>
        `,
      })}
      <div class="sess-panel">
        ${warnings ? `<div class="sess-warnings">${warnings}</div>` : ''}
        <div class="sess-main-list">${memberRows}</div>
        ${alts.length ? `
          <div class="sess-alts-section">
            <div class="sess-section-lbl">Alts disponibles</div>
            <div class="sess-alts-list">${altRows}</div>
          </div>` : ''}
      </div>
    </div>`;

  wireRosterListeners(page);
}

function wireRosterListeners(page) {
  // Modifier → retour étape 1
  page.querySelector('#sess-edit-btn')?.addEventListener('click', () => {
    _step = 1;
    renderStep1(page);
  });

  // Copier
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

  // Swap bouton → toggle picker
  page.querySelectorAll('.sess-swap-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.swapId;
      _swapOpen = _swapOpen === id ? null : id;
      renderRoster(page);
    });
  });

  // Choisir un alt dans le picker
  page.querySelectorAll('.sess-alt-pick').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _swaps.set(btn.dataset.mainId, btn.dataset.altId);
      _swapOpen = null;
      applyAndSave();
      renderRoster(page);
    });
  });

  // Annuler un swap
  page.querySelectorAll('.sess-cancel-swap').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _swaps.delete(btn.dataset.mainId);
      _swapOpen = null;
      applyAndSave();
      renderRoster(page);
    });
  });

  // Fermer le picker si clic en dehors
  if (_swapOpen) {
    document.addEventListener('click', () => {
      _swapOpen = null;
      renderRoster(page);
    }, { once: true });
  }
}

// ── Entry point ────────────────────────────────────────────────────────────────

export function renderSession() {
  const page = document.getElementById('page-session');
  if (!page) return;
  if (!isMember()) {
    page.innerHTML = '<div class="empty"><div class="empty-icon">🔒</div><p>Accès réservé aux membres.</p></div>';
    return;
  }

  loadState();

  if (_step === 'roster') renderRoster(page);
  else if (_step === 2)   renderStep2(page);
  else                    renderStep1(page);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function applyAndSave() {
  if (_mode === 'team' && _selectedTeamId) {
    setSelection([_selectedTeamId, ..._altKeys]);
  } else {
    setSelection([..._manualKeys, ..._altKeys]);
  }
  saveState();
}
