/**
 * API Route: GET/POST /api/expenses
 *
 * GET  ?groupId=... → list all expenses for a group
 * POST             → create a new expense
 *
 * Body (POST):
 * {
 *   groupId: string;
 *   paidByUserId: string;
 *   amount: number;
 *   description: string;
 *   category?: string;
 *   splits: Record<userId, amount>;  // must sum to amount
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, TABLES } from '@/lib/supabase';
import { validateSplits } from '@/lib/debt';
import type { DbExpense, DbSplit, DbUser, Expense, ExpenseCategory } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function dbExpenseToExpense(
    dbExpense: DbExpense,
    paidByUser: DbUser,
    splits: (DbSplit & { user: DbUser })[]
): Expense {
    return {
        id: dbExpense.id,
        groupId: dbExpense.group_id,
        paidBy: {
            id: paidByUser.id,
            email: paidByUser.email,
            walletId: paidByUser.wallet_id,
            walletAddress: paidByUser.wallet_address,
            displayName: paidByUser.display_name ?? undefined,
            createdAt: paidByUser.created_at,
        },
        amount: dbExpense.amount,
        description: dbExpense.description,
        category: dbExpense.category ?? undefined,
        splits: splits.map((s) => ({
            userId: s.user_id,
            amount: s.amount,
            settled: s.settled,
            txHash: s.tx_hash ?? undefined,
        })),
        createdAt: dbExpense.created_at,
    };
}

// ── GET /api/expenses?groupId=... ─────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        const userId = req.headers.get('x-user-id');
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const groupId = req.nextUrl.searchParams.get('groupId');
        if (!groupId) {
            return NextResponse.json({ error: 'groupId query parameter required' }, { status: 400 });
        }

        const db = getSupabaseAdmin();

        const { data: expenses, error: expErr } = await db
            .from(TABLES.expenses)
            .select('*')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false });

        if (expErr) throw expErr;

        const result: Expense[] = await Promise.all(
            (expenses as DbExpense[]).map(async (exp) => {
                const { data: paidByUser } = await db
                    .from(TABLES.users)
                    .select('*')
                    .eq('id', exp.paid_by)
                    .single();

                const { data: splitRows } = await db
                    .from(TABLES.splits)
                    .select('*')
                    .eq('expense_id', exp.id);

                const splitsWithUsers = await Promise.all(
                    (splitRows as DbSplit[]).map(async (s) => {
                        const { data: user } = await db
                            .from(TABLES.users)
                            .select('*')
                            .eq('id', s.user_id)
                            .single();
                        return { ...s, user: user as DbUser };
                    })
                );

                return dbExpenseToExpense(exp, paidByUser as DbUser, splitsWithUsers);
            })
        );

        return NextResponse.json(result, { status: 200 });
    } catch (err) {
        console.error('[GET /api/expenses]', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

// ── POST /api/expenses ────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const userId = req.headers.get('x-user-id');
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = (await req.json()) as {
            groupId?: string;
            paidByUserId?: string;
            amount?: number;
            description?: string;
            category?: ExpenseCategory;
            splits?: Record<string, number>;
        };

        const { groupId, paidByUserId, amount, description, category, splits } = body;

        if (!groupId || !paidByUserId || !amount || !description || !splits) {
            return NextResponse.json(
                { error: 'groupId, paidByUserId, amount, description, and splits are required' },
                { status: 400 }
            );
        }

        // Validate splits sum to total
        if (!validateSplits(amount, Object.values(splits))) {
            return NextResponse.json(
                { error: 'splits must sum to the total amount (±$0.01 tolerance)' },
                { status: 400 }
            );
        }

        const db = getSupabaseAdmin();

        // Insert expense
        const { data: expense, error: expErr } = await db
            .from(TABLES.expenses)
            .insert({
                group_id: groupId,
                paid_by: paidByUserId,
                amount,
                description: description.trim(),
                category: category ?? null,
            })
            .select()
            .single();

        if (expErr) throw expErr;

        // Insert splits
        const splitInserts = Object.entries(splits).map(([splitUserId, splitAmount]) => ({
            expense_id: (expense as DbExpense).id,
            user_id: splitUserId,
            amount: splitAmount,
            settled: false,
            tx_hash: null,
        }));

        const { error: splitErr } = await db.from(TABLES.splits).insert(splitInserts);
        if (splitErr) throw splitErr;

        // Return fully populated expense
        const { data: splitRows } = await db
            .from(TABLES.splits)
            .select('*')
            .eq('expense_id', (expense as DbExpense).id);

        const { data: paidByUser } = await db
            .from(TABLES.users)
            .select('*')
            .eq('id', paidByUserId)
            .single();

        const splitsWithUsers = await Promise.all(
            (splitRows as DbSplit[]).map(async (s) => {
                const { data: user } = await db
                    .from(TABLES.users)
                    .select('*')
                    .eq('id', s.user_id)
                    .single();
                return { ...s, user: user as DbUser };
            })
        );

        const result = dbExpenseToExpense(expense as DbExpense, paidByUser as DbUser, splitsWithUsers);

        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        console.error('[POST /api/expenses]', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
