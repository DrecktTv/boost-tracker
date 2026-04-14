import { supabase }                      from '../lib/supabase.js';
import { safeQuery }                     from '../lib/errors.js';
import { getWclToken, wclQuery, parseReportCode, REPORT_QUERY } from '../lib/wcl.js';
import { oov, cov }                      from '../ui/modal.js';
import { toast }                         from '../ui/toast.js';
import { escHtml }                       from '../lib/utils.js';
import { isMember }                      from '../lib/state.js';
import { renderTracker }                 from './tracker.js';
import { CLE_OPTIONS, WCL_DUNGEON_MAP, DONJONS, SLOT_DEFS, SPE_COLORS } from '../constants.js';

// ── State ──────────────────────────────────────────────────────────────────────

let _report   = null;   // raw WCL report data
let _membres  = [];
let _teams    = [];
let _slots    = [];
let _fights   = [];     // parsed M+ fights (enriched)
let _selected = new Set(); // fight IDs sélectionnés

// ── Init ───────────────────────────────────────────────────────────────────────

export function initWclImport() {
  // Mount btn-wcl-import listener — already done in main.js via on()
}

export function openWclImport() {
  if (!isMember()) return;
  _reset();
  oov('ov-wcl');
  renderStep0();
}

function _reset() {
  _report = null; _fights = []; _selected = new Set();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function body()  { return document.getElementById('wcl-modal-body'); }
function foot()  { return document.getElementById('wcl-modal-foot'); }
function title() { return document.getElementById('wcl-modal-title'); }

function setStep(t) {
  title().textContent = t;
}

function formatTime(epochMs) {
  return new Date(epochMs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function wclRoleFromSubType(sub = '') {
  if (/tank|blood|protection|vengeance|guardian|brewmaster/i.test(sub)) return 'TANK';
  if (/heal|holy|disc|restor|preserv|mistwea/i.test(sub))               return 'Heal';
  return 'DPS';
}

function dotColor(membre) {
  if (!membre) return 'var(--text3)';
  const cls = membre.classe?.split(' ')[0] || '';
  return SPE_COLORS[cls] || 'var(--text3)';
}

function detectTeam(membreIds) {
  const mSet = new Set(membreIds.filter(Boolean));
  if (mSet.size < 4) return null;
  return _teams.find(team => {
    const tIds = new Set(_slots.filter(s => s.team_id === team.id && s.membre_id).map(s => s.membre_id));
    return [...mSet].every(id => tIds.has(id));
  }) ?? null;
}

function buildPlayers(fight, actorMap) {
  const friendly = new Set(fight.friendlyPlayers || []);
  const actors = [...actorMap.values()].filter(a => a.type === 'Player' && friendly.has(a.id));
  const byNom  = new Map(_membres.map(m => [m.nom.toLowerCase(), m]));

  return actors.map(actor => {
    const membre = byNom.get(actor.name.toLowerCase()) ?? null;
    const role   = membre
      ? (membre.spe === 'TANK' ? 'TANK' : membre.spe === 'Heal' ? 'Heal' : 'DPS')
      : wclRoleFromSubType(actor.subType);
    return { actor, membre, role, isBooster: !!membre };
  });
}

function buildRunMembres(players, team, prix) {
  const boosters = players.filter(p => p.isBooster);
  const result   = [];
  let dpsSlot = 0;

  if (team) {
    const teamSlots = _slots.filter(s => s.team_id === team.id);
    for (const ts of teamSlots) {
      const p = boosters.find(b => b.membre?.id === ts.membre_id);
      result.push({
        slot_index: ts.slot_index,
        role:       SLOT_DEFS[ts.slot_index].role,
        membre_id:  p ? (p.membre?.id ?? null) : null,
        tarif:      prix,
        paid:       false,
      });
    }
    // Ajouter les boosters manuels (sans membre_id) non couverts par les slots team
    const teamMemberIds = new Set(teamSlots.map(s => s.membre_id).filter(Boolean));
    for (const p of boosters) {
      if (!p.membre || !teamMemberIds.has(p.membre.id)) {
        if      (p.role === 'TANK') dpsSlot = 2;
        else if (p.role === 'Heal') dpsSlot = 3;
        else dpsSlot = result.filter(r => r.role === 'DPS').length === 0 ? 0 : 1;
        result.push({ slot_index: dpsSlot, role: SLOT_DEFS[dpsSlot]?.role ?? p.role, membre_id: null, tarif: prix, paid: false });
      }
    }
    return result;
  }

  for (const p of boosters) {
    let si;
    if      (p.role === 'TANK') si = 2;
    else if (p.role === 'Heal') si = 3;
    else si = dpsSlot++ < 1 ? 0 : 1;
    result.push({ slot_index: si, role: SLOT_DEFS[si].role, membre_id: p.membre?.id ?? null, tarif: prix, paid: false });
  }
  return result;
}

// ── Step 0 — URL input ─────────────────────────────────────────────────────────

function renderStep0() {
  setStep('Import WarcraftLogs');
  body().innerHTML = `
    <div class="wcl-intro">
      <p class="wcl-hint">Colle une URL de report WarcraftLogs. Tous les runs M+ complétés seront détectés automatiquement.</p>
      <div class="fg">
        <label>URL du report</label>
        <input id="wcl-url" placeholder="https://www.warcraftlogs.com/reports/ABC123..." autocomplete="off">
      </div>
      <div id="wcl-error" class="wcl-error" style="display:none"></div>
    </div>`;
  foot().innerHTML = `
    <button class="btn btn-ghost" data-close="ov-wcl">Annuler</button>
    <button class="btn btn-primary" id="wcl-btn-analyze">Analyser →</button>`;

  document.getElementById('wcl-btn-analyze').addEventListener('click', async () => {
    const url = document.getElementById('wcl-url').value.trim();
    if (!url) { showError('Entre une URL WarcraftLogs.'); return; }
    const code = parseReportCode(url);
    if (!code) { showError('URL invalide — exemple : warcraftlogs.com/reports/ABC123'); return; }
    await analyzeReport(code);
  });

  document.getElementById('wcl-url').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('wcl-btn-analyze')?.click();
  });
}

function showError(msg) {
  const el = document.getElementById('wcl-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

function setLoading(text) {
  foot().innerHTML = `<span class="wcl-loading">${text}</span>`;
}

// ── Analyze ────────────────────────────────────────────────────────────────────

async function analyzeReport(code) {
  setLoading('Récupération du token…');

  // Fetch Supabase data in parallel with WCL auth
  try {
    const [membres, teams, slots, token] = await Promise.all([
      safeQuery('wcl:membres', supabase.from('membres').select('id,nom,spe,classe')),
      safeQuery('wcl:teams',   supabase.from('teams').select('id,nom').order('created_at')),
      safeQuery('wcl:slots',   supabase.from('team_slots').select('*')),
      getWclToken(),
    ]);

    if (!membres || !teams) { renderStep0(); showError('Erreur Supabase.'); return; }
    _membres = membres; _teams = teams || []; _slots = slots || [];

    setLoading('Analyse du report…');
    const data = await wclQuery(token, REPORT_QUERY, { code });
    const report = data?.reportData?.report;
    if (!report) { renderStep0(); showError('Report introuvable ou privé.'); return; }

    _report = report;

    // Build actor map
    const actorMap = new Map(
      (report.masterData?.actors || [])
        .filter(a => a.type === 'Player')
        .map(a => [a.id, a])
    );

    // Filter M+ completed fights
    const mPlusFights = (report.fights || [])
      .filter(f => f.keystoneLevel != null && f.kill === true);

    if (!mPlusFights.length) {
      renderStep0();
      showError('Aucun run M+ complété trouvé dans ce report.');
      return;
    }

    // Enrich fights
    _fights = mPlusFights.map(f => {
      const players  = buildPlayers(f, actorMap);
      const mIds     = players.filter(p => p.membre).map(p => p.membre.id);
      const team     = detectTeam(mIds);
      const cleKey   = WCL_DUNGEON_MAP[f.name.toLowerCase()] ?? null;
      const absStart = report.startTime + f.startTime;
      return { ...f, players, team, cleKey, absStart };
    });

    renderStep1();
  } catch (err) {
    renderStep0();
    showError(err.message || 'Erreur inconnue');
  }
}

// ── Step 1 — Fight list ────────────────────────────────────────────────────────

function renderStep1() {
  setStep(`${_fights.length} run${_fights.length > 1 ? 's' : ''} détecté${_fights.length > 1 ? 's' : ''}`);
  _selected = new Set(_fights.map(f => f.id)); // tout coché par défaut

  const rows = _fights.map(f => {
    const dInfo  = f.cleKey ? DONJONS[f.cleKey] : null;
    const dur    = formatDuration(f.endTime - f.startTime);
    const time   = formatTime(f.absStart);
    const persos = f.players.map(p => {
      const color = p.membre ? dotColor(p.membre) : 'var(--text3)';
      const name  = escHtml(p.actor.name);
      const cls   = p.membre ? 'wcl-p-found' : 'wcl-p-client';
      return `<span class="wcl-p-chip ${cls}" title="${p.membre ? p.membre.nom : 'Non membre'}">
        <span class="wcl-p-dot" style="background:${color}"></span>${name}
      </span>`;
    }).join('');

    return `<tr class="wcl-fight-row" data-fid="${f.id}">
      <td><input type="checkbox" class="wcl-chk" data-fid="${f.id}" checked></td>
      <td class="wcl-td-time">${time}</td>
      <td class="wcl-td-donjon">
        ${dInfo ? `<img src="${escHtml(dInfo.img)}" class="wcl-donjon-img" alt="">` : ''}
        <span>${dInfo ? escHtml(dInfo.fr) : escHtml(f.name)}</span>
      </td>
      <td><span class="wcl-level">+${f.keystoneLevel}</span></td>
      <td class="wcl-td-dur">${dur}</td>
      <td class="wcl-td-persos">${persos}</td>
    </tr>`;
  }).join('');

  body().innerHTML = `
    <div class="wcl-select-all-row">
      <label><input type="checkbox" id="wcl-chk-all" checked> Tout sélectionner</label>
    </div>
    <div class="wcl-table-wrap">
      <table class="wcl-table">
        <thead><tr>
          <th></th><th>Heure</th><th>Donjon</th><th>Niv.</th><th>Durée</th><th>Participants</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Checkbox all
  document.getElementById('wcl-chk-all').addEventListener('change', e => {
    document.querySelectorAll('.wcl-chk').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) _selected.add(+cb.dataset.fid);
      else _selected.delete(+cb.dataset.fid);
    });
    updateStep1Foot();
  });

  document.querySelectorAll('.wcl-chk').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _selected.add(+cb.dataset.fid);
      else _selected.delete(+cb.dataset.fid);
      updateStep1Foot();
    });
  });

  updateStep1Foot();
}

function updateStep1Foot() {
  const n = _selected.size;
  foot().innerHTML = `
    <button class="btn btn-ghost" id="wcl-back-0">← Retour</button>
    <button class="btn btn-primary" id="wcl-btn-continue" ${n === 0 ? 'disabled' : ''}>
      Continuer avec ${n} run${n > 1 ? 's' : ''} →
    </button>`;
  document.getElementById('wcl-back-0').addEventListener('click', () => { _reset(); renderStep0(); });
  document.getElementById('wcl-btn-continue').addEventListener('click', renderStep2);
}

// ── Step 2 — Review ────────────────────────────────────────────────────────────

function renderPlayerRow(p, fid, pidx) {
  const roleLabel = p.role === 'TANK' ? '🛡' : p.role === 'Heal' ? '💚' : '⚔';
  if (p.isBooster) {
    const color = p.membre ? dotColor(p.membre) : 'var(--blue2)';
    const name  = p.membre ? escHtml(p.membre.nom) : escHtml(p.actor.name);
    const added = !p.membre ? `<span class="wcl-pr-tag wcl-pr-tag-added">+ajouté</span>` : '';
    return `<div class="wcl-pr wcl-pr-found" data-fid="${fid}" data-pidx="${pidx}">
      <span class="wcl-pr-dot" style="background:${color}"></span>
      <span class="wcl-pr-role">${roleLabel}</span>
      <span class="wcl-pr-name">${name}</span>
      ${added}
      <button class="wcl-toggle-btn wcl-toggle-to-client" data-fid="${fid}" data-pidx="${pidx}">→ Client</button>
    </div>`;
  }
  return `<div class="wcl-pr wcl-pr-client" data-fid="${fid}" data-pidx="${pidx}">
    <span class="wcl-pr-dot" style="background:var(--text3)"></span>
    <span class="wcl-pr-role">👤</span>
    <span class="wcl-pr-name">${escHtml(p.actor.name)}</span>
    <span class="wcl-pr-tag">Client</span>
    <button class="wcl-toggle-btn wcl-toggle-to-booster" data-fid="${fid}" data-pidx="${pidx}">+ Booster</button>
  </div>`;
}

function renderStep2() {
  const selectedFights = _fights.filter(f => _selected.has(f.id));
  setStep(`Review — ${selectedFights.length} run${selectedFights.length > 1 ? 's' : ''}`);

  const cards = selectedFights.map(f => {
    const dInfo = f.cleKey ? DONJONS[f.cleKey] : null;

    const playerRows = f.players.map((p, pidx) =>
      renderPlayerRow(p, f.id, pidx)
    ).join('');

    const teamBadge = f.team
      ? `<span class="wcl-team-badge">${escHtml(f.team.nom)}</span>`
      : `<span class="wcl-team-badge wcl-team-none">Sans team</span>`;

    const donjonSel = !f.cleKey ? `
      <select class="wcl-donjon-sel" data-fid="${f.id}">
        <option value="">— Sélectionner le donjon —</option>
        ${CLE_OPTIONS.map(k => `<option value="${k}">${DONJONS[k]?.fr || k}</option>`).join('')}
      </select>` : '';

    return `<div class="wcl-run-card" data-fid="${f.id}">
      <div class="wcl-card-head" ${dInfo ? `style="background-image:url(${escHtml(dInfo.img)})"` : ''}>
        <div class="wcl-card-head-overlay"></div>
        <div class="wcl-card-head-info">
          <span class="wcl-card-level">+${f.keystoneLevel}</span>
          <span class="wcl-card-name">${dInfo ? escHtml(dInfo.fr) : escHtml(f.name)}</span>
          <span class="wcl-card-time">${formatTime(f.absStart)} · ${formatDuration(f.endTime - f.startTime)}</span>
        </div>
        ${teamBadge}
      </div>
      ${donjonSel}
      <div class="wcl-card-players">${playerRows}</div>
    </div>`;
  }).join('');

  body().innerHTML = `
    <div class="wcl-prix-row">
      <label class="wcl-prix-lbl">Prix par personne 🪙</label>
      <input id="wcl-prix" type="number" class="wcl-prix-inp" placeholder="25" min="0">
    </div>
    <div class="wcl-cards">${cards}</div>`;

  // Donjon select listeners (when dungeon not found)
  document.querySelectorAll('.wcl-donjon-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const fid   = +sel.dataset.fid;
      const fight = _fights.find(f => f.id === fid);
      if (fight) fight.cleKey = sel.value || null;
    });
  });

  // Toggle booster/client par délégation
  body().addEventListener('click', e => {
    const btn = e.target.closest('.wcl-toggle-btn');
    if (!btn) return;
    const fid  = +btn.dataset.fid;
    const pidx = +btn.dataset.pidx;
    const fight = _fights.find(f => f.id === fid);
    if (!fight) return;
    fight.players[pidx].isBooster = !fight.players[pidx].isBooster;
    const row = body().querySelector(`.wcl-pr[data-fid="${fid}"][data-pidx="${pidx}"]`);
    if (row) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderPlayerRow(fight.players[pidx], fid, pidx);
      row.replaceWith(tmp.firstElementChild);
    }
  });

  foot().innerHTML = `
    <button class="btn btn-ghost" id="wcl-back-1">← Retour</button>
    <button class="btn btn-primary" id="wcl-btn-import">⬇ Importer ${selectedFights.length} run${selectedFights.length > 1 ? 's' : ''}</button>`;

  document.getElementById('wcl-back-1').addEventListener('click', renderStep1);
  document.getElementById('wcl-btn-import').addEventListener('click', () => doImport(selectedFights));
}

// ── Import ─────────────────────────────────────────────────────────────────────

async function doImport(selectedFights) {
  const prixRaw = parseFloat(document.getElementById('wcl-prix')?.value);
  const prix    = isNaN(prixRaw) ? 0 : prixRaw;

  const btn = document.getElementById('wcl-btn-import');
  if (btn) { btn.disabled = true; btn.textContent = 'Import en cours…'; }

  let ok = 0, fail = 0;

  for (const f of selectedFights) {
    if (!f.cleKey) { fail++; continue; } // donjon non sélectionné

    const runMembres = buildRunMembres(f.players, f.team, prix);

    const res = await safeQuery('wcl:insert', supabase.from('runs').insert([{
      team_id: f.team?.id ?? null,
      cle:     f.cleKey,
      cles:    [f.cleKey],
      note:    '',
      prix,
      membres: runMembres,
      paye:    false,
      date:    new Date(f.absStart).toISOString(),
    }]));

    if (res === null) fail++; else ok++;
  }

  cov('ov-wcl');

  if (ok > 0) {
    toast(`✅ ${ok} run${ok > 1 ? 's' : ''} importé${ok > 1 ? 's' : ''}`);
    await renderTracker();
  }
  if (fail > 0) toast(`⚠ ${fail} run${fail > 1 ? 's' : ''} ignoré${fail > 1 ? 's' : ''} (donjon manquant)`, 'err');
}
