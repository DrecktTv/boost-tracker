import { supabase }  from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g } from '../lib/utils.js';
import { speColor }  from '../ui/components.js';
import { toast }     from '../ui/toast.js';
import { isMember, getUser, getMainMembreId } from '../lib/state.js';

// ── State ─────────────────────────────────────────────────────────────────────
let _membres  = [];
let _selected = null;
let _todos    = {};
let _saving   = false;

// ── Couleur clés +10 ──────────────────────────────────────────────────────────
// vert >= 8, orange 4-7, rouge < 4
function mpCls(val) {
  if (val === '' || val === null || val === undefined) return '';
  const n = parseInt(val);
  if (isNaN(n)) return '';
  if (n >= 8) return 'td-green';
  if (n >= 4) return 'td-orange';
  return 'td-red';
}

function mpBadge(val) {
  const cls = mpCls(val);
  if (!cls) return '';
  const n = parseInt(val);
  if (cls === 'td-green')  return `<span class="td-badge td-green">✓ Coffre dispo</span>`;
  if (cls === 'td-orange') return `<span class="td-badge td-orange">${8 - n} clé${8-n>1?'s':''} restante${8-n>1?'s':''}</span>`;
  return `<span class="td-badge td-red">${8 - n} clés restantes</span>`;
}

// ── Rendu principal ───────────────────────────────────────────────────────────
export async function renderTodo() {
  const wrap = g('page-todo');
  if (!wrap) return;

  if (!isMember()) {
    wrap.innerHTML = `<div class="empty"><div class="empty-icon">🔒</div><p>Connecte-toi pour accéder à ta To-do List.</p></div>`;
    return;
  }

  wrap.innerHTML = `<div class="td-page-loading"><div class="sk-row-sm"></div><div class="sk-row-sm"></div><div class="sk-row-sm"></div></div>`;

  const user     = getUser();
  const myMainId = getMainMembreId();

  if (!user || !myMainId) {
    wrap.innerHTML = `
      <div class="empty">
        <div class="empty-icon">⚔</div>
        <p>Définis ton personnage principal dans l'onglet <strong>Membres</strong><br>pour accéder à ta To-do List.</p>
      </div>`;
    return;
  }

  // Toujours depuis Supabase — jamais de cache local
  const [allMembres, todosRaw] = await Promise.all([
    safeQuery('todo:membres', supabase.from('membres').select('*').order('nom')),
    safeQuery('todo:todos',   supabase.from('todo_items').select('*').eq('user_id', user.id)),
  ]);

  if (!allMembres) return;

  // Main en premier, puis ses alts directs
  const myMain = allMembres.find(m => m.id === myMainId);
  const myAlts = allMembres.filter(m => m.main_id === myMainId);
  _membres  = [myMain, ...myAlts].filter(Boolean);
  _todos    = Object.fromEntries((todosRaw || []).map(t => [t.membre_id, t]));

  if (!_selected || !_membres.find(m => m.id === _selected)) {
    _selected = myMainId;
  }

  wrap.innerHTML = buildPage();
  wirePage(wrap);
}

