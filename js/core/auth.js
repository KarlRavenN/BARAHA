// Auth module: all Supabase Auth calls in one place.
// UI never calls supabase.auth directly — it goes through these functions.

import { supabase } from './supabase.js';

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
  const { error } = await supabase.auth.signOut();
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
