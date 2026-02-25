/**
 * GET /api/circle/balance?walletId=xxx&userToken=yyy
 *
 * Returns the USDC balance for the given Circle wallet.
 *
 * Query params:
 *   walletId  - Circle wallet UUID
 *   userToken - Short-lived Circle user token (required by SDK)
 *
 * Success: { success: true, data: { walletId: string, balance: number, currency: "USDC" } }
 * Error:   { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserBalance } from '@/lib/circle';

// ── Query param schema ─────────────────────────────────────────────────────────

const BalanceQuerySchema = z.object({
    walletId: z
        .string()
        .min(1, 'walletId query parameter is required and cannot be empty'),
    userToken: z
        .string()
        .min(1, 'userToken query parameter is required and cannot be empty'),
});

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
    // ── Validate query params ──────────────────────────────────────────────────
    const raw = {
        walletId: req.nextUrl.searchParams.get('walletId') ?? undefined,
        userToken: req.nextUrl.searchParams.get('userToken') ?? undefined,
    };

    const parsed = BalanceQuerySchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json(
            {
                success: false,
                error: parsed.error.issues.map((i) => i.message).join('; '),
            },
            { status: 400 }
        );
    }

    const { walletId, userToken } = parsed.data;

    // ── Fetch balance from Circle ──────────────────────────────────────────────
    try {
        const balance = await getUserBalance(walletId, userToken);

        return NextResponse.json(
            {
                success: true,
                data: {
                    walletId,
                    balance,  // number, e.g. 42.50
                    currency: 'USDC',
                },
            },
            { status: 200 }
        );
    } catch (err: unknown) {
        console.error('[GET /api/circle/balance]', err);

        const httpStatus = circleErrToStatus(err);
        const message = errMessage(err);
        return NextResponse.json({ success: false, error: message }, { status: httpStatus });
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function circleErrToStatus(err: unknown): number {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (!status) return 500;
    if (status === 401 || status === 403) return 403;
    if (status === 404) return 404;
    if (status >= 400 && status < 500) return 400;
    return 500;
}

function errMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return 'An unexpected error occurred.';
}