// ── Construction HTML ─────────────────────────────────────────────────────────
function buildPage() {
  if (!_membres.length) {
    return `<div class="empty"><div class="empty-icon">⚔</div><p>Aucun personnage trouvé.</p></div>`;
  }

  const td  = _todos[_selected] || {};
  const m   = _membres.find(x => x.id === _selected);
  const val = td.mp_10_count ?? '';

  // Progression pondérée : clés +10 = 70% (8.75%/clé, max 8), Raid HM = 30%
  // Raid Normal hors calcul
  function calcPct(t) {
    const cles = Math.min(parseInt(t.mp_10_count) || 0, 8);
    const hm   = t.raid_hm ? 1 : 0;
    return Math.round((cles / 8) * 70 + hm * 30);
  }

  const pct       = calcPct(td);
  const globalPct = _membres.length
    ? Math.round(_membres.reduce((acc, mb) => acc + calcPct(_todos[mb.id] || {}), 0) / _membres.length)
    : 0;

  return `
  <div class="td-page">

    <!-- ── En-tête ── -->
    <div class="td-page-hero">
      <div class="td-page-hero-left">
        <div class="td-page-eyebrow">Personnel · Semaine en cours</div>
        <h1 class="td-page-title">Ta <em>To-do List</em></h1>
        <p class="td-page-sub">Coche tes objectifs hebdomadaires pour chacun de tes personnages.</p>
      </div>
      <div class="td-page-hero-right">
        <div class="td-global-prog">
          <div class="td-global-prog-label">
            <span>Progression moyenne</span>
            <span class="td-global-pct">${globalPct}%</span>
          </div>
          <div class="td-prog-bg"><div class="td-prog-fill" style="width:${globalPct}%"></div></div>
        </div>
      </div>
    </div>

    <!-- ── Tabs persos ── -->
    ${_membres.length > 1 ? `
    <div class="td-page-tabs">
      ${_membres.map(mb => {
        const t   = _todos[mb.id] || {};
        const pct = calcPct(t);
        return `
        <button class="td-page-tab ${mb.id === _selected ? 'td-tab-active' : ''}" data-mid="${escHtml(mb.id)}">
          <span class="td-tab-dot" style="background:${speColor(mb.classe || '')}"></span>
          <span class="td-tab-name">${escHtml(mb.nom)}</span>
          ${mb.main_id ? `<span class="td-tab-alt">alt</span>` : `<span class="td-tab-main">main</span>`}
          <span class="td-tab-pct">${pct}%</span>
        </button>`;
      }).join('')}
    </div>` : ''}

    <!-- ── Carte perso actif ── -->
    <div class="td-perso-card">
      <div class="td-perso-stripe" style="background:${speColor(m?.classe || '')}"></div>
      <div class="td-perso-info">
        <div class="td-perso-name">${escHtml(m?.nom || '—')}</div>
        <div class="td-perso-meta">
          ${[m?.classe, m?.spe].filter(Boolean).map(escHtml).join(' · ')}
          ${m?.ilvl ? `· <span style="color:var(--blue2);font-weight:600">${m.ilvl} ilvl</span>` : ''}
          ${m?.rio  ? `· <span style="color:var(--gold2);font-weight:600">${m.rio} rio</span>`   : ''}
        </div>
      </div>
      <div class="td-prog-wrap">
        <div class="td-prog-top">
          <span id="td-perso-pct">${pct}%</span>
        </div>
        <div class="td-prog-bg"><div class="td-prog-fill" id="td-perso-bar-fill" style="width:${pct}%"></div></div>
      </div>
    </div>

    <!-- ── Grille d'objectifs ── -->
    <div class="td-obj-grid">

      <!-- Raid Normal -->
      <div class="td-obj-card ${td.raid_normal ? 'td-obj-done' : ''}" data-key="raid_normal" data-type="check">
        <div class="td-obj-check">
          <div class="td-cb ${td.raid_normal ? 'td-cb-on' : ''}">
            ${td.raid_normal ? `<svg viewBox="0 0 10 8" width="12" height="10"><polyline points="1,4 4,7 9,1" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
          </div>
        </div>
        <div class="td-obj-body">
          <div class="td-obj-cat">Raid</div>
          <div class="td-obj-name">Normal</div>
        </div>
        <div class="td-obj-status">
          ${td.raid_normal ? `<span class="td-badge td-green">✓ Fait</span>` : `<span class="td-badge td-muted">À faire</span>`}
        </div>
      </div>

      <!-- Raid Héroïque -->
      <div class="td-obj-card ${td.raid_hm ? 'td-obj-done' : ''}" data-key="raid_hm" data-type="check">
        <div class="td-obj-check">
          <div class="td-cb ${td.raid_hm ? 'td-cb-on' : ''}">
            ${td.raid_hm ? `<svg viewBox="0 0 10 8" width="12" height="10"><polyline points="1,4 4,7 9,1" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
          </div>
        </div>
        <div class="td-obj-body">
          <div class="td-obj-cat">Raid</div>
          <div class="td-obj-name">Héroïque</div>
        </div>
        <div class="td-obj-status">
          ${td.raid_hm ? `<span class="td-badge td-green">✓ Fait</span>` : `<span class="td-badge td-muted">À faire</span>`}
        </div>
      </div>

      <!-- Clés +10 -->
      <div class="td-obj-card td-obj-num">
        <div class="td-obj-body">
          <div class="td-obj-cat">Mythique+</div>
          <div class="td-obj-name">Clés +10 faites</div>
          <div class="td-obj-hint">Coffre dispo à partir de 8 · 70% de l'objectif</div>
        </div>
        <div class="td-obj-num-right">
          <button class="td-counter-btn" id="td-mp-minus">−</button>
          <span class="td-num-big ${mpCls(val)}" id="td-mp-val">${val === '' || val === null ? '0' : val}</span>
          <button class="td-counter-btn" id="td-mp-plus">+</button>
          <div id="td-mp-badge">${mpBadge(val === '' || val === null ? '0' : val)}</div>
        </div>
      </div>

    </div>

    <!-- ── Note ── -->
    <div class="td-note-section">
      <div class="td-note-label">Note perso</div>
      <textarea class="td-note" placeholder="Objectifs, rappels, priorités...">${escHtml(td.note || '')}</textarea>
    </div>

    <!-- ── Save ── -->
    <div class="td-save-row">
      <button class="btn btn-primary" id="td-save-btn">💾 Enregistrer</button>
      <span class="td-save-ok" id="td-save-ok"></span>
    </div>

  </div>`;
}

// ── Wiring ────────────────────────────────────────────────────────────────────
function wirePage(wrap) {

  // Tabs perso
  wrap.querySelectorAll('.td-page-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _selected = btn.dataset.mid;
      wrap.innerHTML = buildPage();
      wirePage(wrap);
    });
  });

  // Cases à cocher
  wrap.querySelectorAll('[data-type="check"]').forEach(card => {
    card.addEventListener('click', () => {
      const key        = card.dataset.key;
      const td         = _todos[_selected] || {};
      td[key]          = !td[key];
      _todos[_selected] = td;
      wrap.innerHTML   = buildPage();
      wirePage(wrap);
    });
  });

  // Compteur clés +10 — boutons + et -
  function updateMpDisplay(n) {
    const valEl  = document.getElementById('td-mp-val');
    const badge  = document.getElementById('td-mp-badge');
    const progEl = document.getElementById('td-perso-pct');
    const progBar= document.getElementById('td-perso-bar-fill');
    if (valEl)  { valEl.textContent = n; valEl.className = `td-num-big ${mpCls(n)}`; }
    if (badge)  badge.innerHTML = mpBadge(String(n));
    // Mettre à jour le % du perso actif en temps réel
    const td  = _todos[_selected] || {};
    const p   = calcPctFromData(td);
    if (progEl)  progEl.textContent = p + '%';
    if (progBar) progBar.style.width = p + '%';
    // Mettre à jour le % dans le tab actif
    const activeTab = wrap.querySelector('.td-page-tab.td-tab-active .td-tab-pct');
    if (activeTab) activeTab.textContent = p + '%';
    // Mettre à jour la barre globale
    const globalPctEl  = wrap.querySelector('.td-global-pct');
    const globalBarEl  = wrap.querySelector('.td-prog-fill');
    if (_membres.length && globalPctEl && globalBarEl) {
      const gp = Math.round(_membres.reduce((acc, mb) => acc + calcPctFromData(_todos[mb.id] || {}), 0) / _membres.length);
      globalPctEl.textContent = gp + '%';
      globalBarEl.style.width = gp + '%';
    }
  }

  // Fonction calcPct accessible depuis le wiring
  function calcPctFromData(t) {
    const cles = Math.min(parseInt(t.mp_10_count) || 0, 8);
    const hm   = t.raid_hm ? 1 : 0;
    return Math.round((cles / 8) * 70 + hm * 30);
  }

  const mpMinus = document.getElementById('td-mp-minus');
  const mpPlus  = document.getElementById('td-mp-plus');
  if (mpMinus && mpPlus) {
    mpMinus.addEventListener('click', () => {
      const td  = _todos[_selected] || {};
      const cur = parseInt(td.mp_10_count) || 0;
      const nxt = Math.max(0, cur - 1);
      td.mp_10_count    = nxt;
      _todos[_selected] = td;
      updateMpDisplay(nxt);
    });
    mpPlus.addEventListener('click', () => {
      const td  = _todos[_selected] || {};
      const cur = parseInt(td.mp_10_count) || 0;
      const nxt = cur + 1;
      td.mp_10_count    = nxt;
      _todos[_selected] = td;
      updateMpDisplay(nxt);
    });
  }

  // Note
  wrap.querySelector('.td-note')?.addEventListener('input', e => {
    const td         = _todos[_selected] || {};
    td.note          = e.target.value;
    _todos[_selected] = td;
  });

  // Save
  wrap.querySelector('#td-save-btn')?.addEventListener('click', () => saveTodo());
}

