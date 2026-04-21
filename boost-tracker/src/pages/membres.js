import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g } from '../lib/utils.js';
import { speColor } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { oov, cov } from '../ui/modal.js';
import { isMember, isAdmin, getUser, setState, getMainMembreId } from '../lib/state.js';
import { updateUserBarMain } from '../auth/auth.js';
import { SPES, TRADE_SLOTS } from '../constants.js';

const SPE_LBL = { 'DPS.C': 'DPS C·C', 'DPS.D': 'DPS Dist.', 'TANK': 'Tank', 'Heal': 'Heal' };
const SPE_CLS = { 'DPS.C': 'b-dps',   'DPS.D': 'b-dps',     'TANK': 'b-tank', 'Heal': 'b-heal' };
let _openingModal = false;
let _currentTab   = 'mine';  // 'mine' | 'others'
let _membresCache = [];
let _tabsWired    = false;

function wireTabs() {
  _tabsWired = true;
  document.querySelectorAll('#page-membres .m-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentTab = btn.dataset.mtab;
      renderMembres();
    });
  });
}

function syncTabsUI() {
  document.querySelectorAll('#page-membres .m-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mtab === _currentTab);
  });
}

// ── Trade slot picker (armory style, états clarifiés) ────────────────────────

const ARMORY_LEFT   = ['head','neck','shoulder','back','chest','wrist'];
const ARMORY_RIGHT  = ['hands','waist','legs','feet','ring1','ring2'];
const ARMORY_BOTTOM = ['trinket1','trinket2','weapon','offhand'];

const SLOT_ICONS = {
  head:'🪖', neck:'📿', shoulder:'🏅', back:'🧥', chest:'🛡', wrist:'⌚',
  hands:'🧤', waist:'🪢', legs:'🦵', feet:'👟',
  ring1:'💍', ring2:'💍', trinket1:'🔮', trinket2:'⚗️', weapon:'⚔️', offhand:'🗡️',
};

const BODY_SVG = `<svg class="armory-body-svg" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="40" cy="77" rx="18" ry="4" fill="rgba(0,0,0,0.25)"/>
  <g class="as-body">
    <circle cx="40" cy="14" r="10" fill="#e8c87a" stroke="#c8a050" stroke-width="1"/>
    <path d="M30 12 Q40 2 50 12 L50 18 Q40 14 30 18 Z" fill="#1a1a2e"/>
    <rect x="30" y="14" width="6" height="10" fill="#1a1a2e"/>
    <rect x="44" y="14" width="6" height="10" fill="#1a1a2e"/>
    <rect x="32" y="15" width="16" height="5" rx="2" fill="#111" opacity="0.85"/>
    <ellipse cx="36" cy="17" rx="2" ry="1.5" fill="white" opacity="0.9"/>
    <ellipse cx="44" cy="17" rx="2" ry="1.5" fill="white" opacity="0.9"/>
    <path d="M36 21 Q40 24 44 21" stroke="#c8a050" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <line x1="40" y1="24" x2="40" y2="46" stroke="#1a1a2e" stroke-width="5" stroke-linecap="round"/>
    <path d="M36 26 Q28 36 30 46 L36 42 Z" fill="#2a2a4e" opacity="0.8"/>
    <g class="as-arm1">
      <line x1="40" y1="32" x2="22" y2="42" stroke="#1a1a2e" stroke-width="4" stroke-linecap="round"/>
      <circle cx="21" cy="43" r="3.5" fill="#e8c87a"/>
    </g>
    <g class="as-arm2">
      <line x1="40" y1="32" x2="56" y2="28" stroke="#1a1a2e" stroke-width="4" stroke-linecap="round"/>
      <g class="as-bag">
        <line x1="57" y1="28" x2="62" y2="35" stroke="#c07800" stroke-width="2"/>
        <circle cx="64" cy="40" r="9" fill="#d49000"/>
        <circle cx="64" cy="40" r="7" fill="#f0b800"/>
        <circle cx="62" cy="38" r="3" fill="#ffe060" opacity="0.6"/>
        <text x="64" y="44" font-size="9" font-family="Arial Black" font-weight="900" fill="#7a4400" text-anchor="middle">$</text>
        <ellipse cx="64" cy="31" rx="4" ry="2.5" fill="#c07800"/>
      </g>
    </g>
    <g class="as-leg1">
      <line x1="40" y1="46" x2="28" y2="64" stroke="#1a1a2e" stroke-width="4.5" stroke-linecap="round"/>
      <ellipse cx="25" cy="67" rx="6" ry="3" fill="#111"/>
    </g>
    <g class="as-leg2">
      <line x1="40" y1="46" x2="52" y2="62" stroke="#2a2a4e" stroke-width="4.5" stroke-linecap="round"/>
      <ellipse cx="55" cy="65" rx="5" ry="2.5" fill="#222"/>
    </g>
  </g>
</svg>`;

