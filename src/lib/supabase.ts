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
 * Retrieve and validate a required env var.
 * Validation is deferred to runtime (not module load time) so Next.js static
 * build analysis doesn't throw when the variable isn't present in ci/build env.
 */
function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        // During `next build` static analysis, env vars may not be present.
        // Return an empty string so module evaluation never throws.
        // The actual runtime call will fail meaningfully when the value is used.
        if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
            return '';
        }
        throw new Error(`[supabase] Missing environment variable: ${key}`);
    }
    return value;
}

// ── Browser / public client ───────────────────────────────────────────────────
/**
 * Safe to import in client components.
 * All queries are subject to Row Level Security policies.
 *
 * Typed with `any` generics until you run `supabase gen types typescript --local`.
 * Row types are still enforced via explicit casts in db/ helpers.
 *
 * NOTE: The client is created lazily on first access so that missing env vars
 * only throw at runtime (not during `next build` static analysis).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: ReturnType<typeof createClient<any>> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabaseClient(): ReturnType<typeof createClient<any>> {
    if (!_supabase) {
        _supabase = createClient<any>(
            requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
            requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
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
 * @deprecated Use `getSupabaseClient()` instead.
 * This named export is kept for backward-compat with existing imports.
 * It calls getSupabaseClient() on every property access — use the function
 * directly in new code.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabase(): ReturnType<typeof createClient<any>> {
    return getSupabaseClient();
}

// Re-export as `supabase` for backward compat (function call, not module-level instance)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = { get: getSupabaseClient } as unknown as ReturnType<typeof createClient<any>>;

// ── Server / admin client ─────────────────────────────────────────────────────
/**
 * Bypasses RLS. SERVER-SIDE ONLY.
 * Always call getSupabaseAdmin() inside the handler — never cache as a module-level export
 * to avoid the service role key being bundled into the client JS.
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
