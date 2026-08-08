// Supabase connection config
// The anon/publishable key is safe to expose in frontend code —
// it's designed for this and is restricted by Row Level Security policies.

const SUPABASE_URL = "https://vnsbzegpqyrqyuxpsijs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Oo7TN6KS46zxB8X8t49Y5w_PX6XVU5e";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
