import { supabase } from '../lib/supabase.js';
import { setState, getUser } from '../lib/state.js';
import { safeQuery } from '../lib/errors.js';
import { toast } from '../ui/toast.js';
import { applyRoleRestrictions } from './roles.js';
import { g } from '../lib/utils.js';

// ── Login screen ─────────────────────────────────────────────────────────────

function showLogin() {
  g('login-screen').style.display = 'flex';
  g('app').style.display = 'none';
  g('user-bar').style.display = 'none';
}

function hideLogin() {
  g('login-screen').style.display = 'none';
  g('app').style.display = 'block';
}

function showUserBar(session, role) {
  const bar    = g('user-bar');
  const avatar = g('user-avatar');
  const name   = g('user-name');
  const badge  = g('user-role-badge');
  if (!bar) return;

  bar.style.display = 'flex';
  const d = session.user.user_metadata;
  if (avatar && d?.avatar_url) { avatar.src = d.avatar_url; avatar.style.display = 'block'; }
  if (name) name.textContent = d?.full_name || d?.name || '';

  const styles = {
    admin:  { bg: 'rgba(212,160,23,.2)',  color: '#e8d44d', text: 'ADMIN'   },
    member: { bg: 'rgba(74,144,226,.2)',  color: '#6ba5e8', text: 'MEMBRE'  },
    viewer: { bg: 'rgba(100,100,100,.2)', color: '#8890aa', text: 'LECTEUR' },
  };
  const s = styles[role] || styles.viewer;
  if (badge) {
    badge.textContent = s.text;
    badge.style.background = s.bg;
    badge.style.color = s.color;
  }
}

// ── Session handler ───────────────────────────────────────────────────────────

async function handleSession(session) {
  setState('currentUser', session.user);

  // Récupérer ou créer le rôle
  let { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!roleRow) {
    await supabase.from('user_roles').insert([{ id: session.user.id, role: 'viewer' }]);
    roleRow = { role: 'viewer' };
  }

  setState('currentRole', roleRow.role);

  // Sync metadata Discord (non bloquant)
  const d = session.user.user_metadata;
  const discordName   = d?.full_name || d?.name || d?.user_name || '';
  const discordAvatar = d?.avatar_url || '';
  if (discordName) {
    supabase.from('user_roles')
      .update({ discord_name: discordName, discord_avatar: discordAvatar })
      .eq('id', session.user.id)
      .then(() => {});
  }

  hideLogin();
  showUserBar(session, roleRow.role);
  applyRoleRestrictions(roleRow.role);

  // Déclenche le chargement de l'app
  document.dispatchEvent(new CustomEvent('app:ready'));
}

// ── Auth publiques ────────────────────────────────────────────────────────────

export async function initAuth() {
  showLogin();

  supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      handleSession(session);
    } else if (event === 'SIGNED_OUT') {
      setState('currentUser', null);
      setState('currentRole', null);
      showLogin();
    }
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (session) await handleSession(session);
}

export async function loginWithDiscord() {
  const btn = g('btn-discord-login');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span style="opacity:.7">Redirection vers Discord...</span>';
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });

  if (error) {
    const errEl = g('login-error');
    if (errEl) { errEl.textContent = 'Erreur : ' + error.message; errEl.style.display = 'block'; }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 127.14 96.36" fill="white"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg> Se connecter avec Discord`;
    }
  }
}

export async function logout() {
  await supabase.auth.signOut();
}
