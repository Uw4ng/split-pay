'use client';

/**
 * src/app/(app)/groups/[groupId]/page.tsx
 *
 * Group detail page.
 *
 * Layout (mobile-first):
 *   - Header: group name + back button + member count
 *   - Settlement bar: who owes whom (sticky, collapsible on mobile)
 *   - Expense list: newest first
 *   - Floating action bar: "Harcama Ekle" + "Hesapları Kapat"
 *
 * Desktop (lg):
 *   - Left 2/3: expenses
 *   - Right 1/3: sticky settlement sidebar
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useGroupStore, selectActiveGroup } from '@/store/groupStore';
import { useExpenseStore, selectGroupExpenses } from '@/store/expenseStore';
import { useUser } from '@/components/providers/AuthProvider';
import { getGroupSettlements } from '@/lib/debt';
import { ExpenseCard } from '@/components/expenses/ExpenseCard';
import { AddExpenseForm } from '@/components/expenses/AddExpenseForm';
import { SettlementSummary } from '@/components/settlement/SettlementSummary';
import type { Expense, User } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDebtExpense(exp: Expense) {
    const paidById = typeof exp.paidBy === 'string'
        ? exp.paidBy
        : (exp.paidBy as User).id;
    return {
        paidByUserId: paidById,
        amount: exp.amount,
        splits: exp.splits.map((s) => ({
            userId: s.userId,
            amount: s.amount,
            settled: s.settled,
        })),
    };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GroupPage() {
    const params = useParams<{ groupId: string }>();
    const groupId = params.groupId;
    const router = useRouter();
    const { user } = useUser();

    const { groups, setActiveGroup, isLoading: groupsLoading } = useGroupStore();
    const activeGroup = useGroupStore(selectActiveGroup);
    const { fetchExpenses, isLoading: expLoading } = useExpenseStore();
    const expenses = useExpenseStore(selectGroupExpenses(groupId));

    const [showAddForm, setShowAddForm] = useState(false);
    const [showSettlements, setShowSettlements] = useState(true);   // mobile toggle

    // Set active group + fetch expenses on mount / groupId change
    useEffect(() => {
        setActiveGroup(groupId);
        void fetchExpenses(groupId);
    }, [groupId, setActiveGroup, fetchExpenses]);

    // Compute minimum settlements
    const settlements = useMemo(() => {
        if (!activeGroup) return [];
        const memberIds = activeGroup.members.map((m) => m.id);
        return getGroupSettlements(expenses.map(toDebtExpense), memberIds)
            .map((s) => ({ fromUserId: s.fromUserId, toUserId: s.toUserId, amount: s.amount }));
    }, [expenses, activeGroup]);

    // ── Loading / not found ───────────────────────────────────────────────────

    if (groupsLoading && !activeGroup) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-indigo-600
                        border-t-transparent animate-spin" />
            </div>
        );
    }

    if (!activeGroup) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
                <div className="text-center space-y-3">
                    <div className="text-5xl">🔍</div>
                    <p className="text-gray-400 text-sm">Grup bulunamadı.</p>
                    <Link href="/dashboard" className="text-indigo-400 text-sm hover:underline">
                        Dashboard'a dön
                    </Link>
                </div>
            </div>
        );
    }

    const currentUserId = user?.id ?? '';

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gray-950 text-white pb-32">

            {/* ── Header ──────────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur
                         border-b border-white/5 px-4 py-3">
                <div className="mx-auto max-w-5xl flex items-center gap-3">
                    <button
                        onClick={() => router.back()}
                        className="rounded-xl p-2 text-gray-400 hover:text-white
                       hover:bg-white/8 transition-colors"
                        aria-label="Geri"
                    >
                        ←
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-bold text-white truncate">{activeGroup.name}</h1>
                        <p className="text-xs text-gray-500">
                            {activeGroup.members.length} üye
                        </p>
                    </div>
                    {/* Member avatars (up to 4) */}
                    <div className="flex -space-x-2">
                        {activeGroup.members.slice(0, 4).map((m) => (
                            <div
                                key={m.id}
                                className="h-7 w-7 rounded-full bg-indigo-700 border-2 border-gray-950
                           flex items-center justify-center text-xs font-bold text-white"
                                title={m.displayName ?? m.email}
                            >
                                {(m.displayName ?? m.email).charAt(0).toUpperCase()}
                            </div>
                        ))}
                        {activeGroup.members.length > 4 && (
                            <div className="h-7 w-7 rounded-full bg-gray-700 border-2 border-gray-950
                              flex items-center justify-center text-xs text-gray-300">
                                +{activeGroup.members.length - 4}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Main: 2-col on desktop ───────────────────────────────────────────── */}
            <main className="mx-auto max-w-5xl px-4 py-5 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">

                {/* ── LEFT: Expense list ─────────────────────────────────────────── */}
                <section className="lg:col-span-2 space-y-4">

                    {/* Add expense form (inline) */}
                    {showAddForm ? (
                        <AddExpenseForm
                            group={activeGroup}
                            currentUserId={currentUserId}
                            onSuccess={() => {
                                setShowAddForm(false);
                                void fetchExpenses(groupId);
                            }}
                            onCancel={() => setShowAddForm(false)}
                        />
                    ) : (
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="w-full rounded-2xl border border-dashed border-white/15
                         py-4 text-sm text-gray-500 hover:text-gray-300
                         hover:border-white/25 transition-colors"
                        >
                            + Harcama Ekle
                        </button>
                    )}

                    {/* Expense list header */}
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
                            Harcamalar
                        </h2>
                        <span className="text-xs text-gray-600">{expenses.length} kayıt</span>
                    </div>

                    {/* Skeleton */}
                    {expLoading && expenses.length === 0 && (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />
                            ))}
                        </div>
                    )}

                    {/* Empty */}
                    {!expLoading && expenses.length === 0 && (
                        <div className="text-center py-12 space-y-2">
                            <div className="text-4xl">🧾</div>
                            <p className="text-gray-500 text-sm">Henüz harcama yok.</p>
                            <button
                                onClick={() => setShowAddForm(true)}
                                className="text-indigo-400 text-sm hover:underline"
                            >
                                İlk harcamayı ekle →
                            </button>
                        </div>
                    )}

                    {/* List */}
                    <div className="space-y-2">
                        {expenses.map((exp) => (
                            <ExpenseCard key={exp.id} expense={exp} currentUserId={currentUserId} />
                        ))}
                    </div>
                </section>

                {/* ── RIGHT: Settlement sidebar ──────────────────────────────────── */}
                <aside className="mt-4 lg:mt-0 lg:sticky lg:top-[68px]">
                    {/* Mobile toggle */}
                    <button
                        onClick={() => setShowSettlements((v) => !v)}
                        className="lg:hidden w-full flex items-center justify-between rounded-xl
                       border border-white/10 bg-white/4 px-4 py-3 mb-2 text-sm"
                    >
                        <span className="font-medium text-gray-300">
                            Kim kime borçlu? {settlements.length > 0 && (
                                <span className="ml-1.5 text-xs rounded-full bg-indigo-600
                                 px-2 py-0.5 text-white">{settlements.length}</span>
                            )}
                        </span>
                        <span className={`text-gray-500 transition-transform ${showSettlements ? 'rotate-180' : ''}`}>▾</span>
                    </button>

                    {(showSettlements) && (
                        <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                            <h2 className="text-xs font-semibold tracking-widest text-gray-500 uppercase mb-3">
                                Kim kime borçlu?
                            </h2>

                            {settlements.length === 0 ? (
                                <div className="text-center py-6 space-y-1">
                                    <div className="text-2xl">✅</div>
                                    <p className="text-xs text-gray-600">Tüm hesaplar kapalı</p>
                                </div>
                            ) : (
                                <SettlementSummary settlements={settlements} groupId={groupId} />
                            )}
                        </div>
                    )}
                </aside>
            </main>

            {/* ── Floating action bar (mobile) ─────────────────────────────────────── */}
            <div className="fixed bottom-0 inset-x-0 z-20 bg-gray-950/90 backdrop-blur
                      border-t border-white/5 px-4 py-3 lg:hidden">
                <div className="mx-auto max-w-lg flex gap-3">
                    <button
                        onClick={() => setShowAddForm((v) => !v)}
                        className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500
                       py-3 text-sm font-semibold text-white transition-colors"
                    >
                        + Harcama Ekle
                    </button>
                    {settlements.length > 0 && (
                        <button
                            onClick={() => { setShowSettlements(true); window.scrollTo({ top: 9999, behavior: 'smooth' }); }}
                            className="flex-1 rounded-xl bg-green-600/20 hover:bg-green-600/30 border
                         border-green-500/30 py-3 text-sm font-semibold text-green-400
                         transition-colors"
                        >
                            Hesapları Kapat
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
