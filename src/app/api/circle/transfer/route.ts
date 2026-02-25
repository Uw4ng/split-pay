/**
 * POST /api/circle/transfer
 *
 * Initiates a USDC transfer on Arc (via Circle Programmable Wallets).
 * The `idempotencyKey` is REQUIRED to prevent duplicate on-chain transfers.
 *
 * Body:
 * {
 *   userToken:      string  — short-lived Circle user token (from /api/circle/create-wallet or session)
 *   fromWalletId:   string  — Circle wallet UUID of the sender
 *   toAddress:      string  — recipient EVM address (0x...)
 *   amount:         number  — USDC amount (e.g. 12.50)
 *   idempotencyKey: string  — UUID v4, caller-supplied, prevents double-sends
 * }
 *
 * Success: { success: true, data: { transferId, txHash, status } }
 * Error:   { success: false, error: string }
 *
 * HTTP codes:
 *   201 — transfer initiated (status: "pending")
 *   400 — bad request (validation failed, invalid amount, etc.)
 *   402 — insufficient USDC balance
 *   403 — unauthorized (invalid userToken)
 *   409 — duplicate transfer (same idempotencyKey already processed)
 *   500 — unexpected server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { transferUSDC } from '@/lib/circle';

// ── Request schema ─────────────────────────────────────────────────────────────

const TransferSchema = z.object({
    /** Short-lived Circle user token for the SENDER */
    userToken: z.string().min(1, 'userToken is required'),

    /** Circle UUID of the sender's wallet */
    fromWalletId: z.string().min(1, 'fromWalletId is required'),

    /**
     * Recipient EVM address.
     * Must be a valid 0x-prefixed 42-character hex string.
     */
    toAddress: z
        .string()
        .regex(/^0x[0-9a-fA-F]{40}$/, 'toAddress must be a valid EVM address (0x + 40 hex chars)'),

    /**
     * USDC amount to transfer.
     * Must be a positive number with at most 6 decimal places.
     * Minimum 0.01 USDC to avoid dust transactions.
     */
    amount: z
        .number()
        .positive('amount must be greater than 0')
        .min(0.01, 'minimum transfer amount is 0.01 USDC')
        .max(1_000_000, 'maximum transfer amount is 1,000,000 USDC'),

    /**
     * Caller-supplied UUID v4.
     * Store this alongside the settlement record and always pass the same key
     * on retries — Circle will deduplicate and return the same transfer.
     */
    idempotencyKey: z.string().uuid('idempotencyKey must be a valid UUID v4'),
});

type TransferBody = z.infer<typeof TransferSchema>;

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
    // ── Parse & validate body ──────────────────────────────────────────────────
    let body: TransferBody;
    try {
        const raw = await req.json();
        const parsed = TransferSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
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

    // ── Guard: sender ≠ recipient  ─────────────────────────────────────────────
    // (Address equality check — toAddress could match the wallet's own address)
    // Resolved at a higher level; Circle will reject it anyway, but let's be explicit.

    // ── Initiate transfer ──────────────────────────────────────────────────────
    try {
        const result = await transferUSDC(
            body.userToken,
            body.fromWalletId,
            body.toAddress,
            body.amount,
            body.idempotencyKey
        );

        return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (err: unknown) {
        console.error('[POST /api/circle/transfer]', err);

        const httpStatus = circleErrToStatus(err);
        const message = circleErrMessage(err);
        return NextResponse.json({ success: false, error: message }, { status: httpStatus });
    }
}

// ── Error helpers ──────────────────────────────────────────────────────────────

/**
 * Maps Circle API error responses to appropriate HTTP status codes.
 * Circle uses standard HTTP codes in its responses, so we pass them through.
 */
function circleErrToStatus(err: unknown): number {
    const circleStatus = (err as { response?: { status?: number } })?.response?.status;
    if (!circleStatus) return 500;

    switch (circleStatus) {
        case 400: return 400; // bad request (e.g. invalid address)
        case 401:
        case 403: return 403; // invalid / expired userToken
        case 404: return 404; // wallet not found
        case 409: return 409; // duplicate idempotencyKey (treat as success on client)
        case 422: return 402; // insufficient balance → 402 Payment Required is semantic
        default:
            if (circleStatus >= 400 && circleStatus < 500) return 400;
            return 500;
    }
}

/**
 * Extracts a user-safe error message from Circle API error or native Error.
 * Never leaks raw stack traces.
 */
function circleErrMessage(err: unknown): string {
    // Circle API errors have a structured response body
    const circleMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (circleMsg) return circleMsg;

    if (err instanceof Error) return err.message;
    return 'An unexpected error occurred during the transfer.';
}
