import { supabase }  from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml }   from '../lib/utils.js';
import { speColor }  from '../ui/components.js';
import { toast }     from '../ui/toast.js';
import { isMember, getUser, getMainMembreId } from '../lib/state.js';

// ── Config des objectifs ──────────────────────────────────────────────────────

const CHECKS = [
  { section: 'Raid',        key: 'raid_lfr',       label: 'LFR',               icon: '⚔' },
  { section: 'Raid',        key: 'raid_normal',     label: 'Normal',            icon: '⚔' },
  { section: 'Raid',        key: 'raid_hm',         label: 'Héroïque',          icon: '🔥' },
  { section: 'Raid',        key: 'raid_mythic',     label: 'Mythique',          icon: '💀' },
  { section: 'Hebdo',       key: 'coffre_mp',       label: 'Coffre M+',         icon: '📦' },
  { section: 'Hebdo',       key: 'world_boss',      label: 'World Boss',        icon: '🌍' },
  { section: 'Hebdo',       key: 'grande_chasse',   label: 'Grande chasse',     icon: '🏹' },
  { section: 'Hebdo',       key: 'raid_loot',       label: 'Loot raid',         icon: '💎' },
  { section: 'Progression', key: 'campaign_done',   label: 'Campagne terminée', icon: '📜' },
  { section: 'Progression', key: 'rep_maxed',       label: 'Réputations max',   icon: '⭐' },
  { section: 'Progression', key: 'crafted_gear',    label: 'Stuff craft',       icon: '🔨' },
];

const NUMS = [
  { section: 'Mythique+',   key: 'mp_max',      label: 'Clé max',    unit: '',    thresholds: [8, 15],      placeholder: 'ex: 10'   },
  { section: 'Mythique+',   key: 'mp_score',    label: 'Score Rio',  unit: '',    thresholds: [1000, 2000], placeholder: 'ex: 1500' },
  { section: 'Hebdo',       key: 'renown',      label: 'Renommée',   unit: '/24', thresholds: [10, 20],     placeholder: '0–24'     },
  { section: 'Progression', key: 'ilvl_target', label: 'Item level', unit: '',    thresholds: [480, 500],   placeholder: 'ex: 490'  },
];

// ── State module ──────────────────────────────────────────────────────────────
let _membres  = [];
let _selected = null;
let _todos    = {};
let _saving   = false;
let _panel    = null;
let _overlay  = null;

// ── Couleurs dynamiques ───────────────────────────────────────────────────────
function numCls(key, val) {
  if (val === '' || val === null || val === undefined) return '';
  const n = parseInt(val);
  if (isNaN(n)) return '';
  const item = NUMS.find(x => x.key === key);
  if (!item) return '';
  const [gMax, oMax] = item.thresholds;
  if (n < gMax)  return 'td-green';
  if (n <= oMax) return 'td-orange';
  return 'td-red';
}

function numBadge(key, val) {
  const cls = numCls(key, val);
  if (!cls) return '';
  const item = NUMS.find(x => x.key === key);
  const [gMax, oMax] = item.thresholds;
  if (cls === 'td-green')  return `<span class="td-badge td-green">&lt;${gMax}</span>`;
  if (cls === 'td-orange') return `<span class="td-badge td-orange">${gMax}–${oMax}</span>`;
  return `<span class="td-badge td-red">&gt;${oMax}</span>`;
}

// ── Init DOM ──────────────────────────────────────────────────────────────────
export function initTodo() {
  if (document.getElementById('todo-panel')) return;

  _overlay = document.createElement('div');
  _overlay.id = 'todo-overlay';
  _overlay.addEventListener('click', closeTodo);
  document.body.appendChild(_overlay);

  _panel = document.createElement('div');
  _panel.id = 'todo-panel';
  _panel.innerHTML = `
    <button id="todo-close" title="Fermer">✕</button>
    <div id="todo-inner"></div>`;
  document.body.appendChild(_panel);

  document.getElementById('todo-close').addEventListener('click', closeTodo);
}

// ── Ouvrir — recharge TOUJOURS depuis Supabase ────────────────────────────────
export async function openTodo() {
  if (!isMember()) {
    toast('Connecte-toi pour accéder à ta To-do List', 'err');
    return;
  }
  _panel.classList.add('td-open');
  _overlay.classList.add('td-open');
  document.body.classList.add('td-no-scroll');
  await loadFromSupabase();
}

function closeTodo() {
  _panel?.classList.remove('td-open');
  _overlay?.classList.remove('td-open');
  document.body.classList.remove('td-no-scroll');
}

