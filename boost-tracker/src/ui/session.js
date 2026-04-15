import { getSelectedMembers, getCoveredDungeons } from './coverage.js';
import { DONJONS }            from '../constants.js';
import { escHtml }            from '../lib/utils.js';
import { isMember }           from '../lib/state.js';

const ROLE_ORDER   = { TANK: 0, Heal: 1 };
const SIGN_LABELS  = ['', 'Solo', 'Duo', 'Trio', 'Groupe', 'Full'];

// Abréviations courtes pour le widget (pas le texte Discord)
const DONJON_SHORT = {
  MT: 'MT', MC: 'MC', Nexus: 'NPX', WS: 'WS', AA: 'AA', Pit: 'POS', Seat: 'SEAT', Sky: 'SR',
};

// ── Init ───────────────────────────────────────────────────────────────────────

export function initSession() {
  const wrap = document.getElementById('session-widget');
  if (!wrap) return;
  document.addEventListener('coverage:changed', () => renderSession(wrap));
}

// ── Rendu du widget ────────────────────────────────────────────────────────────

function renderSession(wrap) {
  if (!isMember()) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const members = getSelectedMembers();
  if (!members.length) { wrap.innerHTML = ''; return; }

  const sorted    = [...members].sort((a, b) => (ROLE_ORDER[a.spe] ?? 2) - (ROLE_ORDER[b.spe] ?? 2));
  const nClients  = Math.max(0, 5 - sorted.length);
  const signLbl   = SIGN_LABELS[nClients] ?? 'Group';
  const covered   = getCoveredDungeons();

  // ── Ligne "Setup" : boosters + clés ──
  const setupNames = sorted.map(m => {
    const icon = m.spe === 'TANK' ? '🛡' : m.spe === 'Heal' ? '💚' : '⚔';
    return `<span class="ss-setup-name">${icon} ${escHtml(m.nom)}</span>`;
  }).join('');

  const covBadges = covered.length
    ? covered.map(k => `<span class="ss-cov-badge">${DONJON_SHORT[k] || k}</span>`).join('')
    : `<span class="ss-cov-none">Aucune clé</span>`;

  // ── Lignes détail membres ──
  const rows = sorted.map(m => {
    const roleIcon = m.spe === 'TANK' ? '🛡' : m.spe === 'Heal' ? '💚' : '⚔';
    const cls      = m.classe?.split(' ')[0] || '—';
    const key      = (m.cle_donjon && m.cle_niveau)
      ? `<span class="ss-key-yes">+${m.cle_niveau}</span>`
      : `<span class="ss-key-no">—</span>`;
    return `<div class="ss-row">
      <span class="ss-role">${roleIcon}</span>
      <span class="ss-name">${escHtml(m.nom)}</span>
      <span class="ss-cls">${escHtml(cls)}</span>
      <span class="ss-stat">${m.ilvl || '—'}</span>
      <span class="ss-stat ss-rio-val">${m.rio || '—'}</span>
      ${key}
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="ss-header">
      <span class="ss-title">${signLbl} sign</span>
      <button class="ss-copy" id="ss-copy-btn" title="Copier le texte Discord">📋</button>
    </div>
    <div class="ss-setup">
      <div class="ss-setup-names">${setupNames}</div>
      <div class="ss-setup-cov">${covBadges}</div>
    </div>
    <div class="ss-members">${rows}</div>`;

  document.getElementById('ss-copy-btn')?.addEventListener('click', () => {
    const text = generateSignText(sorted, covered);
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('ss-copy-btn');
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

// ── Génération du texte Discord ────────────────────────────────────────────────

function generateSignText(members, covered) {
  const nClients = Math.max(0, 5 - members.length);
  const signHdr  = SIGN_LABELS[nClients] ?? 'Group';

  // Ligne "Setup boost"
  const setupLine = members
    .map(m => {
      const tag = m.spe === 'TANK' ? ':Tank:' : m.spe === 'Heal' ? ':Heal:' : ':DPS:';
      return `${tag} ${m.nom}`;
    })
    .join('  ·  ');

  const covLine = covered.length
    ? `Clés couvertes : ${covered.map(k => DONJON_SHORT[k] || k).join(' · ')}`
    : 'Clés couvertes : aucune';

  // Lignes détail
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

  return [
    `Setup boost :`,
    setupLine,
    covLine,
    ``,
    `${signHdr} sign :`,
    ...signLines,
  ].join('\n');
}
