/**
 * API Route: GET/POST /api/expenses
 *
 * Delegates to src/lib/db/expenses.ts — the typed DB layer.
 *
 * GET  ?groupId=... → list all expenses for a group (with splits + paidBy user)
 * POST             → create a new expense
 *
 * Body (POST):
 * {
 *   groupId:       string
 *   paidByUserId:  string
 *   amount:        number              ← human-readable USDC (e.g. 12.5)
 *   description:   string
 *   category?:     string
 *   splits:        Record<userId, number>   ← must sum to amount (±0.01)
 * }
 *
 * Response shape: { success: true, data } | { success: false, error }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createExpense, getGroupExpenses } from '@/lib/db/expenses';

// ── Schemas ───────────────────────────────────────────────────────────────────

const GetQuerySchema = z.object({
    groupId: z.string().uuid('groupId must be a valid UUID'),
});

const PostBodySchema = z.object({
    groupId: z.string().uuid('groupId must be a valid UUID'),
    paidByUserId: z.string().uuid('paidByUserId must be a valid UUID'),
    amount: z.number().positive('amount must be > 0'),
    description: z.string().min(1).max(200),
    category: z.enum(['food', 'transport', 'accommodation', 'entertainment', 'utilities', 'other']).optional(),
    splits: z.record(z.string().uuid(), z.number().nonnegative()),
});

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
    const raw = { groupId: req.nextUrl.searchParams.get('groupId') ?? undefined };
    const parsed = GetQuerySchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: parsed.error.issues.map((i) => i.message).join('; ') },
            { status: 400 }
        );
    }

    const { data, error } = await getGroupExpenses(parsed.data.groupId);
    if (error) return NextResponse.json({ success: false, error }, { status: 500 });
    return NextResponse.json({ success: true, data }, { status: 200 });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
    let body: z.infer<typeof PostBodySchema>;
    try {
        const raw = await req.json();
        const parsed = PostBodySchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
                { status: 400 }
            );
        }
        body = parsed.data;
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { data, error } = await createExpense({
        groupId: body.groupId,
        paidByUserId: body.paidByUserId,
        amount: body.amount,
        description: body.description,
        category: body.category,
        splits: body.splits,
    });

    if (error) {
        const status = error.includes('sum') || error.includes('empty') ? 400 : 500;
        return NextResponse.json({ success: false, error }, { status });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
}
