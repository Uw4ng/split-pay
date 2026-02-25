/**
 * lib/supabase.ts
 *
 * Exports two Supabase clients:
 *  - `supabase`        → browser client (uses anon key, RLS-gated)
 *  - `supabaseAdmin`   → server-only client (uses service role key, bypasses RLS)
 *
 * IMPORTANT: Never import `supabaseAdmin` in client components.
 */

import { createClient } from '@supabase/supabase-js';

// ── Type helper (extend when DB schema is known) ────────────────────────────
// If you generate types with `supabase gen types typescript`, replace `any` below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

// ── Shared config ────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.'
    );
}

// ── Browser / public client ──────────────────────────────────────────────────
/**
 * Use this in React components and client-side hooks.
 * All queries are subject to Row Level Security (RLS) policies.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        // We use Circle for auth; Supabase auth is optional / not primary here.
        persistSession: false,
        autoRefreshToken: false,
    },
});

// ── Server / admin client ────────────────────────────────────────────────────
/**
 * Use this in Next.js API routes and server actions ONLY.
 * Bypasses RLS — handle authorization manually before calling.
 */
export function getSupabaseAdmin() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        throw new Error(
            'SUPABASE_SERVICE_ROLE_KEY is not set. This client can only be used server-side.'
        );
    }
    return createClient<Database>(supabaseUrl!, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}

// ── Table name constants (single source of truth) ────────────────────────────
export const TABLES = {
    users: 'users',
    groups: 'groups',
    groupMembers: 'group_members',
    expenses: 'expenses',
    splits: 'splits',
    settlements: 'settlements',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