function parseTradeData(val) {
  if (!val) return { tradable: new Set(), na: new Set() };
  try {
    const p = JSON.parse(val);
    if (Array.isArray(p)) return { tradable: new Set(p), na: new Set() }; // ancien format
    return { tradable: new Set(p.t || []), na: new Set(p.na || []) };
  } catch { return { tradable: new Set(), na: new Set() }; }
}

function serializeTrade(tradable, na) {
  const t = [...tradable], n = [...na];
  if (!t.length && !n.length) return '';
  return JSON.stringify({ t, na: n });
}

function slotState(key, tradable, na) {
  if (tradable.has(key)) return 'tradable';
  if (na.has(key))       return 'na';
  return 'no';
}

function stateLabel(state) {
  return state === 'tradable' ? 'Tradable'
       : state === 'na'       ? 'N/A'
       :                        'Non tradable';
}

function renderTradeSlots(data = { tradable: new Set(), na: new Set() }) {
  const { tradable, na } = data;
  const container = document.getElementById('m-trade-slots');
  const hidden    = document.getElementById('m-trade');
  const count     = document.getElementById('m-trade-count');
  if (!container) return;

  const slotMap = Object.fromEntries(TRADE_SLOTS.map(s => [s.key, s]));

  const mkSlot = key => {
    const s     = slotMap[key];
    const state = slotState(key, tradable, na);
    return `<button type="button" class="armory-slot" data-key="${key}" data-state="${state}" title="${s.fr}">
      <span class="armory-slot-icon">${SLOT_ICONS[key] || '📦'}</span>
      <span class="armory-slot-lbl">${s.fr}</span>
      <span class="armory-slot-state">${stateLabel(state)}</span>
    </button>`;
  };

  container.innerHTML = `
    <div class="armory-legend">
      <span class="al-lg al-tradable">Tradable</span>
      <span class="al-lg al-no">Non tradable</span>
      <span class="al-lg al-na">N/A</span>
      <span class="armory-hint">Clic : tradable → N/A → rien</span>
    </div>
    <div class="armory-panel">
      <div class="armory-col armory-left">${ARMORY_LEFT.map(mkSlot).join('')}</div>
      <div class="armory-center">${BODY_SVG}</div>
      <div class="armory-col armory-right">${ARMORY_RIGHT.map(mkSlot).join('')}</div>
    </div>
    <div class="armory-bottom">${ARMORY_BOTTOM.map(mkSlot).join('')}</div>`;

  const update = () => {
    const t = [...container.querySelectorAll('.armory-slot[data-state="tradable"]')].map(el => el.dataset.key);
    const n = [...container.querySelectorAll('.armory-slot[data-state="na"]')].map(el => el.dataset.key);
    hidden.value = serializeTrade(new Set(t), new Set(n));
    if (count) count.textContent = t.length ? `· ${t.length} tradable${t.length > 1 ? 's' : ''}` : '';
  };

  // Cycle : no → tradable → na → no
  const NEXT = { no: 'tradable', tradable: 'na', na: 'no' };
  container.querySelectorAll('.armory-slot').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = NEXT[btn.dataset.state] || 'tradable';
      btn.dataset.state = next;
      btn.querySelector('.armory-slot-state').textContent = stateLabel(next);
      update();
    });
  });

  const setAll = (state) => {
    container.querySelectorAll('.armory-slot').forEach(btn => {
      btn.dataset.state = state;
      btn.querySelector('.armory-slot-state').textContent = stateLabel(state);
    });
    update();
  };
  const allBtn  = document.getElementById('m-trade-all');
  const noneBtn = document.getElementById('m-trade-none');
  if (allBtn)  allBtn.onclick  = () => setAll('tradable');
  if (noneBtn) noneBtn.onclick = () => setAll('no');

  update();
}

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function renderMembres() {
  g('m-body').innerHTML = `<tr><td colspan="8"><div class="sk-wrap-table"><div class="sk-row-sm"></div><div class="sk-row-sm"></div><div class="sk-row-sm"></div></div></td></tr>`;
  const membres = await safeQuery('renderMembres', supabase.from('membres').select('*').order('nom'));
  if (membres === null) return;

  // Mettre à jour le cache state pour les autres pages (teams, runs)
  setState('membres', membres);
  _membresCache = membres;

  // Calcul "Mes personnages" : main + alts liés
  const myMainId = getMainMembreId();
  const mineIds  = new Set();
  if (myMainId) {
    mineIds.add(myMainId);
    membres.filter(m => m.main_id === myMainId).forEach(m => mineIds.add(m.id));
  }
  const mine   = membres.filter(m => mineIds.has(m.id));
  const others = membres.filter(m => !mineIds.has(m.id));

  // Mise à jour des compteurs
  g('m-count').textContent       = membres.length + ' membre' + (membres.length > 1 ? 's' : '');
  g('m-count-mine').textContent   = String(mine.length);
  g('m-count-others').textContent = String(others.length);

  // Hint si pas de main perso
  const hint = g('m-no-main-hint');
  if (hint) hint.style.display = myMainId ? 'none' : '';

  // Wire tabs (une seule fois)
  if (!_tabsWired) wireTabs();

  // Si pas de main, forcer "others" par défaut
  if (!myMainId && _currentTab === 'mine') _currentTab = 'others';
  syncTabsUI();

  const listToShow = _currentTab === 'mine' ? mine : others;
  const tbody      = g('m-body');

  if (!listToShow.length) {
    const msg = _currentTab === 'mine'
      ? (myMainId ? 'Aucun alt lié à ton main.' : 'Définis ton personnage principal pour voir tes persos ici.')
      : 'Aucun autre membre.';
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty-icon">⚔</div><p>${msg}</p></div></td></tr>`;
    return;
  }

  // Index pour résoudre les noms de main
  const byId = Object.fromEntries(membres.map(m => [m.id, m]));
  const mainIds = new Set(membres.filter(m => m.main_id).map(m => m.main_id));

  tbody.innerHTML = listToShow.map(m => {
    let statutBadge;
    if (m.main_id && byId[m.main_id]) {
      statutBadge = `<span class="badge" style="background:var(--bg3);color:var(--text2);font-size:10px">ALT → ${escHtml(byId[m.main_id].nom)}</span>`;
    } else if (mainIds.has(m.id)) {
      statutBadge = `<span class="badge" style="background:#1a3a1a;color:#4caf50;font-size:10px">MAIN</span>`;
    } else {
      statutBadge = `<span style="color:var(--text3)">—</span>`;
    }

    return `<tr data-id="${escHtml(m.id)}">
    <td>
      <div class="cname">
        <span style="width:5px;height:24px;border-radius:3px;background:${speColor(m.classe || '')};flex-shrink:0"></span>
        <strong>${escHtml(m.nom)}</strong>
      </div>
    </td>
    <td>${m.spe ? `<span class="badge ${SPE_CLS[m.spe] || ''}">${escHtml(SPE_LBL[m.spe] || m.spe)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
    <td style="color:var(--text2)">${escHtml(m.classe || '—')}</td>
    <td style="color:var(--blue2);font-weight:600">${m.ilvl || '—'}</td>
    <td style="color:var(--gold2);font-weight:600">${m.rio || '—'}</td>
    <td style="color:var(--text2);font-size:12px">${m.discord_tag ? `<span style="background:var(--bg3);padding:2px 7px;border-radius:4px">${escHtml(m.discord_tag)}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
    <td>${statutBadge}</td>
    <td>
      <div style="display:flex;gap:5px">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${escHtml(m.id)}">✏</button>
        <button class="btn btn-ghost btn-sm" data-action="del"  data-id="${escHtml(m.id)}">✕</button>
      </div>
    </td>
  </tr>`;
  }).join('');

  // Event delegation sur le tbody — plus d'onclick inline
  tbody.onclick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') await editM(id);
    if (btn.dataset.action === 'del')  await delM(id, btn);
  };
}

// ── Modal CRUD ─────────────────────────────────────────────────────────────────

export function updateSpeList() {
  const role = g('ms').value;
  const sel  = g('mc');
  if (!role) { sel.innerHTML = '<option value="">— Choisir un rôle —</option>'; return; }
  sel.innerHTML = '<option value="">— Spécialisation —</option>' +
    (SPES[role] || []).map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
}

function populateMainSelect(membres, excludeId = null) {
  const sel = g('m-main-id');
  // Only non-alts can be selected as a main (can't chain alts)
  const mains = membres.filter(m => !m.main_id && m.id !== excludeId);
  sel.innerHTML = '<option value="">— Personnage principal (laisser vide si c\'est un main) —</option>' +
    mains.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.nom)}</option>`).join('');
}

export async function openAddM() {
  if (_openingModal) return;
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  _openingModal = true;
  try {
    g('m-id').value = '';
    g('m-title').innerHTML = 'Ajouter un <em>membre</em>';
    ['mn', 'mi', 'mr', 'm-discord'].forEach(id => { g(id).value = ''; });
    g('ms').selectedIndex = 0;
    g('mc').innerHTML = '<option value="">— Choisir un rôle —</option>';
    renderTradeSlots({ tradable: new Set(), na: new Set() });
    const altWrap = document.getElementById('m-alts-wrap');
    if (altWrap) { altWrap.style.display = 'none'; altWrap.innerHTML = ''; }

    const membres = await safeQuery('openAddM:membres', supabase.from('membres').select('id,nom,main_id').order('nom'));
    populateMainSelect(membres || []);

    oov('ov-m');
  } finally {
    _openingModal = false;
  }
}

async function editM(id) {
  const [mResult, allResult] = await Promise.all([
    supabase.from('membres').select('*').eq('id', id).single(),
    safeQuery('editM:membres', supabase.from('membres').select('id,nom,main_id').order('nom')),
  ]);
  const m = mResult.data;
  if (!m) return;

  g('m-id').value   = id;
  g('m-title').innerHTML = `Modifier <em>${escHtml(m.nom)}</em>`;
  g('mn').value     = m.nom || '';
  g('ms').value     = m.spe || '';
  updateSpeList();
  g('mc').value     = m.classe || '';
  g('mi').value     = m.ilvl || '';
  g('mr').value          = m.rio || '';
  g('m-discord').value   = m.discord_tag || '';
  renderTradeSlots(parseTradeData(m.can_trade));

  // Populate main select (exclude self so a member can't be its own main)
  populateMainSelect(allResult || [], id);
  g('m-main-id').value = m.main_id || '';

  // Show alts of this member if it's a main
  const alts = (allResult || []).filter(x => x.main_id === id);
  const altWrap = document.getElementById('m-alts-wrap');
  if (altWrap) {
    if (alts.length) {
      altWrap.style.display = 'block';
      altWrap.innerHTML = `<label style="color:var(--text3);font-size:12px;margin-bottom:4px;display:block">Alts liés</label>` +
        alts.map(a => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
          <span style="flex:1;font-size:13px">${escHtml(a.nom)}</span>
          <button class="btn btn-ghost btn-sm" data-unlink="${escHtml(a.id)}" style="font-size:11px">Délier</button>
        </div>`).join('');
      altWrap.onclick = async e => {
        const btn = e.target.closest('[data-unlink]');
        if (!btn) return;
        btn.disabled = true;
        await safeQuery('unlinkAlt', supabase.from('membres').update({ main_id: null }).eq('id', btn.dataset.unlink));
        toast('Alt délié');
        await editM(id); // re-render modal
      };
    } else {
      altWrap.style.display = 'none';
      altWrap.innerHTML = '';
    }
  }

  oov('ov-m');
}

