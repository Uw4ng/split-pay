/**
 * components/expenses/ExpenseItem.tsx
 *
 * Single expense row — shows description, amount, who paid, and split status.
 */

import type { Expense } from '@/types';

const CATEGORY_EMOJI: Record<string, string> = {
    food: '🍕',
    transport: '🚕',
    accommodation: '🏠',
    entertainment: '🎭',
    utilities: '💡',
    other: '📋',
};

interface ExpenseItemProps {
    expense: Expense;
}

export function ExpenseItem({ expense }: ExpenseItemProps) {
    const emoji = CATEGORY_EMOJI[expense.category ?? 'other'] ?? '📋';
    const settledCount = expense.splits.filter((s) => s.settled).length;
    const totalSplits = expense.splits.length;
    const allSettled = settledCount === totalSplits;

    return (
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
            {/* Category icon */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl">
                {emoji}
            </div>

            {/* Description + payer */}
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{expense.description}</p>
                <p className="text-xs text-muted-foreground">
                    Paid by{' '}
                    <span className="font-medium text-foreground">
                        {expense.paidBy.displayName ?? expense.paidBy.email}
                    </span>
                </p>
            </div>

            {/* Amount + status */}
            <div className="shrink-0 text-right">
                <p className="font-semibold text-foreground">${expense.amount.toFixed(2)}</p>
                <p
                    className={`text-xs ${allSettled ? 'text-green-500' : 'text-yellow-500'
                        }`}
                >
                    {allSettled ? '✓ Settled' : `${settledCount}/${totalSplits} settled`}
                </p>
            </div>
        </div>
    );
}