// ── Chargement Supabase ───────────────────────────────────────────────────────
async function loadFromSupabase() {
  const inner = document.getElementById('todo-inner');
  if (!inner) return;

  inner.innerHTML = `<div class="td-loading">
    <div class="sk-row-sm"></div><div class="sk-row-sm"></div><div class="sk-row-sm"></div>
  </div>`;

  const user     = getUser();
  const myMainId = getMainMembreId();

  if (!user || !myMainId) {
    inner.innerHTML = `
      <div class="td-empty">
        <div class="td-empty-icon">⚔</div>
        <p>Définis ton personnage principal dans l'onglet <strong>Membres</strong> pour accéder à ta To-do List.</p>
      </div>`;
    return;
  }

  const [allMembres, todosRaw] = await Promise.all([
    safeQuery('todo:membres', supabase.from('membres').select('*').order('nom')),
    safeQuery('todo:todos',   supabase.from('todo_items').select('*').eq('user_id', user.id)),
  ]);

  if (!allMembres) return;

  // Main en premier, puis ses alts directs uniquement
  const myMain = allMembres.find(m => m.id === myMainId);
  const myAlts = allMembres.filter(m => m.main_id === myMainId);
  _membres  = [myMain, ...myAlts].filter(Boolean);
  _todos    = Object.fromEntries((todosRaw || []).map(t => [t.membre_id, t]));

  if (!_selected || !_membres.find(m => m.id === _selected)) {
    _selected = myMainId;
  }

  renderPanel();
  updateSidebarBadge();
}

