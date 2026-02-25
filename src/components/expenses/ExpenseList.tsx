'use client';

/**
 * components/expenses/ExpenseList.tsx
 *
 * Renders all expenses for a group, sorted newest-first.
 * Reads from the expenseStore.
 */

import { useExpenseStore, selectGroupExpenses } from '@/store/expenseStore';
import { ExpenseItem } from './ExpenseItem';

interface ExpenseListProps {
    groupId: string;
}

export function ExpenseList({ groupId }: ExpenseListProps) {
    const expenses = useExpenseStore(selectGroupExpenses(groupId));
    const isLoading = useExpenseStore((s) => s.isLoading);
    const error = useExpenseStore((s) => s.error);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
            </div>
        );
    }

    if (expenses.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <div className="mb-2 text-3xl">🧾</div>
                <p className="text-sm font-medium text-foreground">No expenses yet</p>
                <p className="text-xs text-muted-foreground">Add the first expense to get started.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {expenses.map((expense) => (
                <ExpenseItem key={expense.id} expense={expense} />
            ))}
        </div>
    );
}