export async function saveM() {
  const btn = g('btn-save-membre');
  if (btn?.disabled) return;

  const nom = g('mn').value.trim();
  if (!nom) { toast('Nom requis', 'err'); return; }
  const editId = g('m-id').value;

  if (btn) btn.disabled = true;
  try {
    const payload = {
      nom,
      spe:          g('ms').value || null,
      classe:       g('mc').value || null,
      ilvl:         parseInt(g('mi').value) || null,
      rio:          parseInt(g('mr').value) || null,
      can_trade:    g('m-trade').value || null,
      main_id:      g('m-main-id').value || null,
      discord_tag:  g('m-discord').value.trim() || null,
      owner_id:     getUser()?.id,
    };

    if (editId) {
      const data = await safeQuery('saveM:update', supabase.from('membres').update(payload).eq('id', editId));
      if (data === null) return;
    } else {
      const data = await safeQuery('saveM:insert', supabase.from('membres').insert([payload]));
      if (data === null) return;
    }

    cov('ov-m');
    toast(editId ? '✓ Modifié' : `⚔ ${escHtml(nom)} ajouté`);
    await renderMembres();
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function delM(id, btn) {
  if (btn) btn.disabled = true;

  try {
    if (!isAdmin()) {
      const { data: existing } = await supabase.from('membres').select('owner_id').eq('id', id).single();
      if (existing?.owner_id !== getUser()?.id) {
        toast('Permission refusée', 'err');
        return;
      }
    }

    // Check if this member is a main with alts
    const { data: alts } = await supabase.from('membres').select('nom').eq('main_id', id);
    if (alts?.length) {
      const altNames = alts.map(a => a.nom).join(', ');
      if (!confirm(`Ce personnage est main de : ${altNames}.\nSupprimer quand même ? (les alts seront déliés)`)) return;
    } else {
      if (!confirm('Supprimer ce membre ?')) return;
    }

    const data = await safeQuery('delM', supabase.from('membres').delete().eq('id', id));
    if (data === null) return;

    // Si le perso supprimé était le main de l'utilisateur courant → nettoyer le state
    if (getMainMembreId() === id) {
      setState('currentMainMembreId', null);
      updateUserBarMain(null);
    }

    toast('Supprimé');
    await renderMembres();
  } finally {
    if (btn) btn.disabled = false;
  }
}
