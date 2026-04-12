import { supabase } from '../lib/supabase.js';
import { safeQuery } from '../lib/errors.js';
import { escHtml, g } from '../lib/utils.js';
import { toast } from '../ui/toast.js';
import { isAdmin, getUser, setState } from '../lib/state.js';

const ROLE_LBL = { admin: '👑 Admin', member: '⚔ Membre', viewer: '👁 Lecteur' };

// ── Rendu ──────────────────────────────────────────────────────────────────────

export async function loadUsers() {
  if (!isAdmin()) { toast('Accès refusé', 'err'); return; }

  const [roles, membres] = await Promise.all([
    safeQuery('loadUsers:roles',   supabase.from('user_roles').select('*').order('created_at')),
    safeQuery('loadUsers:membres', supabase.from('membres').select('id,nom').order('nom')),
  ]);
  if (roles === null) return;

  const currentUser = getUser();
  g('users-count').textContent = roles.length + ' utilisateur' + (roles.length > 1 ? 's' : '');
  const tbody = g('users-body');

  if (!roles.length) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty"><div class="empty-icon">👥</div><p>Aucun utilisateur</p></div></td></tr>';
    return;
  }

  // Select d'options membres réutilisable
  const membreOptions = (membres || []).map(m =>
    `<option value="${escHtml(m.id)}">${escHtml(m.nom)}</option>`
  ).join('');

  tbody.innerHTML = roles.map(u => {
    const discordName = u.discord_name || u.id.slice(0, 8) + '...';
    const avatar      = u.discord_avatar || '';
    const isSelf      = u.id === currentUser?.id;

    const avatarEl = avatar
      ? `<img src="${escHtml(avatar)}" width="28" height="28" style="border-radius:50%;border:1px solid var(--border)"/>`
      : `<div style="width:28px;height:28px;border-radius:50%;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:13px">🎮</div>`;

    const roleSelect = `<select class="role-sel" data-uid="${escHtml(u.id)}" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:6px;font-size:13px">
      ${['admin', 'member', 'viewer'].map(r =>
        `<option value="${r}"${u.role === r ? ' selected' : ''}>${ROLE_LBL[r]}</option>`
      ).join('')}
    </select>`;

    const mainSelect = `<select class="main-sel" data-uid="${escHtml(u.id)}" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:6px;font-size:13px;max-width:140px">
      <option value="">— Aucun —</option>
      ${membreOptions.replace(
        `value="${escHtml(u.main_membre_id)}"`,
        `value="${escHtml(u.main_membre_id)}" selected`
      )}
    </select>`;

    const action = isSelf
      ? '<span style="font-size:11px;color:var(--text3)">Toi</span>'
      : `<button class="btn btn-ghost btn-sm remove-user" data-uid="${escHtml(u.id)}" style="color:var(--red);border-color:var(--red2)">Retirer</button>`;

    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px">
        ${avatarEl}
        <strong style="color:var(--text)">${escHtml(discordName)}</strong>
        ${isSelf ? '<span style="font-size:10px;color:var(--blue2);background:rgba(74,144,226,.15);padding:1px 6px;border-radius:8px">Toi</span>' : ''}
      </div></td>
      <td>${roleSelect}</td>
      <td>${mainSelect}</td>
      <td style="color:var(--text3);font-size:12px">${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
      <td>${action}</td>
    </tr>`;
  }).join('');

  // Event delegation sur le tbody
  tbody.onchange = async e => {
    const roleSel = e.target.closest('.role-sel');
    const mainSel = e.target.closest('.main-sel');
    if (roleSel) await changeRole(roleSel.dataset.uid, roleSel.value);
    if (mainSel) await changeMain(mainSel.dataset.uid, mainSel.value);
  };
  tbody.onclick = async e => {
    const btn = e.target.closest('.remove-user');
    if (btn) await removeUser(btn.dataset.uid);
  };
}

// ── Lier un perso principal à un utilisateur ──────────────────────────────────

async function changeMain(userId, membreId) {
  if (!isAdmin()) { toast('Accès refusé', 'err'); return; }
  const data = await safeQuery('changeMain',
    supabase.from('user_roles').update({ main_membre_id: membreId || null }).eq('id', userId)
  );
  if (data === null) return;
  // Mettre à jour le state si c'est le compte connecté
  if (userId === getUser()?.id) {
    setState('currentMainMembreId', membreId || null);
  }
  toast('✓ Perso principal mis à jour');
}

// ── Changer le rôle d'un utilisateur ─────────────────────────────────────────

async function changeRole(userId, newRole) {
  if (!isAdmin()) { toast('Accès refusé', 'err'); return; }
  const data = await safeQuery('changeRole',
    supabase.from('user_roles').update({ role: newRole }).eq('id', userId)
  );
  if (data === null) return;
  toast('✓ Rôle mis à jour');
}

// ── Retirer l'accès d'un utilisateur ─────────────────────────────────────────

async function removeUser(userId) {
  if (!isAdmin()) { toast('Accès refusé', 'err'); return; }
  if (!confirm("Retirer l'accès à cet utilisateur ?")) return;
  const data = await safeQuery('removeUser',
    supabase.from('user_roles').delete().eq('id', userId)
  );
  if (data === null) return;
  toast('Accès retiré');
  await loadUsers();
}
