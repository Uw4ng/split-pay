'use client';

/**
 * src/hooks/useWalletBalance.ts
 *
 * Polls /api/circle/balance every 30 seconds for the current user's USDC balance.
 *
 * Why custom polling instead of SWR/React Query?
 *   Neither is installed in this project. A simple useEffect + setInterval
 *   keeps the bundle small and avoids adding a 20kb+ dependency for one use case.
 *
 * Returns:
 *   balance        — USDC balance as a number (e.g. 42.50)
 *   isLoading      — true on the first fetch only
 *   error          — error message string or null
 *   refetch()      — manually trigger a balance refresh
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserStore } from '@/store/userStore';
import { supabase } from '@/lib/supabase';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

interface UseWalletBalanceResult {
    balance: number;
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useWalletBalance(): UseWalletBalanceResult {
    const user = useUserStore((s) => s.user);
    const storeBalance = useUserStore((s) => s.walletBalance);
    const setBalance = useUserStore((s) => s.setWalletBalance);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Avoid stale closure in the interval
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);

    const fetchBalance = useCallback(async () => {
        const currentUser = userRef.current;
        if (!currentUser?.walletId) return; // no wallet yet — stay at 0

        setIsLoading(true);
        setError(null);

        try {
            // Get a fresh user token from Supabase session to pass to Circle API
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setError('Not authenticated');
                return;
            }

            const params = new URLSearchParams({
                walletId: currentUser.walletId,
                // userToken is resolved server-side via the session cookie;
                // we send the Supabase access_token as a proxy identifier.
                // The actual Circle userToken is obtained server-side if needed.
                userToken: session.access_token,
            });

            const res = await fetch(`/api/circle/balance?${params.toString()}`);

            if (!res.ok) {
                const body = await res.json() as { error?: string };
                setError(body.error ?? `HTTP ${res.status}`);
                return;
            }

            const json = await res.json() as {
                success: boolean;
                data?: { balance: number; currency: string };
                error?: string;
            };

            if (!json.success || json.data === undefined) {
                setError(json.error ?? 'Balance fetch failed');
                return;
            }

            setBalance(json.data.balance);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setIsLoading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Initial fetch + polling ───────────────────────────────────────────────
    useEffect(() => {
        if (!user?.walletId) return; // don't start polling until wallet exists

        // Fire immediately
        void fetchBalance();

        // Then poll every 30s
        const intervalId = setInterval(fetchBalance, POLL_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [user?.walletId, fetchBalance]);

    return {
        balance: storeBalance,
        isLoading,
        error,
        refetch: fetchBalance,
    };
}