// ── Rendu ─────────────────────────────────────────────────────────────────────
function renderPanel() {
  const inner = document.getElementById('todo-inner');
  if (!inner) return;

  if (!_membres.length) {
    inner.innerHTML = `<div class="td-empty"><div class="td-empty-icon">⚔</div><p>Aucun personnage trouvé.</p></div>`;
    return;
  }

  const td       = _todos[_selected] || {};
  const m        = _membres.find(x => x.id === _selected);
  const done     = CHECKS.filter(c => td[c.key]).length;
  const pct      = Math.round((done / CHECKS.length) * 100);
  const sections = [...new Set([...CHECKS.map(c => c.section), ...NUMS.map(n => n.section)])];
  const isMain   = m?.main_id == null;

  inner.innerHTML = `

    <div class="td-header">
      <div class="td-title">📋 To-do List</div>
      <div class="td-sub">Tes objectifs personnels</div>
    </div>

    ${_membres.length > 1 ? `
    <div class="td-perso-tabs">
      ${_membres.map(mb => `
        <button class="td-ptab ${mb.id === _selected ? 'td-ptab-active' : ''}" data-mid="${escHtml(mb.id)}">
          <span class="td-pdot" style="background:${speColor(mb.classe || '')}"></span>
          ${escHtml(mb.nom)}
          ${mb.main_id ? `<span class="td-alt-tag">alt</span>` : ''}
        </button>`).join('')}
    </div>` : ''}

    <div class="td-perso-card">
      <span class="td-perso-bar" style="background:${speColor(m?.classe || '')}"></span>
      <div class="td-perso-info">
        <div class="td-perso-name">
          ${escHtml(m?.nom || '—')}
          ${isMain ? `<span class="td-main-tag">main</span>` : `<span class="td-alt-tag2">alt</span>`}
        </div>
        <div class="td-perso-meta">
          ${[m?.classe, m?.spe].filter(Boolean).map(escHtml).join(' · ')}
          ${m?.ilvl ? `· <span class="td-ilvl">${m.ilvl} ilvl</span>` : ''}
          ${m?.rio  ? `· <span class="td-rio">${m.rio} rio</span>`    : ''}
        </div>
      </div>
      <div class="td-prog-wrap">
        <div class="td-prog-top">
          <span class="td-prog-count">${done}/${CHECKS.length}</span>
          <span class="td-prog-pct">${pct}%</span>
        </div>
        <div class="td-prog-bg"><div class="td-prog-fill" style="width:${pct}%"></div></div>
      </div>
    </div>

    ${sections.map(sec => {
      const secChecks = CHECKS.filter(c => c.section === sec);
      const secNums   = NUMS.filter(n => n.section === sec);
      if (!secChecks.length && !secNums.length) return '';
      return `
      <div class="td-section">
        <div class="td-section-title">${escHtml(sec)}</div>
        ${secChecks.map(c => {
          const checked = !!td[c.key];
          return `
          <div class="td-check ${checked ? 'td-checked' : ''}" data-key="${escHtml(c.key)}">
            <div class="td-cb ${checked ? 'td-cb-on' : ''}">
              ${checked ? `<svg viewBox="0 0 10 8" width="10" height="8"><polyline points="1,4 4,7 9,1" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
            </div>
            <span class="td-check-ico">${c.icon}</span>
            <span class="td-check-lbl">${escHtml(c.label)}</span>
          </div>`;
        }).join('')}
        ${secNums.map(n => {
          const val        = td[n.key] ?? '';
          const cls        = numCls(n.key, val);
          const displayVal = (val === null || val === undefined) ? '' : val;
          return `
          <div class="td-num-row">
            <span class="td-num-lbl">${escHtml(n.label)}</span>
            <div class="td-num-right">
              <input class="td-num-input ${cls}" type="number" min="0"
                value="${displayVal}" placeholder="${escHtml(n.placeholder)}"
                data-key="${escHtml(n.key)}">
              ${n.unit ? `<span class="td-unit">${escHtml(n.unit)}</span>` : ''}
              <span id="tdbadge-${escHtml(n.key)}">${numBadge(n.key, val)}</span>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    }).join('')}

    <div class="td-section">
      <div class="td-section-title">Note</div>
      <textarea class="td-note" placeholder="Objectifs, rappels, priorités...">${escHtml(td.note || '')}</textarea>
    </div>

    <div class="td-save-row">
      <button class="btn btn-primary" id="td-save-btn">💾 Enregistrer</button>
      <span class="td-save-ok" id="td-save-ok"></span>
    </div>`;

  wirePanel();
}

// ── Events ────────────────────────────────────────────────────────────────────
function wirePanel() {
  const inner = document.getElementById('todo-inner');
  if (!inner) return;

  inner.querySelectorAll('.td-ptab').forEach(btn => {
    btn.addEventListener('click', () => { _selected = btn.dataset.mid; renderPanel(); });
  });

  inner.querySelectorAll('.td-check').forEach(el => {
    el.addEventListener('click', () => {
      const td = _todos[_selected] || {};
      td[el.dataset.key] = !td[el.dataset.key];
      _todos[_selected]  = td;
      renderPanel();
    });
  });

  inner.querySelectorAll('.td-num-input').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.key;
      const val = input.value;
      input.className = `td-num-input ${numCls(key, val)}`;
      const badge = document.getElementById(`tdbadge-${key}`);
      if (badge) badge.innerHTML = numBadge(key, val);
      const td = _todos[_selected] || {};
      td[key]  = val === '' ? null : parseInt(val);
      _todos[_selected] = td;
    });
  });

  inner.querySelector('.td-note')?.addEventListener('input', e => {
    const td = _todos[_selected] || {};
    td.note  = e.target.value;
    _todos[_selected] = td;
  });

  document.getElementById('td-save-btn')?.addEventListener('click', () => saveTodo());
}

// ── Save Supabase ─────────────────────────────────────────────────────────────
async function saveTodo() {
  if (_saving || !_selected) return;
  _saving = true;
  const btn = document.getElementById('td-save-btn');
  const ok  = document.getElementById('td-save-ok');
  if (btn) btn.disabled = true;
  if (ok)  ok.textContent = '';

  try {
    const td   = _todos[_selected] || {};
    const user = getUser();
    if (!user) { toast('Non connecté', 'err'); return; }

    const toInt = v => (v != null && v !== '') ? parseInt(v) : null;

    const payload = {
      membre_id:     _selected,
      user_id:       user.id,
      raid_lfr:      !!td.raid_lfr,
      raid_normal:   !!td.raid_normal,
      raid_hm:       !!td.raid_hm,
      raid_mythic:   !!td.raid_mythic,
      coffre_mp:     !!td.coffre_mp,
      world_boss:    !!td.world_boss,
      grande_chasse: !!td.grande_chasse,
      raid_loot:     !!td.raid_loot,
      campaign_done: !!td.campaign_done,
      rep_maxed:     !!td.rep_maxed,
      crafted_gear:  !!td.crafted_gear,
      mp_max:        toInt(td.mp_max),
      mp_score:      toInt(td.mp_score),
      renown:        toInt(td.renown),
      ilvl_target:   toInt(td.ilvl_target),
      note:          td.note?.trim() || null,
    };

    const result = await safeQuery('saveTodo',
      supabase.from('todo_items').upsert(payload, { onConflict: 'membre_id,user_id' })
    );
    if (result === null) return;

    _todos[_selected] = { ..._todos[_selected], ...payload };
    toast('✓ To-do sauvegardée');
    if (ok) { ok.textContent = '✓ Sauvegardé'; setTimeout(() => { if(ok) ok.textContent=''; }, 3000); }
    updateSidebarBadge();

  } finally {
    _saving = false;
    if (btn) btn.disabled = false;
  }
}

// ── Badge sidebar ─────────────────────────────────────────────────────────────
export function updateSidebarBadge() {
  const badge = document.getElementById('todo-sidebar-badge');
  if (!badge || !_membres.length) return;
  const done      = _membres.reduce((acc, m) => acc + CHECKS.filter(c => (_todos[m.id] || {})[c.key]).length, 0);
  const remaining = _membres.length * CHECKS.length - done;
  badge.textContent   = remaining;
  badge.style.display = remaining > 0 ? 'inline-flex' : 'none';
}