// ── Sauvegarde Supabase ───────────────────────────────────────────────────────
async function saveTodo() {
  if (_saving || !_selected) return;
  _saving = true;

  const btn = g('td-save-btn');
  const ok  = g('td-save-ok');
  if (btn) btn.disabled = true;
  if (ok)  ok.textContent = '';

  try {
    const td   = _todos[_selected] || {};
    const user = getUser();
    if (!user) { toast('Non connecté', 'err'); return; }

    const payload = {
      membre_id:    _selected,
      user_id:      user.id,
      raid_normal:  !!td.raid_normal,
      raid_hm:      !!td.raid_hm,
      mp_10_count:  td.mp_10_count != null ? parseInt(td.mp_10_count) : 0,
      note:         td.note?.trim() || null,
    };

    const result = await safeQuery('saveTodo',
      supabase.from('todo_items').upsert(payload, { onConflict: 'membre_id,user_id' })
    );
    if (result === null) return;

    _todos[_selected] = { ..._todos[_selected], ...payload };
    toast('✓ To-do sauvegardée');
    if (ok) {
      ok.textContent = '✓ Sauvegardé';
      setTimeout(() => { if (ok) ok.textContent = ''; }, 3000);
    }

  } finally {
    _saving = false;
    if (btn) btn.disabled = false;
  }
}
