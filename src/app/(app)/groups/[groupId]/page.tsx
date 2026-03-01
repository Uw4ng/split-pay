'use client';

/**
 * (app)/groups/[groupId]/page.tsx
 *
 * Group detail page — shows members, expense list, and the
 * computed settlements (who owes whom).
 */

import { useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useGroupStore, selectActiveGroup } from '@/store/groupStore';
import { useExpenseStore, selectGroupExpenses } from '@/store/expenseStore';
import { getGroupSettlements } from '@/lib/debt';
import { ExpenseList } from '@/components/expenses/ExpenseList';
import { SettlementSummary } from '@/components/settlement/SettlementSummary';

export default function GroupPage() {
    const params = useParams<{ groupId: string }>();
    const groupId = params.groupId;

    const { groups, setActiveGroup } = useGroupStore();
    const activeGroup = useGroupStore(selectActiveGroup);
    const { fetchExpenses } = useExpenseStore();
    const expenses = useExpenseStore(selectGroupExpenses(groupId));

    useEffect(() => {
        setActiveGroup(groupId);
        fetchExpenses(groupId);
    }, [groupId, setActiveGroup, fetchExpenses]);

    const settlements = useMemo(() => {
        if (!activeGroup) return [];
        try {
            // Map Expense[] → DebtExpense[] for the debt algorithm
            const debtExpenses = expenses.map((exp) => ({
                paidByUserId: typeof exp.paidBy === 'string' ? exp.paidBy : exp.paidBy.id,
                amount: exp.amount,
                splits: exp.splits.map((s) => ({
                    userId: s.userId,
                    amount: s.amount,
                    settled: s.settled,
                })),
            }));
            // Map debt.ts Settlement → old Settlement shape {from, to, amount}
            return getGroupSettlements(
                debtExpenses,
                activeGroup.members.map((m) => m.id)
            ).map((s) => ({
                fromUserId: s.fromUserId,
                toUserId: s.toUserId,
                amount: s.amount,
            }));
        } catch {
            return [];
        }
    }, [expenses, activeGroup]);

    if (!activeGroup) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="text-center">
                    <div className="mb-2 text-4xl">🔍</div>
                    <p className="text-muted-foreground">Group not found.</p>
                    <Link href="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-card px-6 py-4">
                <div className="mx-auto flex max-w-4xl items-center gap-4">
                    <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
                        ← Back
                    </Link>
                    <div>
                        <h1 className="font-bold text-foreground">{activeGroup.name}</h1>
                        <p className="text-xs text-muted-foreground">
                            {activeGroup.members.length} member{activeGroup.members.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
                {/* Settlement Summary */}
                {settlements.length > 0 && (
                    <section>
                        <h2 className="mb-3 text-lg font-semibold text-foreground">Who owes whom</h2>
                        <SettlementSummary settlements={settlements} groupId={groupId} />
                    </section>
                )}

                {/* Expense List */}
                <section>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground">Expenses</h2>
                        <Link
                            href={`/groups/${groupId}/expenses/new`}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            + Add Expense
                        </Link>
                    </div>
                    <ExpenseList groupId={groupId} />
                </section>
            </main>
        </div>
    );
}
