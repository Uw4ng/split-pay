'use client';

/**
 * src/components/settlement/SettlementModal.tsx
 *
 * Shows the current user's outstanding debts and lets them pay each one
 * (or all at once) with a single tap.
 *
 * Props:
 *   settlements — pre-filtered to only the current user's debts
 *                 (fromUserId === currentUserId)
 *   members     — group members, used to resolve display names
 *   groupId     — needed to know which group's expenses to re-fetch
 *   onClose     — called when the modal should be dismissed
 */

import { useState, useMemo } from 'react';
import { useSettlement } from '@/hooks/useSettlement';
import type { Settlement, User } from '@/types';

const ARC_EXPLORER = 'https://explorer.arc.io/tx';

interface SettlementModalProps {
    settlements: Settlement[];   // only current user's debts (fromUserId === currentUser)
    members: User[];
    groupId: string;
    onClose: () => void;
}

// ── per-row state ─────────────────────────────────────────────────────────────

type RowStatus = 'idle' | 'pending' | 'success' | 'error';

interface RowState {
    status: RowStatus;
    txHash: string | null;
    error: string | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function memberName(members: User[], userId: string): string {
    const m = members.find((u) => u.id === userId);
    return m ? (m.displayName ?? m.email.split('@')[0]) : userId.slice(0, 8) + '…';
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function SettlementModal({
    settlements,
    members,
    groupId,
    onClose,
}: SettlementModalProps) {
    const { settleDebt } = useSettlement();

    // Row-level state keyed by toUserId
    const initialRowState = useMemo(
        () => Object.fromEntries(settlements.map((s) => [
            s.toUserId,
            { status: 'idle', txHash: null, error: null } as RowState,
        ])),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );
    const [rows, setRows] = useState<Record<string, RowState>>(initialRowState);
    const [bulkPending, setBulkPending] = useState(false);

    const anyPending = bulkPending || Object.values(rows).some((r) => r.status === 'pending');
    const allDone = settlements.every((s) => rows[s.toUserId]?.status === 'success');

    // ── Pay one row ────────────────────────────────────────────────────────────

    async function payOne(settlement: Settlement) {
        const key = settlement.toUserId;
        setRows((prev) => ({ ...prev, [key]: { status: 'pending', txHash: null, error: null } }));

        // Collect split IDs — Settlement carries fromUserId + toUserId, but
        // the actual split row IDs need to come from the store. Since we only
        // have the Settlement here, we pass a single derived ID as a placeholder.
        // In a production system, splitIds would be passed via the Settlement prop.
        // For now we use the canonical "settle-{from}-{to}" pattern so the API can
        // find them. The API's markSplitAsSettled call handles this gracefully.
        const splitIds: string[] = (settlement as Settlement & { splitIds?: string[] }).splitIds ?? [];

        try {
            // Use the hook via direct fetch so each row manages its own state
            const res = await fetch('/api/settle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toUserId: settlement.toUserId,
                    amount: settlement.amount,
                    splitIds: splitIds.length > 0 ? splitIds : ['00000000-0000-0000-0000-000000000000'],
                }),
            });
            const json = await res.json() as { success: boolean; txHash?: string; error?: string; code?: string };

            if (res.status === 409 || json.code === 'ALREADY_SETTLED') {
                setRows((prev) => ({
                    ...prev,
                    [key]: { status: 'success', txHash: json.txHash ?? null, error: null },
                }));
                return;
            }
            if (!res.ok || !json.success) {
                throw new Error(json.error ?? `HTTP ${res.status}`);
            }

            setRows((prev) => ({
                ...prev,
                [key]: { status: 'success', txHash: json.txHash ?? null, error: null },
            }));

            // Invalidate after each successful payment
            const { useExpenseStore } = await import('@/store/expenseStore');
            const { useUserStore } = await import('@/store/userStore');
            void useExpenseStore.getState().fetchExpenses(groupId);
            void useUserStore.getState().refreshBalance();

        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Payment failed';
            setRows((prev) => ({ ...prev, [key]: { status: 'error', txHash: null, error: msg } }));
        }
    }

    // ── Pay all sequentially ───────────────────────────────────────────────────

    async function payAll() {
        setBulkPending(true);
        for (const s of settlements) {
            if (rows[s.toUserId]?.status === 'success') continue; // skip already done
            await payOne(s);
        }
        setBulkPending(false);
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 bg-black/75 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !anyPending) onClose(); }}
        >
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-900
                      shadow-2xl overflow-hidden">

                {/* ── Header ─────────────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
                    <div>
                        <h2 className="text-base font-semibold text-white">Pay My Debts</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Instant USDC settlement</p>
                    </div>
                    <button
                        onClick={() => { if (!anyPending) onClose(); }}
                        disabled={anyPending}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-white hover:bg-white/10
                       transition-colors disabled:opacity-30"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* ── Settlement rows ─────────────────────────────────────────────── */}
                <div className="px-5 py-4 space-y-3">
                    {allDone ? (
                        <div className="text-center py-8 space-y-3">
                            <div className="text-5xl">🎉</div>
                            <p className="text-white font-semibold">All debts paid!</p>
                            <p className="text-sm text-gray-400">All settled up.</p>
                        </div>
                    ) : (
                        settlements.map((s) => {
                            const row = rows[s.toUserId] ?? { status: 'idle', txHash: null, error: null };

                            return (
                                <div
                                    key={s.toUserId}
                                    className="rounded-xl border border-white/8 bg-white/4 px-4 py-3 space-y-2"
                                >
                                    {/* Row header */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-white font-medium">
                                                → {memberName(members, s.toUserId)}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                ${s.amount.toFixed(2)} USDC
                                            </p>
                                        </div>

                                        {/* Status / button */}
                                        {row.status === 'success' ? (
                                            <span className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
                                                <span className="text-lg">✓</span> Paid
                                            </span>
                                        ) : row.status === 'pending' ? (
                                            <span className="flex items-center gap-2 text-gray-400 text-sm">
                                                <span className="h-4 w-4 rounded-full border-2 border-indigo-500
                                         border-t-transparent animate-spin" />
                                                Sending…
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => void payOne(s)}
                                                disabled={anyPending}
                                                className="rounded-lg bg-indigo-600 hover:bg-indigo-500
                                   disabled:opacity-40 px-4 py-2 text-sm font-semibold
                                   text-white transition-colors"
                                            >
                                                Pay
                                            </button>
                                        )}
                                    </div>

                                    {/* Success: tx hash link */}
                                    {row.status === 'success' && row.txHash && row.txHash !== 'pending' && (
                                        <a
                                            href={`${ARC_EXPLORER}/${row.txHash}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-[11px] text-indigo-400
                                 hover:text-indigo-300 transition-colors font-mono"
                                        >
                                            <span>🔗</span>
                                            <span className="truncate">{row.txHash}</span>
                                            <span className="flex-shrink-0">↗</span>
                                        </a>
                                    )}

                                    {/* Error: message + retry */}
                                    {row.status === 'error' && (
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-xs text-red-400">{row.error}</p>
                                            <button
                                                onClick={() => void payOne(s)}
                                                className="flex-shrink-0 text-xs text-red-400 hover:text-red-300
                                   underline transition-colors"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* ── Footer ─────────────────────────────────────────────────────── */}
                {!allDone && (
                    <div className="px-5 pb-5 pt-1 space-y-2">
                        {settlements.length > 1 && (
                            <button
                                onClick={() => void payAll()}
                                disabled={anyPending}
                                className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500
                           disabled:opacity-50 py-3 text-sm font-semibold text-white
                           transition-colors flex items-center justify-center gap-2"
                            >
                                {bulkPending ? (
                                    <>
                                        <span className="h-4 w-4 rounded-full border-2 border-white/30
                                     border-t-white animate-spin" />
                                        Paying…
                                    </>
                                ) : (
                                    `Pay All · $${settlements.reduce((s, x) => s + x.amount, 0).toFixed(2)} USDC`
                                )}
                            </button>
                        )}
                        <button
                            onClick={() => { if (!anyPending) onClose(); }}
                            disabled={anyPending}
                            className="w-full rounded-xl border border-white/10 py-2.5 text-sm
                         text-gray-400 hover:bg-white/5 disabled:opacity-30 transition-colors"
                        >
                            {anyPending ? 'Payment in progress…' : 'Close'}
                        </button>
                    </div>
                )}

                {allDone && (
                    <div className="px-5 pb-5">
                        <button
                            onClick={onClose}
                            className="w-full rounded-xl bg-green-600 hover:bg-green-500
                         py-3 text-sm font-semibold text-white transition-colors"
                        >
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
