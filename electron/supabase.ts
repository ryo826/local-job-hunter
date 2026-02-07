import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase公開接続情報（anon keyは公開用のため埋め込みOK）
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fagrilpjbyufwwqjdugx.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_mJv-1KTKQJTo8_lZTrVpIQ_qZZCq049';

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
    if (!_supabase) {
        _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return _supabase;
}

// Backward-compatible getter
export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        return (getSupabase() as any)[prop];
    },
});
