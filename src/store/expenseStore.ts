/**
 * store/expenseStore.ts
 *
 * Zustand store for expense state management.
 * Expenses are stored per-group (Record<groupId, Expense[]>).
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Expense, ExpenseState, ExpenseCategory } from '@/types';

// ── Actions ──────────────────────────────────────────────────────────────────

interface CreateExpenseInput {
    groupId: string;
    paidByUserId: string;
    amount: number;
    description: string;
    category?: ExpenseCategory;
    /** Map of userId → amount they owe (must sum to `amount`) */
    splits: Record<string, number>;
}

interface ExpenseActions {
    /** Fetch all expenses for a given group */
    fetchExpenses: (groupId: string) => Promise<void>;
    /** Create a new expense in a group */
    createExpense: (input: CreateExpenseInput) => Promise<Expense>;
    /** Mark a split as settled (after on-chain transfer confirmed) */
    markSplitSettled: (expenseId: string, userId: string, txHash: string) => Promise<void>;
    /** Clear errors */
    clearError: () => void;
    /** Reset store */
    reset: () => void;
}

// ── Initial state ─────────────────────────────────────────────────────────────

const initialState: ExpenseState = {
    expenses: {},
    isLoading: false,
    error: null,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useExpenseStore = create<ExpenseState & ExpenseActions>()(
    devtools(
        (set) => ({
            ...initialState,

            fetchExpenses: async (groupId) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await fetch(`/api/expenses?groupId=${groupId}`);
                    if (!res.ok) {
                        const { error } = (await res.json()) as { error: string };
                        throw new Error(error ?? 'Failed to fetch expenses');
                    }
                    const expenses = (await res.json()) as Expense[];
                    set((state) => ({
                        expenses: { ...state.expenses, [groupId]: expenses },
                        isLoading: false,
                    }));
                } catch (err) {
                    set({
                        isLoading: false,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                }
            },

            createExpense: async (input) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await fetch('/api/expenses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(input),
                    });
                    if (!res.ok) {
                        const { error } = (await res.json()) as { error: string };
                        throw new Error(error ?? 'Failed to create expense');
                    }
                    const expense = (await res.json()) as Expense;
                    set((state) => ({
                        expenses: {
                            ...state.expenses,
                            [input.groupId]: [expense, ...(state.expenses[input.groupId] ?? [])],
                        },
                        isLoading: false,
                    }));
                    return expense;
                } catch (err) {
                    set({
                        isLoading: false,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                    throw err;
                }
            },

            markSplitSettled: async (expenseId, userId, txHash) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await fetch(`/api/expenses/${expenseId}/settle`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, txHash }),
                    });
                    if (!res.ok) {
                        const { error } = (await res.json()) as { error: string };
                        throw new Error(error ?? 'Failed to mark split as settled');
                    }
                    // Update the local split's settled state optimistically
                    set((state) => {
                        const updated: Record<string, Expense[]> = {};
                        for (const [gId, expenses] of Object.entries(state.expenses)) {
                            updated[gId] = expenses.map((exp) => {
                                if (exp.id !== expenseId) return exp;
                                return {
                                    ...exp,
                                    splits: exp.splits.map((s) =>
                                        s.userId === userId ? { ...s, settled: true, txHash } : s
                                    ),
                                };
                            });
                        }
                        return { expenses: updated, isLoading: false };
                    });
                } catch (err) {
                    set({
                        isLoading: false,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                    throw err;
                }
            },

            clearError: () => set({ error: null }),
            reset: () => set(initialState),
        }),
        { name: 'ExpenseStore' }
    )
);

// ── Selectors ─────────────────────────────────────────────────────────────────

/** Get all expenses for a given group from the store */
export const selectGroupExpenses =
    (groupId: string) =>
        (state: ExpenseState): Expense[] =>
            state.expenses[groupId] ?? [];

/** Get total unsettled balance for a user in a group */
export const selectUserBalance =
    (groupId: string, userId: string) =>
        (state: ExpenseState): number => {
            const expenses = state.expenses[groupId] ?? [];
            let balance = 0;
            for (const expense of expenses) {
                for (const split of expense.splits) {
                    if (split.settled) continue;
                    if (split.userId === userId && expense.paidBy.id !== userId) {
                        balance -= split.amount; // user owes this
                    } else if (expense.paidBy.id === userId && split.userId !== userId) {
                        balance += split.amount; // user is owed this
                    }
                }
            }
            return Math.round(balance * 100) / 100;
        };
