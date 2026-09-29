import { supabase, showToast } from './supabase.js';

const LOGIN_URL = 'admin-login.html';
const ADMIN_URL = 'admin.html';

export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return { user: null, error };
    return { user: data && data.user ? data.user : null, error: null };
  } catch (e) {
    return { user: null, error: e };
  }
}

export async function getAdminRecord(userId) {
  if (!userId) return { admin: null, error: 'No user id.' };
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id, email, role, active, created_at')
      .eq('id', userId)
      .eq('active', true)
      .limit(1)
      .maybeSingle();
    if (error) return { admin: null, error };
    if (!data) return { admin: null, error: null };
    return { admin: data, error: null };
  } catch (e) {
    return { admin: null, error: e };
  }
}

export async function login(email, password) {
  if (!email || !password) {
    return { ok: false, error: 'Please enter both email and password.' };
  }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim(),
      password: String(password)
    });
    if (error) return { ok: false, error };
    const user = data && data.user ? data.user : null;
    if (!user) return { ok: false, error: 'No user returned.' };
    const { admin, error: adminErr } = await getAdminRecord(user.id);
    if (adminErr) {
      return { ok: false, error: adminErr };
    }
    if (!admin) {
      try {
        await supabase.auth.signOut();
      } catch (_) {}
      return {
        ok: false,
        error: {
          message:
            'This account is not authorized as an active admin. ' +
            'Please contact the boutique owner.'
        },
        notAdmin: true
      };
    }
    return { ok: true, user, admin };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function logoutAdmin(options) {
  const opts = options || {};
  try {
    await supabase.auth.signOut();
  } catch (_) {}
  const url = opts.redirect === false ? null : LOGIN_URL;
  if (url) {
    window.location.replace(url);
  }
}

export async function ensureActiveAdmin(options) {
  const opts = options || {};
  const { user, error: uErr } = await getCurrentUser();
  if (uErr) {
    showToast(
      uErr && uErr.message
        ? 'Session error: ' + uErr.message
        : 'Your session has expired. Please log in again.',
      'error'
    );
    if (!opts.redirect) {
      try {
        await supabase.auth.signOut();
      } catch (_) {}
      if (typeof window !== 'undefined') window.location.replace(LOGIN_URL);
    }
    return { ok: false, user: null, admin: null };
  }
  if (!user) {
    if (!opts.redirect) {
      if (typeof window !== 'undefined') window.location.replace(LOGIN_URL);
    }
    return { ok: false, user: null, admin: null };
  }
  const { admin, error: aErr } = await getAdminRecord(user.id);
  if (aErr) {
    showToast(
      aErr && aErr.message
        ? 'Authorization error: ' + aErr.message
        : 'Unable to verify admin status.',
      'error'
    );
    if (!opts.redirect) {
      try {
        await supabase.auth.signOut();
      } catch (_) {}
      if (typeof window !== 'undefined') window.location.replace(LOGIN_URL);
    }
    return { ok: false, user, admin: null };
  }
  if (!admin) {
    showToast(
      'Your account is not an active admin. You have been signed out.',
      'error'
    );
    if (!opts.redirect) {
      try {
        await supabase.auth.signOut();
      } catch (_) {}
      if (typeof window !== 'undefined') window.location.replace(LOGIN_URL);
    }
    return { ok: false, user, admin: null };
  }
  return { ok: true, user, admin };
}

export async function redirectIfAlreadyLoggedIn() {
  const { user } = await getCurrentUser();
  if (!user) return false;
  const { admin } = await getAdminRecord(user.id);
  if (!admin) return false;
  window.location.replace(ADMIN_URL);
  return true;
}
