'use client';

/**
 * src/components/expenses/ExpenseCard.tsx
 *
 * Collapsible expense row — shows summary by default,
 * expands to show per-member splits on tap/click.
 */

import { useState } from 'react';
import type { Expense, User } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
    food: '🍽️',
    transport: '🚗',
    accommodation: '🏠',
    entertainment: '🎬',
    utilities: '⚡',
    other: '📦',
};

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
        day: 'numeric', month: 'short',
    });
}

function displayName(user: User) {
    return user.displayName ?? user.email.split('@')[0];
}

// ── ExpenseCard ───────────────────────────────────────────────────────────────

interface ExpenseCardProps {
    expense: Expense;
    currentUserId: string;
}

export function ExpenseCard({ expense, currentUserId }: ExpenseCardProps) {
    const [expanded, setExpanded] = useState(false);

    const paidByMe = expense.paidBy.id === currentUserId;
    const myOwnSplit = expense.splits.find((s) => s.userId === currentUserId);
    const myOwed = myOwnSplit ? (!myOwnSplit.settled && !paidByMe ? myOwnSplit.amount : 0) : 0;
    const settledAll = expense.splits.every((s) => s.settled);
    const emoji = CATEGORY_EMOJI[expense.category ?? 'other'] ?? '📦';

    return (
        <div className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden
                    transition-colors hover:border-white/12">
            {/* ── Summary row (always visible) ───────────────────────────────────── */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                aria-expanded={expanded}
            >
                {/* Emoji */}
                <span className="text-2xl flex-shrink-0">{emoji}</span>

                {/* Description + meta */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{expense.description}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {displayName(expense.paidBy)} paid &middot; {formatDate(expense.createdAt)}
                    </p>
                </div>

                {/* Right: amount + status */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <span className="text-sm font-bold text-white">
                        ${expense.amount.toFixed(2)}
                    </span>
                    {settledAll ? (
                        <span className="text-[10px] font-medium text-green-500 bg-green-500/10
                             rounded-full px-2 py-0.5">✓ Settled</span>
                    ) : myOwed > 0 ? (
                        <span className="text-[10px] font-medium text-red-400 bg-red-500/10
                             rounded-full px-2 py-0.5">−${myOwed.toFixed(2)}</span>
                    ) : paidByMe ? (
                        <span className="text-[10px] font-medium text-indigo-400 bg-indigo-500/10
                             rounded-full px-2 py-0.5">You paid</span>
                    ) : null}
                </div>

                {/* Chevron */}
                <span className={`text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
                    ▾
                </span>
            </button>

            {/* ── Expanded splits ─────────────────────────────────────────────────── */}
            {expanded && (
                <div className="border-t border-white/5 px-4 py-3 space-y-2">
                    <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase mb-2">
                        Split
                    </p>
                    {expense.splits.map((split) => {
                        const isMe = split.userId === currentUserId;
                        return (
                            <div
                                key={split.userId}
                                className="flex items-center justify-between text-xs"
                            >
                                <div className="flex items-center gap-2">
                                    {/* Settled indicator */}
                                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${split.settled ? 'bg-green-500' : 'bg-gray-600'
                                        }`} />
                                    <span className={isMe ? 'text-indigo-300 font-medium' : 'text-gray-400'}>
                                        {isMe ? 'You' : split.userId.slice(0, 8) + '…'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={split.settled ? 'text-gray-600 line-through' : 'text-white'}>
                                        ${split.amount.toFixed(2)}
                                    </span>
                                    {split.settled && split.txHash && (
                                        <span
                                            className="text-[10px] text-green-600 font-mono"
                                            title={split.txHash}
                                        >
                                            ✓ {split.txHash.slice(0, 6)}…
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
