import { SPE_COLORS, ICON_DPS, ICON_TANK, ICON_HEAL, ICON_GOLD } from '../constants.js';
import { escHtml, gold } from '../lib/utils.js';

/** Retourne un span emoji selon le rôle */
export function roleImg(role, size = 22) {
  const r = role?.startsWith('DPS') ? 'DPS' : (role || 'DPS');
  const s = Math.round(size * 0.85);
  if (r === 'TANK') return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex-shrink:0;font-size:${s}px" title="Tank">🛡</span>`;
  if (r === 'Heal') return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex-shrink:0;font-size:${s}px" title="Heal">🍃</span>`;
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;flex-shrink:0;font-size:${s}px" title="DPS">⚔️</span>`;
}

/** Retourne la couleur hex d'une classe WoW */
export function speColor(classe) {
  if (!classe) return '#555';
  for (const [k, c] of Object.entries(SPE_COLORS)) {
    if (classe.startsWith(k)) return c;
  }
  return '#555';
}

/** Construit une ligne de classement ladder */
function buildLadderRow(index, id, data) {
  const medals = ['r1', 'r2', 'r3'];
  const tops   = ['top1', 'top2', 'top3'];
  const rankCls = medals[index] || '';
  const topCls  = tops[index] || '';
  const color   = speColor(data.classe || '');
  const roleKey = data.spe?.startsWith('DPS') ? 'DPS' : (data.spe || 'DPS');

  return `<div class="ladder-row ${topCls}">
    <div class="lrank ${rankCls}">${index + 1}</div>
    ${roleImg(roleKey, 20)}
    <span class="class-dot" style="background:${color};width:7px;height:7px;border-radius:50%"></span>
    <div style="flex:1;min-width:0">
      <div class="lname">${escHtml(data.nom)}</div>
      <div style="display:flex;gap:10px;margin-top:2px">
        ${data.classe ? `<span class="lspe">${escHtml(data.classe.split(' ')[0])}</span>` : ''}
        <span class="lruns">${data.runs} run${data.runs > 1 ? 's' : ''}</span>
      </div>
    </div>
    <div class="lgold">
      <img src="${ICON_GOLD}" style="width:20px;height:20px;object-fit:contain"/>
      ${gold(data.earned)}
    </div>
  </div>`;
}

/** Construit la liste ladder à partir d'un tableau trié [[id, data], ...] */
export function renderLadderRows(sorted, emptyMsg) {
  if (!sorted.length) {
    return `<div class="empty"><div class="empty-icon">🏆</div><p>${emptyMsg}</p></div>`;
  }
  return `<div class="ladder-list">${sorted.map(([id, d], i) => buildLadderRow(i, id, d)).join('')}</div>`;
}
