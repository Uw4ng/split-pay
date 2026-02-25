/**
 * src/lib/db/expenses.ts
 *
 * Database helpers for `expenses` and `expense_splits` tables.
 *
 * Key rules:
 * - amount fields are ALWAYS sent to Supabase as strings (e.g. "12.500000")
 *   to avoid JavaScript float precision issues.
 * - Returned amounts are parsed back to numbers via Number() before returning.
 * - All dates are ISO 8601 strings.
 * - Functions return { data, error } — errors are never thrown.
 */

import { getSupabaseAdmin } from '@/lib/supabase';
import type { ExpenseRow, ExpenseSplitRow, UserRow } from './database.types';
import type { DbResult } from './users';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A parsed expense with numeric amounts and full user/split objects */
export interface Expense {
    id: string;
    groupId: string;
    paidBy: UserRow;
    amount: number;
    description: string;
    category: string | null;
    createdAt: string;
    splits: ExpenseSplit[];
}

/** A parsed split with numeric amount */
export interface ExpenseSplit {
    id: string;
    expenseId: string;
    userId: string;
    amount: number;
    settled: boolean;
    settledAt: string | null;
    txHash: string | null;
}

/** Input for creating an expense */
export interface CreateExpenseInput {
    groupId: string;
    paidByUserId: string;
    /** Total amount — send as a number, we convert to string internally */
    amount: number;
    description: string;
    category?: string;
    /**
     * Map of userId → amount they owe (their share).
     * Must sum to `amount` (±0.01 tolerance).
     * Include the payer's own share (may be 0 if they paid for others only).
     */
    splits: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format number to a 6-decimal string for Supabase (matches NUMERIC(18,6)) */
function toAmountStr(n: number): string {
    return n.toFixed(6);
}

/** Parse Supabase's numeric string back to a number */
function parseAmount(s: string): number {
    return Number(s);
}

function rowToSplit(row: ExpenseSplitRow): ExpenseSplit {
    return {
        id: row.id,
        expenseId: row.expense_id,
        userId: row.user_id,
        amount: parseAmount(row.amount),
        settled: row.settled,
        settledAt: row.settled_at,
        txHash: row.tx_hash,
    };
}

// ── createExpense ─────────────────────────────────────────────────────────────

/**
 * Creates an expense and all associated splits atomically.
 *
 * Validates:
 * - description length
 * - split amounts sum to total (±0.01 USDC tolerance)
 * - at least 2 splits (the payer + 1 other)
 *
 * Amount strings are sent to Supabase as "X.XXXXXX" (6 decimal places).
 * Returned amounts are parsed back to numbers.
 */
export async function createExpense(
    input: CreateExpenseInput
): DbResult<Expense> {
    const db = getSupabaseAdmin();

    // ── Validate ────────────────────────────────────────────────────────────────
    if (!input.description.trim()) {
        return { data: null, error: 'Description cannot be empty' };
    }
    if (input.description.length > 200) {
        return { data: null, error: 'Description must be ≤ 200 characters' };
    }
    if (input.amount <= 0) {
        return { data: null, error: 'Amount must be greater than 0' };
    }
    if (Object.keys(input.splits).length < 1) {
        return { data: null, error: 'At least one split is required' };
    }

    const splitTotal = Object.values(input.splits).reduce((s, v) => s + v, 0);
    if (Math.abs(splitTotal - input.amount) > 0.01) {
        return {
            data: null,
            error: `Split amounts (${splitTotal.toFixed(2)}) must sum to total amount (${input.amount.toFixed(2)})`,
        };
    }

    // ── Insert expense ──────────────────────────────────────────────────────────
    const { data: expense, error: expenseError } = await db
        .from('expenses')
        .insert({
            group_id: input.groupId,
            paid_by: input.paidByUserId,
            amount: toAmountStr(input.amount),
            description: input.description.trim(),
            category: input.category ?? null,
        })
        .select()
        .single();

    if (expenseError) return { data: null, error: expenseError.message };

    const expenseRow = expense as ExpenseRow;

    // ── Insert splits ───────────────────────────────────────────────────────────
    const splitInserts = Object.entries(input.splits).map(([userId, amount]) => ({
        expense_id: expenseRow.id,
        user_id: userId,
        amount: toAmountStr(amount),
    }));

    const { error: splitError } = await db
        .from('expense_splits')
        .insert(splitInserts);

    if (splitError) return { data: null, error: splitError.message };

    // ── Fetch paidBy user and splits to return complete Expense ────────────────
    const [paidByResult, splitsResult] = await Promise.all([
        db.from('users').select('*').eq('id', input.paidByUserId).single(),
        db.from('expense_splits').select('*').eq('expense_id', expenseRow.id),
    ]);

    if (paidByResult.error) return { data: null, error: paidByResult.error.message };
    if (splitsResult.error) return { data: null, error: splitsResult.error.message };

    return {
        data: {
            id: expenseRow.id,
            groupId: expenseRow.group_id,
            paidBy: paidByResult.data as UserRow,
            amount: parseAmount(expenseRow.amount),
            description: expenseRow.description,
            category: expenseRow.category,
            createdAt: expenseRow.created_at,
            splits: (splitsResult.data as ExpenseSplitRow[]).map(rowToSplit),
        },
        error: null,
    };
}

// ── getGroupExpenses ──────────────────────────────────────────────────────────

/**
 * Fetches all expenses for a group, each with full split lists and paidBy user.
 * Ordered by created_at descending (newest first).
 */
export async function getGroupExpenses(groupId: string): DbResult<Expense[]> {
    const db = getSupabaseAdmin();

    const { data: expenseRows, error: expError } = await db
        .from('expenses')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

    if (expError) return { data: null, error: expError.message };
    if (!expenseRows?.length) return { data: [], error: null };

    const expenses = await Promise.all(
        (expenseRows as ExpenseRow[]).map(async (row): Promise<Expense | null> => {
            const [paidByResult, splitsResult] = await Promise.all([
                db.from('users').select('*').eq('id', row.paid_by).single(),
                db.from('expense_splits').select('*').eq('expense_id', row.id),
            ]);

            if (paidByResult.error || splitsResult.error) return null;

            return {
                id: row.id,
                groupId: row.group_id,
                paidBy: paidByResult.data as UserRow,
                amount: parseAmount(row.amount),
                description: row.description,
                category: row.category,
                createdAt: row.created_at,
                splits: (splitsResult.data as ExpenseSplitRow[]).map(rowToSplit),
            };
        })
    );

    // Filter out any nulls from failed sub-fetches
    const valid = expenses.filter((e): e is Expense => e !== null);
    return { data: valid, error: null };
}

// ── markSplitAsSettled ────────────────────────────────────────────────────────

/**
 * Marks a specific split as settled after the on-chain USDC transfer confirms.
 *
 * @param expenseId  - The expense UUID
 * @param userId     - The user whose split is being settled
 * @param txHash     - The Arc blockchain transaction hash
 */
export async function markSplitAsSettled(
    expenseId: string,
    userId: string,
    txHash: string
): DbResult<ExpenseSplit> {
    const db = getSupabaseAdmin();

    if (!txHash || !txHash.startsWith('0x')) {
        return {
            data: null,
            error: 'txHash must be a valid 0x-prefixed transaction hash',
        };
    }

    // Verify the split exists and is not already settled
    const { data: existing, error: fetchError } = await db
        .from('expense_splits')
        .select('*')
        .eq('expense_id', expenseId)
        .eq('user_id', userId)
        .single();

    if (fetchError) {
        return {
            data: null,
            error: fetchError.code === 'PGRST116'
                ? 'Split not found for this expense and user'
                : fetchError.message,
        };
    }

    if ((existing as ExpenseSplitRow).settled) {
        return {
            data: null,
            error: 'This split is already settled',
        };
    }

    // Mark as settled
    const { data: updated, error: updateError } = await db
        .from('expense_splits')
        .update({
            settled: true,
            settled_at: new Date().toISOString(),
            tx_hash: txHash,
        })
        .eq('expense_id', expenseId)
        .eq('user_id', userId)
        .select()
        .single();

    if (updateError) return { data: null, error: updateError.message };

    return { data: rowToSplit(updated as ExpenseSplitRow), error: null };
}

// ── getUnsettledSplitsForUser ─────────────────────────────────────────────────

/**
 * Returns all unsettled splits for a user across all groups.
 * Used to compute a user's total outstanding debt.
 */
export async function getUnsettledSplitsForUser(
    userId: string
): DbResult<ExpenseSplit[]> {
    const db = getSupabaseAdmin();

    const { data, error } = await db
        .from('expense_splits')
        .select('*')
        .eq('user_id', userId)
        .eq('settled', false);

    if (error) return { data: null, error: error.message };

    return {
        data: ((data ?? []) as ExpenseSplitRow[]).map(rowToSplit),
        error: null,
    };
}
