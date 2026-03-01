'use client';

/**
 * src/hooks/useSettlement.ts
 *
 * Hook that drives a single settlement transfer from the current user to
 * a creditor, then marks the supplied DB split rows as settled.
 *
 * No SWR in project — cache invalidation is done by re-triggering Zustand
 * store fetches (fetchExpenses + refreshBalance).
 */

import { useState, useCallback } from 'react';
import { useExpenseStore } from '@/store/expenseStore';
import { useUserStore } from '@/store/userStore';

// ── Types ──────────────────────────────────────────────────────────────────────

export type SettlementStatus = 'idle' | 'pending' | 'success' | 'error';

interface SettleDebtParams {
    /** Recipient's internal user ID */
    toUserId: string;
    /** USDC amount (must match sum of splitIds) */
    amount: number;
    /** expense_splits.id rows being settled */
    splitIds: string[];
    /** groupId — used to re-fetch expenses after success */
    groupId: string;
}

interface UseSettlementResult {
    status: SettlementStatus;
    txHash: string | null;
    error: string | null;
    isPending: boolean;
    isSuccess: boolean;
    isError: boolean;
    settleDebt: (params: SettleDebtParams) => Promise<void>;
    reset: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useSettlement(): UseSettlementResult {
    const [status, setStatus] = useState<SettlementStatus>('idle');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchExpenses = useExpenseStore((s) => s.fetchExpenses);
    const refreshBalance = useUserStore((s) => s.refreshBalance);

    const settleDebt = useCallback(async ({
        toUserId,
        amount,
        splitIds,
        groupId,
    }: SettleDebtParams) => {
        setStatus('pending');
        setError(null);
        setTxHash(null);

        try {
            const res = await fetch('/api/settle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toUserId, amount, splitIds }),
            });

            const json = await res.json() as {
                success: boolean;
                txHash?: string;
                error?: string;
                code?: string;
            };

            // ── Already settled (idempotency hit or "already settled" from DB) ──────
            if (res.status === 409 || json.code === 'ALREADY_SETTLED') {
                setStatus('success');
                setTxHash(json.txHash ?? null);
                void fetchExpenses(groupId);
                return;
            }

            if (!res.ok || !json.success) {
                throw new Error(json.error ?? `HTTP ${res.status}`);
            }

            setTxHash(json.txHash ?? null);
            setStatus('success');

            // Invalidate Zustand caches
            await Promise.all([
                fetchExpenses(groupId),
                refreshBalance(),
            ]);

        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu';
            setError(msg);
            setStatus('error');
        }
    }, [fetchExpenses, refreshBalance]);

    const reset = useCallback(() => {
        setStatus('idle');
        setTxHash(null);
        setError(null);
    }, []);

    return {
        status,
        txHash,
        error,
        isPending: status === 'pending',
        isSuccess: status === 'success',
        isError: status === 'error',
        settleDebt,
        reset,
    };
}
