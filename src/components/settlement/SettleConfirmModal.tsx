'use client';

/**
 * components/settlement/SettleConfirmModal.tsx
 *
 * Confirmation modal before initiating a USDC settlement transfer.
 * The actual Circle transfer is triggered via POST /api/circle/transfer.
 */

import { useState } from 'react';
import type { Settlement } from '@/types';

interface SettleConfirmModalProps {
    settlement: Settlement;
    groupId: string;
    onClose: () => void;
}

export function SettleConfirmModal({
    settlement,
    groupId,
    onClose,
}: SettleConfirmModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    async function handleSettle() {
        setIsLoading(true);
        setError(null);
        try {
            // TODO: get userToken from auth context/session
            const res = await fetch('/api/circle/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // userToken: from session
                    fromWalletId: settlement.from.walletId,
                    toAddress: settlement.to.walletAddress,
                    amount: settlement.amount.toFixed(2),
                }),
            });

            if (!res.ok) {
                const { error: apiError } = (await res.json()) as { error: string };
                throw new Error(apiError);
            }

            const { txHash: hash } = (await res.json()) as { txHash?: string };
            setTxHash(hash ?? 'pending');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Transfer failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        /* Backdrop */
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">

                {txHash ? (
                    /* Success state */
                    <div className="text-center">
                        <div className="mb-3 text-4xl">🎉</div>
                        <h2 className="mb-1 text-lg font-bold text-foreground">Transfer Initiated!</h2>
                        <p className="mb-4 text-sm text-muted-foreground">
                            Your USDC transfer is processing on Arc.
                        </p>
                        {txHash !== 'pending' && (
                            <p className="mb-4 break-all rounded-lg bg-muted px-3 py-2 text-xs font-mono text-muted-foreground">
                                {txHash}
                            </p>
                        )}
                        <button
                            onClick={onClose}
                            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    /* Confirm state */
                    <>
                        <h2 className="mb-4 text-lg font-bold text-foreground">Confirm Payment</h2>

                        <div className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm">
                            <div className="flex justify-between text-muted-foreground">
                                <span>From</span>
                                <span className="font-medium text-foreground">
                                    {settlement.from.displayName ?? settlement.from.email}
                                </span>
                            </div>
                            <div className="mt-1.5 flex justify-between text-muted-foreground">
                                <span>To</span>
                                <span className="font-medium text-foreground">
                                    {settlement.to.displayName ?? settlement.to.email}
                                </span>
                            </div>
                            <div className="mt-1.5 flex justify-between text-muted-foreground">
                                <span>Amount</span>
                                <span className="font-bold text-foreground">
                                    ${settlement.amount.toFixed(2)} USDC
                                </span>
                            </div>
                        </div>

                        {error && (
                            <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                disabled={isLoading}
                                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSettle}
                                disabled={isLoading}
                                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                                {isLoading ? 'Sending…' : 'Send USDC'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
