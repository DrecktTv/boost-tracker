import { getSelectedMembers, getCoveredDungeons, getSetupData, toggleSetupKey } from './coverage.js';
import { DONJONS }   from '../constants.js';
import { escHtml }   from '../lib/utils.js';
import { isMember }  from '../lib/state.js';

const ROLE_ORDER  = { TANK: 0, Heal: 1 };
const SIGN_LABELS = ['', 'Solo', 'Duo', 'Trio', 'Groupe', 'Full'];
const DONJON_SHORT = { MT:'MT', MC:'MC', Nexus:'NPX', WS:'WS', AA:'AA', Pit:'POS', Seat:'SEAT', Sky:'SR' };

// ── Init ───────────────────────────────────────────────────────────────────────

export function initSession() {
  const wrap = document.getElementById('session-widget');
  if (!wrap) return;
  document.addEventListener('coverage:changed', () => renderSession(wrap));
}

// ── Rendu ──────────────────────────────────────────────────────────────────────

function renderSession(wrap) {
  if (!isMember()) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const { teams, noTeam, selected, keyOf } = getSetupData();
  if (!teams.length && !noTeam.length) { wrap.innerHTML = ''; return; }

  // ── Sélecteur teams ──
  const teamChips = teams.map(t => {
    const k    = keyOf.team(t.id);
    const on   = selected.has(k);
    return `<button class="ss-chip${on ? ' ss-chip-on' : ''}" data-key="${escHtml(k)}">${escHtml(t.nom)}</button>`;
  }).join('');

  // ── Sélecteur membres sans team ──
  const memberChips = noTeam.map(m => {
    const k  = keyOf.membre(m.id);
    const on = selected.has(k);
    const icon = m.spe === 'TANK' ? '🛡' : m.spe === 'Heal' ? '💚' : '⚔';
    return `<button class="ss-chip${on ? ' ss-chip-on' : ''}" data-key="${escHtml(k)}">${icon} ${escHtml(m.nom)}</button>`;
  }).join('');

  const noTeamSection = noTeam.length ? `
    <div class="ss-sel-sep"></div>
    <div class="ss-sel-lbl">Sans team</div>
    <div class="ss-chips">${memberChips}</div>` : '';

  // ── Partie sign (si au moins 1 sélectionné) ──
  const members = getSelectedMembers();
  const signHTML = members.length ? renderSign(members) : '';

  wrap.innerHTML = `
    <div class="ss-setup-block">
      <div class="ss-setup-header">
        <span class="ss-title">Setup session</span>
      </div>
      ${teams.length ? `<div class="ss-chips">${teamChips}</div>` : ''}
      ${noTeamSection}
    </div>
    ${signHTML}`;

  // Délégation de clic sur les chips
  wrap.querySelectorAll('.ss-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleSetupKey(btn.dataset.key);
      // coverage:changed sera dispatché par toggleSetupKey → saveSelection
    });
  });

  // Bouton copier
  wrap.querySelector('#ss-copy-btn')?.addEventListener('click', () => {
    const sorted = [...members].sort((a, b) => (ROLE_ORDER[a.spe] ?? 2) - (ROLE_ORDER[b.spe] ?? 2));
    const text   = generateSignText(sorted, getCoveredDungeons());
    navigator.clipboard.writeText(text).then(() => {
      const btn = wrap.querySelector('#ss-copy-btn');
      if (!btn) return;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = '📋'; }, 1500);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  });
}

function renderSign(members) {
  const sorted    = [...members].sort((a, b) => (ROLE_ORDER[a.spe] ?? 2) - (ROLE_ORDER[b.spe] ?? 2));
  const nClients  = Math.max(0, 5 - sorted.length);
  const signLbl   = SIGN_LABELS[nClients] ?? 'Group';
  const covered   = getCoveredDungeons();

  const covBadges = covered.length
    ? covered.map(k => `<span class="ss-cov-badge">${DONJON_SHORT[k] || k}</span>`).join('')
    : `<span class="ss-cov-none">Aucune clé</span>`;

  const rows = sorted.map(m => {
    const icon = m.spe === 'TANK' ? '🛡' : m.spe === 'Heal' ? '💚' : '⚔';
    const cls  = m.classe?.split(' ')[0] || '—';
    const key  = (m.cle_donjon && m.cle_niveau)
      ? `<span class="ss-key-yes">+${m.cle_niveau}</span>`
      : `<span class="ss-key-no">—</span>`;
    return `<div class="ss-row">
      <span class="ss-role">${icon}</span>
      <span class="ss-name">${escHtml(m.nom)}</span>
      <span class="ss-cls">${escHtml(cls)}</span>
      <span class="ss-stat">${m.ilvl || '—'}</span>
      <span class="ss-stat ss-rio-val">${m.rio || '—'}</span>
      ${key}
    </div>`;
  }).join('');

  return `
    <div class="ss-sign-block">
      <div class="ss-sign-header">
        <span class="ss-sign-label">${signLbl} sign</span>
        <div class="ss-cov-row">${covBadges}</div>
        <button class="ss-copy" id="ss-copy-btn" title="Copier le texte Discord">📋</button>
      </div>
      <div class="ss-members">${rows}</div>
    </div>`;
}

// ── Génération du texte Discord ────────────────────────────────────────────────

function generateSignText(members, covered) {
  const nClients = Math.max(0, 5 - members.length);
  const signHdr  = SIGN_LABELS[nClients] ?? 'Group';

  const setupLine = members
    .map(m => {
      const tag = m.spe === 'TANK' ? ':Tank:' : m.spe === 'Heal' ? ':Heal:' : ':DPS:';
      return `${tag} ${m.nom}`;
    })
    .join('  ·  ');

  const covLine = covered.length
    ? `Clés couvertes : ${covered.map(k => DONJON_SHORT[k] || k).join(' · ')}`
    : 'Clés couvertes : aucune';

  const signLines = members.map(m => {
    const roleTag = m.spe === 'TANK' ? ':Tank:' : m.spe === 'Heal' ? ':Heal:' : ':DPS:';
    const cls     = m.classe?.split(' ')[0] || '—';
    const rio     = m.rio  || '?';
    const ilvl    = m.ilvl || '?';
    const key     = (m.cle_donjon && m.cle_niveau)
      ? `+${m.cle_niveau} ${DONJONS[m.cle_donjon]?.fr || m.cle_donjon}`
      : 'no key';
    const trade   = m.can_trade || 'Can trade all';
    return `${roleTag}  ${cls.padEnd(12)} / :Raiderio: ${rio} / :Keystone: ${key} / ${ilvl} ilvl  / ${trade}`;
  });

  return [`Setup boost :`, setupLine, covLine, ``, `${signHdr} sign :`, ...signLines].join('\n');
}
