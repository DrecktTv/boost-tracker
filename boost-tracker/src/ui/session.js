import { getSelectedMembers } from './coverage.js';
import { DONJONS }            from '../constants.js';
import { escHtml }            from '../lib/utils.js';
import { isMember }           from '../lib/state.js';

const ROLE_ORDER   = { TANK: 0, Heal: 1 };
const SIGN_LABELS  = ['', 'Solo', 'Duo', 'Trio', 'Groupe', 'Full'];

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
  if (!members.length) {
    wrap.innerHTML = '';
    return;
  }

  const sorted   = [...members].sort((a, b) => (ROLE_ORDER[a.spe] ?? 2) - (ROLE_ORDER[b.spe] ?? 2));
  const nClients = Math.max(0, 5 - sorted.length);
  const signLbl  = SIGN_LABELS[nClients] ?? 'Group';

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
      <span class="ss-title">${signLbl} sign · ${sorted.length}v${nClients || 5 - sorted.length}</span>
      <button class="ss-copy" id="ss-copy-btn" title="Copier le texte Discord">📋</button>
    </div>
    <div class="ss-members">${rows}</div>`;

  document.getElementById('ss-copy-btn')?.addEventListener('click', () => {
    const text = generateSignText(sorted);
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('ss-copy-btn');
      if (!btn) return;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = '📋'; }, 1500);
    }).catch(() => {
      // fallback pour les navigateurs sans clipboard API
      const ta = document.createElement('textarea');
      ta.value = generateSignText(sorted);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  });
}

// ── Génération du texte Discord ────────────────────────────────────────────────

function generateSignText(members) {
  const nClients = Math.max(0, 5 - members.length);
  const header   = SIGN_LABELS[nClients] ?? 'Group';

  const lines = members.map(m => {
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

  return `${header} sign :\n${lines.join('\n')}`;
}
