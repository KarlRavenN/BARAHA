// Supabase client — loaded from CDN, no build step needed.
// The anon/publishable key is intentionally public: it only grants access
// that row-level security policies allow. Never put the service_role key here.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';

const SUPABASE_URL = 'https://lzfhutrhbogprhhahsns.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IYAMUhMImjAB6G0kko_vgA_squSKMuQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/** Returns the current session synchronously (may be null on first load). */
export const getSession = () => supabase.auth.getSession();

/** Returns the current user or null. */
export const getUser = async () => {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user ?? null;
};
