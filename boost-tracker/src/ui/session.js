import { getSetupData, toggleSetupKey } from './coverage.js';
import { escHtml }  from '../lib/utils.js';
import { isMember } from '../lib/state.js';
import { oov, cov } from '../ui/modal.js';

// ── Init ───────────────────────────────────────────────────────────────────────

export function initSession() {
  const wrap = document.getElementById('session-btn-wrap');
  if (!wrap) return;

  // Afficher le bouton seulement si membre
  if (!isMember()) return;
  wrap.style.display = '';

  document.getElementById('btn-setup-session')
    ?.addEventListener('click', openSetupModal);
}

// ── Modale ─────────────────────────────────────────────────────────────────────

function openSetupModal() {
  const { teams, noTeam, selected, keyOf } = getSetupData();
  const body = document.getElementById('setup-session-body');
  if (!body) return;

  // ── Teams ──
  const teamsHTML = teams.length ? `
    <div class="setup-section-lbl">Teams</div>
    <div class="setup-items">
      ${teams.map(t => {
        const k = keyOf.team(t.id);
        return `<label class="setup-item">
          <input type="checkbox" class="setup-cb" data-key="${escHtml(k)}"${selected.has(k) ? ' checked' : ''}>
          <span>${escHtml(t.nom)}</span>
        </label>`;
      }).join('')}
    </div>` : '';

  // ── Hors team ──
  const horsTeamHTML = noTeam.length ? `
    <div class="setup-section-lbl" style="margin-top:12px">Hors team</div>
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

  body.innerHTML = teamsHTML + horsTeamHTML;

  // Listeners checkboxes
  body.querySelectorAll('.setup-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      toggleSetupKey(cb.dataset.key);
    });
  });

  oov('ov-setup-session');
}
