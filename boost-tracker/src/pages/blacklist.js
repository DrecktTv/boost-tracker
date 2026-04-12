import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, formatDate, g, setLoading } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { oov, cov } from '../ui/modal.js';
import { isMember } from '../lib/state.js';

let _cache = []; // cache local pour filtrage sans re-fetch

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function renderBlacklist() {
  setLoading('bl-list');
  const data = await safeQuery('renderBlacklist',
    supabase.from('blacklist').select('*').order('date', { ascending: false })
  );
  if (data === null) return;
  _cache = data;

  g('bl-count').textContent = data.length;
  const search = g('bl-search')?.value || '';
  filterBL(search);
}

export function filterBL(query) {
  const q = (query || '').toLowerCase().trim();
  const filtered = q
    ? _cache.filter(e => e.nom?.toLowerCase().includes(q) || e.raison?.toLowerCase().includes(q))
    : _cache;

  const cont = g('bl-list');

  if (!filtered.length) {
    cont.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><p>${q ? 'Aucun résultat pour ' + escHtml(q) : 'Aucun joueur blacklisté'}</p></div>`;
    return;
  }

  // Construction sûre avec textContent pour les données user (anti-XSS)
  cont.innerHTML = '';
  filtered.forEach(entry => cont.appendChild(buildRow(entry)));
}

function buildRow(entry) {
  const row = document.createElement('div');
  row.style.cssText = 'background:var(--bg1);border:1px solid var(--border);border-left:3px solid var(--red);border-radius:var(--rad2);padding:14px 18px;display:flex;align-items:center;gap:14px';

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:20px;flex-shrink:0';
  icon.textContent = '🚫';

  const info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0';

  const nom = document.createElement('div');
  nom.style.cssText = 'font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px';
  nom.textContent = entry.nom; // textContent = XSS safe

  const meta = document.createElement('div');
  meta.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:center';

  if (entry.raison) {
    const raison = document.createElement('span');
    raison.style.cssText = 'font-size:13px;color:var(--red);font-weight:600';
    raison.textContent = entry.raison;
    meta.appendChild(raison);
  }

  if (entry.rio) {
    const rio = document.createElement('a');
    rio.href = entry.rio;
    rio.target = '_blank';
    rio.rel = 'noopener noreferrer';
    rio.style.cssText = 'font-size:11px;color:var(--text3)';
    rio.textContent = 'raider.io';
    meta.appendChild(rio);
  }

  const date = document.createElement('span');
  date.style.cssText = 'font-size:11px;color:var(--text3)';
  date.textContent = formatDate(entry.date, { day: '2-digit', month: '2-digit', year: 'numeric' });
  meta.appendChild(date);

  info.append(nom, meta);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-ghost btn-sm';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', () => delBL(entry.id));

  row.append(icon, info, delBtn);
  return row;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export function openAddBL() {
  if (!isMember()) { toast('Accès refusé', 'err'); return; }
  ['bl-nom', 'bl-rio', 'bl-raison'].forEach(id => { g(id).value = ''; });
  oov('ov-bl');
}

export async function saveBL() {
  const nom = g('bl-nom').value.trim();
  if (!nom) { toast('Nom requis', 'err'); return; }

  const entry = {
    nom,
    rio:    g('bl-rio').value.trim()    || null,
    raison: g('bl-raison').value.trim() || null,
    date:   new Date().toISOString(),
  };

  const data = await safeQuery('saveBL', supabase.from('blacklist').insert([entry]));
  if (data === null) return;

  cov('ov-bl');
  toast('🚫 ' + nom + ' blacklisté');
  await renderBlacklist();
}

async function delBL(id) {
  if (!confirm('Retirer de la blacklist ?')) return;
  const data = await safeQuery('delBL', supabase.from('blacklist').delete().eq('id', id));
  if (data === null) return;
  toast('Retiré de la blacklist');
  await renderBlacklist();
}
