/**
 * src/lib/db/users.ts
 *
 * Database helpers for the `users` table.
 *
 * All functions follow the { data, error } pattern — errors are returned, not thrown.
 * Amounts are never involved here (users don't have amounts).
 * Dates are stored and returned as ISO 8601 strings.
 */

import { getSupabaseAdmin } from '@/lib/supabase';
import type { UserRow } from './database.types';

// ── Return type ───────────────────────────────────────────────────────────────

export type DbResult<T> = Promise<{ data: T; error: null } | { data: null; error: string }>;

// ── getOrCreateUser ───────────────────────────────────────────────────────────

/**
 * Looks up a user by email. If not found, creates a new record.
 *
 * Called at login time (after Circle auth) to ensure the user exists in our DB.
 * `walletId` and `walletAddress` are empty strings until the user completes
 * the Circle PIN setup flow — call `updateWalletInfo` afterwards.
 *
 * @param id    - The user's auth UUID (from Supabase Auth or your own system)
 * @param email - The user's email address
 */
export async function getOrCreateUser(
    id: string,
    email: string
): DbResult<UserRow> {
    const db = getSupabaseAdmin();

    // Try to find existing user first
    const { data: existing, error: fetchError } = await db
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = "no rows" — anything else is a real error
        return { data: null, error: fetchError.message };
    }

    if (existing) {
        return { data: existing as UserRow, error: null };
    }

    // User doesn't exist — create them
    const { data: created, error: insertError } = await db
        .from('users')
        .insert({
            id,
            email,
            wallet_id: '',
            wallet_address: '',
        })
        .select()
        .single();

    if (insertError) {
        return { data: null, error: insertError.message };
    }

    return { data: created as UserRow, error: null };
}

// ── getUser ───────────────────────────────────────────────────────────────────

/**
 * Fetches a single user by their UUID.
 */
export async function getUser(id: string): DbResult<UserRow> {
    const db = getSupabaseAdmin();

    const { data, error } = await db
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

    if (error) return { data: null, error: error.message };
    return { data: data as UserRow, error: null };
}

// ── getUserByEmail ────────────────────────────────────────────────────────────

/**
 * Fetches a user by email. Returns null data (not an error) if not found.
 */
export async function getUserByEmail(email: string): DbResult<UserRow | null> {
    const db = getSupabaseAdmin();

    const { data, error } = await db
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data: (data as UserRow | null), error: null };
}

// ── updateWalletInfo ──────────────────────────────────────────────────────────

/**
 * Saves the Circle walletId and EVM address for a user.
 *
 * Called after the user completes the Circle PIN setup challenge and we
 * retrieve their wallet via GET /api/circle/wallet-info.
 *
 * @param userId         - User UUID
 * @param walletId       - Circle wallet UUID
 * @param walletAddress  - EVM 0x address on Arc
 */
export async function updateWalletInfo(
    userId: string,
    walletId: string,
    walletAddress: string
): DbResult<UserRow> {
    const db = getSupabaseAdmin();

    if (!walletId || !walletAddress) {
        return { data: null, error: 'walletId and walletAddress must not be empty' };
    }

    const { data, error } = await db
        .from('users')
        .update({ wallet_id: walletId, wallet_address: walletAddress })
        .eq('id', userId)
        .select()
        .single();

    if (error) return { data: null, error: error.message };
    return { data: data as UserRow, error: null };
}

// ── updateDisplayName ─────────────────────────────────────────────────────────

/**
 * Updates the user's display name (shown in group member lists and expense cards).
 */
export async function updateDisplayName(
    userId: string,
    displayName: string
): DbResult<UserRow> {
    const db = getSupabaseAdmin();

    const trimmed = displayName.trim();
    if (!trimmed) {
        return { data: null, error: 'displayName cannot be empty' };
    }

    const { data, error } = await db
        .from('users')
        .update({ display_name: trimmed })
        .eq('id', userId)
        .select()
        .single();

    if (error) return { data: null, error: error.message };
    return { data: data as UserRow, error: null };
}
