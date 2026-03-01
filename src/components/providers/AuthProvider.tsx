'use client';

/**
 * src/components/providers/AuthProvider.tsx
 *
 * Wraps the app, listens to Supabase auth state changes, and syncs the
 * current user into the Zustand userStore.
 *
 * Also exports:
 *   useUser()  — returns { user, isHydrated }
 *   useAuth()  — returns { signOut }
 */

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useUserStore, type AppUser } from '@/store/userStore';
import type { UserRow } from '@/lib/db/database.types';

// ── Context types ─────────────────────────────────────────────────────────────

interface AuthContextValue {
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Helper: map Supabase+DB user to AppUser ───────────────────────────────────

async function fetchDbUser(userId: string): Promise<UserRow | null> {
    try {
        const res = await fetch(`/api/circle/wallet-info?userId=${encodeURIComponent(userId)}`);
        if (!res.ok) return null;
        const json = await res.json() as { success: boolean; data?: UserRow };
        return json.success ? (json.data ?? null) : null;
    } catch {
        return null;
    }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
    const setUser = useUserStore((s) => s.setUser);
    const clearUser = useUserStore((s) => s.clearUser);
    const setHydrated = useUserStore((s) => s.setHydrated);
    const resolvedRef = useRef(false);

    useEffect(() => {
        // ── 1. Resolve the initial session (runs once) ─────────────────────────
        async function resolveInitialSession() {
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user) {
                await hydrateUser(session.user.id, session.user.email ?? '');
            }

            if (!resolvedRef.current) {
                resolvedRef.current = true;
                setHydrated();
            }
        }

        void resolveInitialSession();

        // ── 2. Subscribe to auth state changes ────────────────────────────────
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_IN' && session?.user) {
                    await hydrateUser(session.user.id, session.user.email ?? '');
                } else if (event === 'SIGNED_OUT') {
                    clearUser();
                }

                // Mark hydrated after first event if not already done
                if (!resolvedRef.current) {
                    resolvedRef.current = true;
                    setHydrated();
                }
            }
        );

        return () => { subscription.unsubscribe(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function hydrateUser(userId: string, email: string) {
        // Try to get wallet info from our DB (populated after PIN setup)
        const dbUser = await fetchDbUser(userId);

        const appUser: AppUser = {
            id: userId,
            email,
            displayName: dbUser?.display_name ?? null,
            walletId: dbUser?.wallet_id ?? '',
            walletAddress: dbUser?.wallet_address ?? '',
        };

        setUser(appUser);
    }

    async function signOut() {
        await supabase.auth.signOut();
        clearUser();
        window.location.href = '/login';
    }

    return (
        <AuthContext.Provider value={{ signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Returns the current authenticated user and whether the auth state has
 * been resolved (use `isHydrated` to avoid flicker on SSR).
 */
export function useUser() {
    const user = useUserStore((s) => s.user);
    const isHydrated = useUserStore((s) => s.isHydrated);
    return { user, isHydrated };
}

/**
 * Returns auth actions (currently just `signOut`).
 * Must be used inside <AuthProvider>.
 */
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
