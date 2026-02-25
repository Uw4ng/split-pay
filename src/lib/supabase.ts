/**
 * src/lib/supabase.ts
 *
 * Supabase client exports.
 *
 * Two clients:
 *  - `supabase`         → browser/client-side (anon key, RLS enforced)
 *  - `getSupabaseAdmin` → server-only (service role, bypasses RLS)
 *
 * IMPORTANT: Never import `getSupabaseAdmin` in a client component or page.
 * Only use it in  Next.js API routes and Server Actions.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './db/database.types';

// ── Environment ───────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        '[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
}

// ── Browser / public client ───────────────────────────────────────────────────
/**
 * Safe to import in client components.
 * All queries are subject to Row Level Security policies.
 *
 * Typed with `any` generics until you run `supabase gen types typescript --local`.
 * Row types are still enforced via explicit casts in db/ helpers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

// ── Server / admin client ─────────────────────────────────────────────────────
/**
 * Bypasses RLS. SERVER-SIDE ONLY.
 * Always call getSupabaseAdmin() inside the handler — never cache as a module-level export
 * to avoid the service role key being bundled into the client JS.
 */
export function getSupabaseAdmin() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        throw new Error('[supabase] Missing SUPABASE_SERVICE_ROLE_KEY — server-only function called on client?');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClient<any>(supabaseUrl!, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}

// ── Table name constants ───────────────────────────────────────────────────────
export const TABLES = {
    users: 'users',
    groups: 'groups',
    groupMembers: 'group_members',
    expenses: 'expenses',
    expenseSplits: 'expense_splits',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
