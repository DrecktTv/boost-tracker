import { getSetupData, toggleSetupKey, getAllMembres, setSelection } from './coverage.js';
import { escHtml }  from '../lib/utils.js';
import { isMember } from '../lib/state.js';
import { oov }      from './modal.js';

const MAX_MANUAL = 4;
let _activeTab   = 'teams'; // 'teams' | 'manual'
let _manualKeys  = new Set(); // m:{id} sélectionnés en mode manuel

// ── Init ───────────────────────────────────────────────────────────────────────

export function initSession() {
  const wrap = document.getElementById('session-btn-wrap');
  if (!wrap || !isMember()) return;
  wrap.style.display = '';
  document.getElementById('btn-setup-session')?.addEventListener('click', openSetupModal);
}

// ── Modale ─────────────────────────────────────────────────────────────────────

function openSetupModal() {
  renderModal();
  oov('ov-setup-session');
}

function renderModal() {
  const body = document.getElementById('setup-session-body');
  if (!body) return;

  body.innerHTML = `
    <div class="setup-tabs">
      <button class="setup-tab${_activeTab === 'teams'  ? ' active' : ''}" data-tab="teams">Teams</button>
      <button class="setup-tab${_activeTab === 'manual' ? ' active' : ''}" data-tab="manual">Composition manuelle</button>
    </div>
    <div id="setup-tab-content"></div>`;

  body.querySelectorAll('.setup-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      body.querySelectorAll('.setup-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _activeTab));
      renderTabContent();
    });
  });

  renderTabContent();
}

function renderTabContent() {
  const content = document.getElementById('setup-tab-content');
  if (!content) return;
  _activeTab === 'teams' ? renderTeamsTab(content) : renderManualTab(content);
}

// ── Onglet Teams ──────────────────────────────────────────────────────────────

function renderTeamsTab(content) {
  const { teams, noTeam, selected, keyOf } = getSetupData();

  const teamsHTML = teams.length ? `
    <p class="setup-section-lbl">Teams</p>
    <div class="setup-items">
      ${teams.map(t => {
        const k = keyOf.team(t.id);
        return `<label class="setup-item">
          <input type="checkbox" class="setup-cb" data-key="${escHtml(k)}"${selected.has(k) ? ' checked' : ''}>
          <span>${escHtml(t.nom)}</span>
        </label>`;
      }).join('')}
    </div>` : '';

  const noTeamHTML = noTeam.length ? `
    <p class="setup-section-lbl" style="margin-top:16px">Hors team</p>
    <div class="setup-items">
      ${noTeam.map(m => {
        const k    = keyOf.membre(m.id);
        const icon = m.spe === 'TANK' ? '🛡' : m.spe === 'Heal' ? '💚' : '⚔';
        return `<label class="setup-item">
          <input type="checkbox" class="setup-cb" data-key="${escHtml(k)}"${selected.has(k) ? ' checked' : ''}>
          <span>${icon} ${escHtml(m.nom)}</span>
        </label>`;
      }).join('')}
    </div>` : '';

  content.innerHTML = teamsHTML + noTeamHTML || '<p style="color:var(--text3);font-size:13px">Aucune team ou membre trouvé.</p>';

  content.querySelectorAll('.setup-cb').forEach(cb => {
    cb.addEventListener('change', () => toggleSetupKey(cb.dataset.key));
  });
}

// ── Onglet Composition manuelle ───────────────────────────────────────────────

function renderManualTab(content) {
  const membres = getAllMembres();
  const count   = _manualKeys.size;

  content.innerHTML = `
    <p class="setup-hint">Sélectionne jusqu'à ${MAX_MANUAL} personnages · <strong>${count}/${MAX_MANUAL}</strong> choisis</p>
    <div class="setup-items">
      ${membres.map(m => {
        const k      = `m:${m.id}`;
        const checked = _manualKeys.has(k);
        const icon   = m.spe === 'TANK' ? '🛡' : m.spe === 'Heal' ? '💚' : '⚔';
        const cls    = m.classe?.split(' ')[0] || '';
        const stats  = (m.ilvl || m.rio) ? `<span class="setup-item-stats">${m.ilvl ? m.ilvl + ' ilvl' : ''}${m.ilvl && m.rio ? ' · ' : ''}${m.rio ? m.rio + ' rio' : ''}</span>` : '';
        const disabled = !checked && count >= MAX_MANUAL;
        return `<label class="setup-item${disabled ? ' setup-item-disabled' : ''}">
          <input type="checkbox" class="setup-manual-cb" data-key="${escHtml(k)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
          <span class="setup-item-name">${icon} ${escHtml(m.nom)}</span>
          <span class="setup-item-cls">${escHtml(cls)}</span>
          ${stats}
        </label>`;
      }).join('')}
    </div>`;

  content.querySelectorAll('.setup-manual-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _manualKeys.add(cb.dataset.key);
      else _manualKeys.delete(cb.dataset.key);
      setSelection([..._manualKeys]);
      renderManualTab(content); // re-render pour màj le compteur + disabled
    });
  });
}
