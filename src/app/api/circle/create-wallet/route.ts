/**
 * POST /api/circle/create-wallet
 *
 * Registers a Circle user and returns the wallet creation challenge data.
 * The client must complete the PIN setup challenge via the Circle JS SDK,
 * then call GET /api/circle/wallet-info to get the actual walletId + address.
 *
 * Body: { userId: string; idempotencyKey: string }
 *
 * Success: { success: true, data: { userToken, encryptionKey, challengeId } }
 * Error:   { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setupUserWallet } from '@/lib/circle';

// ── Request schema ─────────────────────────────────────────────────────────────

const CreateWalletSchema = z.object({
    /** Your internal user ID (e.g. Supabase auth user.id) */
    userId: z.string().uuid({ message: 'userId must be a valid UUID' }),

    /**
     * Caller-supplied idempotency key (UUID v4).
     * Pass the same key to safely retry without creating duplicate wallets.
     */
    idempotencyKey: z.string().uuid({ message: 'idempotencyKey must be a valid UUID' }),
});

type CreateWalletBody = z.infer<typeof CreateWalletSchema>;

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
    // ── Parse & validate body ──────────────────────────────────────────────────
    let body: CreateWalletBody;
    try {
        const raw = await req.json();
        const parsed = CreateWalletSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: parsed.error.issues.map((i) => i.message).join('; '),
                },
                { status: 400 }
            );
        }
        body = parsed.data;
    } catch {
        return NextResponse.json(
            { success: false, error: 'Invalid JSON body' },
            { status: 400 }
        );
    }

    // ── Call Circle ────────────────────────────────────────────────────────────
    try {
        const challenge = await setupUserWallet(body.userId, body.idempotencyKey);
        return NextResponse.json({ success: true, data: challenge }, { status: 201 });
    } catch (err: unknown) {
        console.error('[POST /api/circle/create-wallet]', err);

        // Map Circle API errors to appropriate HTTP codes
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
    if (status === 409) return 409;
    if (status >= 400 && status < 500) return 400;
    return 500;
}

function errMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    return 'An unexpected error occurred.';
}
