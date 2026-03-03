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

/**
 * Returns the env var or a safe placeholder when building without env vars.
 * Placeholder values produce a non-functional client (network errors, not crashes).
 * At runtime with real env vars (e.g. Vercel production), this always returns the real value.
 */
function getEnv(key: string, placeholder: string): string {
    return process.env[key] ?? placeholder;
}

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`[supabase] Missing environment variable: ${key}`);
    return value;
}

// ── Browser / public client ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: ReturnType<typeof createClient<any>> | null = null;

/**
 * Lazy singleton — safe to call from client components.
 * Uses placeholder URL/key at build time so module evaluation never throws.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabaseClient(): ReturnType<typeof createClient<any>> {
    if (!_supabase) {
        _supabase = createClient<any>(
            getEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321'),
            getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-anon-key'),
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                },
            }
        );
    }
    return _supabase;
}

/**
 * Pre-initialised singleton for convenience imports (`import { supabase } from ...`).
 * Safe to use in client components — always returns the same real Supabase client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: ReturnType<typeof createClient<any>> = createClient<any>(
    getEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321'),
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-anon-key'),
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    }
);

// ── Server / admin client ─────────────────────────────────────────────────────
/**
 * Bypasses RLS. SERVER-SIDE ONLY.
 * Always call getSupabaseAdmin() inside a handler — never at module level.
 */
export function getSupabaseAdmin() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClient<any>(
        requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    );
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
