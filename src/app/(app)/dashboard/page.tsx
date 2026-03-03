'use client';

/**
 * src/app/(app)/dashboard/page.tsx
 *
 * Main dashboard — group list + USDC balance.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useGroupStore, selectActiveGroup } from '@/store/groupStore';
import { useExpenseStore, selectUserBalance } from '@/store/expenseStore';
import { useUser } from '@/components/providers/AuthProvider';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { CreateGroupModal } from '@/components/groups/CreateGroupModal';
import type { Group } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSDC(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Group Card ────────────────────────────────────────────────────────────────

function GroupCard({ group, userId }: { group: Group; userId: string }) {
    const balance = useExpenseStore(selectUserBalance(group.id, userId));
    const isOwed = balance > 0;
    const isOwing = balance < 0;

    return (
        <Link
            href={`/groups/${group.id}`}
            className="block rounded-2xl border border-white/10 bg-white/5 p-5
                 hover:bg-white/10 hover:border-indigo-500/40
                 transition-all duration-200 active:scale-[0.98]"
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-600/20 flex items-center justify-center
                          text-indigo-400 font-bold text-lg flex-shrink-0">
                        {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-semibold text-white text-sm leading-tight">{group.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                        </p>
                    </div>
                </div>

                {/* Balance pill */}
                {balance !== 0 && (
                    <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${isOwed
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-red-500/15 text-red-400'
                        }`}>
                        {isOwed ? '+' : '−'}${fmtUSDC(Math.abs(balance))}
                    </span>
                )}
            </div>

            {/* Balance label */}
            <p className={`text-xs ${isOwed ? 'text-green-500' :
                isOwing ? 'text-red-400' : 'text-gray-600'
                }`}>
                {isOwed ? `$${fmtUSDC(balance)} owed to you` :
                    isOwing ? `$${fmtUSDC(Math.abs(balance))} you owe` :
                        'All settled ✓'}
            </p>
        </Link>
    );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const { user, isHydrated } = useUser();
    const { groups, isLoading, error, fetchGroups } = useGroupStore();
    const { balance, isLoading: balLoading } = useWalletBalance();
    const [showCreate, setShowCreate] = useState(false);

    useEffect(() => {
        if (isHydrated && user) {
            void fetchGroups();
        }
    }, [isHydrated, user, fetchGroups]);

    if (!isHydrated) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            {/* ── Top bar ─────────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur border-b border-white/5 px-4 py-3">
                <div className="mx-auto max-w-lg flex items-center justify-between">
                    <h1 className="text-lg font-bold">
                        Split<span className="text-indigo-400">Pay</span>
                    </h1>

                    {/* USDC Balance */}
                    <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5">
                        <span className="text-xs text-gray-400">USDC</span>
                        {balLoading ? (
                            <span className="h-3 w-12 rounded bg-white/10 animate-pulse" />
                        ) : (
                            <span className="text-sm font-bold text-white">${fmtUSDC(balance)}</span>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Main content ────────────────────────────────────────────────────── */}
            <main className="mx-auto max-w-lg px-4 py-6 space-y-6">

                {/* Welcome + CTA */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500 mb-0.5">Welcome 👋</p>
                        <p className="text-sm font-medium text-gray-300">
                            {user?.displayName ?? user?.email?.split('@')[0] ?? 'there'}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500
                       active:bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white
                       transition-colors"
                    >
                        <span className="text-base leading-none">+</span>
                        New Group
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                        {error}
                    </div>
                )}

                {/* Group list */}
                <section>
                    <h2 className="text-xs font-semibold tracking-widest text-gray-500 uppercase mb-3">
                        My Groups
                    </h2>

                    {isLoading && groups.length === 0 ? (
                        /* Skeleton */
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
                            ))}
                        </div>
                    ) : groups.length === 0 ? (
                        /* Empty state */
                        <div className="text-center py-16 space-y-3">
                            <div className="text-5xl">🧾</div>
                            <p className="text-gray-400 text-sm">No groups yet.</p>
                            <button
                                onClick={() => setShowCreate(true)}
                                className="mt-2 text-indigo-400 text-sm hover:underline"
                            >
                                Create your first group →
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {groups.map((group) => (
                                <GroupCard key={group.id} group={group} userId={user?.id ?? ''} />
                            ))}
                        </div>
                    )}
                </section>
            </main>

            {/* Create group modal */}
            {showCreate && (
                <CreateGroupModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); void fetchGroups(); }}
                />
            )}
        </div>
    );
}
