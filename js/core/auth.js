// Auth module: all Supabase Auth calls in one place.
// UI never calls supabase.auth directly — it goes through these functions.

import { supabase, getUser } from './supabase.js';

// main.js imports getUser from here, so re-export it (it lives in supabase.js)
export { getUser };

// ── Sign up ────────────────────────────────────────────────────────────────

/**
 * Register a new user.
 * @param {string} email
 * @param {string} password
 * @param {string} displayName  rapper / display name shown in the app
 * @returns {Promise<{error: null|Error}>}
 */
export async function signUp(email, password, displayName) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  return { error };
}

// ── OTP verify (email code) ────────────────────────────────────────────────

/**
 * Verify the 6-digit OTP that Supabase emailed.
 * Used for both sign-up confirmation and password-reset.
 * @param {string} email
 * @param {string} token  6-digit code
 * @param {'signup'|'recovery'} type
 */
export async function verifyOtp(email, token, type = 'signup') {
  const { error } = await supabase.auth.verifyOtp({ email, token, type });
  return { error };
}

/**
 * Resend the OTP email.
 * @param {string} email
 * @param {'signup'|'recovery'} type
 */
export async function resendOtp(email, type = 'signup') {
  if (type === 'signup') {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    return { error };
  } else {
    // For recovery, re-trigger the forgot-password flow
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    return { error };
  }
}

// ── Sign in ────────────────────────────────────────────────────────────────

/**
 * Sign in with email + password.
 */
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

// ── Forgot password ────────────────────────────────────────────────────────

/**
 * Send a password-reset OTP to the user's email.
 */
export async function forgotPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  return { error };
}

/**
 * Set a new password (called after OTP is verified for recovery).
 */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error };
}

// ── Sign out ───────────────────────────────────────────────────────────────

export async function signOut() {
    // 'local' = sign out this device only
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  return { error };
}

// ── Session listener ───────────────────────────────────────────────────────

/**
 * Subscribe to auth state changes.
 * @param {(event: string, session: object|null) => void} callback
 * @returns unsubscribe function
 */
export function onAuthChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

// ── Profile (Batch C) ──────────────────────────────────────────────────────

/** Same rule as registration (auth-screens.js): at least 8 characters. */
export const PASSWORD_MIN = 8;
export const passwordProblem = (pw) =>
  !pw || pw.length < PASSWORD_MIN ? `Password must be at least ${PASSWORD_MIN} characters.` : null;

/** Save the rapper name shown in the app. Resolves { user, error }. */
export async function updateDisplayName(name) {
  const { data, error } = await supabase.auth.updateUser({ data: { display_name: name } });
  return { user: data?.user ?? null, error };
}

/**
 * Change password safely: prove the current password first, then set the new one.
 * Resolves { error, wrongCurrent }.
 */
export async function changePassword(email, currentPassword, newPassword) {
  const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (checkError) return { error: checkError, wrongCurrent: true };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error, wrongCurrent: false };
}
