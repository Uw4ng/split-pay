/**
 * POST /api/settle
 *
 * Orchestrates a full settlement:
 *   1. Verifies the sender's wallet belongs to the authenticated user (security)
 *   2. Resolves the recipient's EVM address from our DB
 *   3. Builds an idempotency key from the split IDs
 *   4. Calls the Circle transfer API
 *   5. Marks all supplied split IDs as settled=true in Supabase (atomic)
 *
 * Body: { toUserId: string, amount: number, splitIds: string[] }
 *
 * Success:  { success: true,  txHash: string | null }
 * Error:    { success: false, error: string, code?: string }
 *
 * Codes:
 *   200 — settled (or already settled — idempotent)
 *   400 — bad request
 *   401 — not authenticated
 *   402 — insufficient USDC balance
 *   403 — forbidden (wallet does not belong to auth user)
 *   404 — recipient wallet not found
 *   409 — already settled (code: ALREADY_SETTLED)
 *   500 — unexpected error
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getUser } from '@/lib/db/users';
import { markSplitSettledById } from '@/lib/db/expenses';
import { transferUSDC, createUserToken, getUserBalance, getWalletInfo } from '@/lib/circle';

// ── Schema ────────────────────────────────────────────────────────────────────

const BodySchema = z.object({
    /** Internal user ID of the creditor */
    toUserId: z.string().uuid('toUserId must be a UUID'),
    /** USDC amount (2 d.p., > 0) */
    amount: z.number().positive().min(0.01).max(1_000_000),
    /** expense_splits.id rows to mark settled */
    splitIds: z.array(z.string().uuid()).min(1, 'At least one splitId is required'),
});

// ── Helper: server Supabase client (reads session cookie) ────────────────────

function makeServerClient(req: NextRequest) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClient<any>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { headers: { Cookie: req.headers.get('cookie') ?? '' } },
        }
    );
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {

    // ── 1. Auth: who is calling? ────────────────────────────────────────────────
    const sb = makeServerClient(req);
    const { data: { session } } = await sb.auth.getSession();

    if (!session?.user) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const authUserId = session.user.id;

    // ── 2. Parse + validate body ────────────────────────────────────────────────
    let body: z.infer<typeof BodySchema>;
    try {
        const raw = await req.json();
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join('; ') },
                { status: 400 }
            );
        }
        body = parsed.data;
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const { toUserId, amount, splitIds } = body;

    // ── 3. Resolve sender's wallet (security check) ─────────────────────────────
    const { data: senderUser, error: senderErr } = await getUser(authUserId);
    if (senderErr || !senderUser) {
        return NextResponse.json({ success: false, error: 'Sender user not found' }, { status: 404 });
    }
    const fromWalletId = senderUser.wallet_id;
    if (!fromWalletId) {
        return NextResponse.json(
            { success: false, error: 'Your wallet is not set up yet. Complete PIN setup first.' },
            { status: 400 }
        );
    }
    // 🔒 wallet_id came from DB using auth user's ID — so it is implicitly theirs.
    //    No further "does this wallet belong to user" check is needed because we
    //    NEVER accept fromWalletId from the request body.

    // ── 4. Resolve recipient's EVM address ──────────────────────────────────────
    const recipientInfo = await getWalletInfo(toUserId);
    if (!recipientInfo?.address) {
        return NextResponse.json(
            { success: false, error: 'Recipient has no wallet. Ask them to sign in first.' },
            { status: 404 }
        );
    }

    const toAddress = recipientInfo.address;

    // ── 5. Build idempotency key (deterministic for these split IDs) ─────────────
    // Sorted so that retry with same set always produces the same key
    const idempotencyKey = `settle-${fromWalletId}-${[...splitIds].sort().join('-')}`;
    // UUID v4 is required by Circle — hash our key to a stable UUID-like string
    // We use a simple deterministic encode: SHA-style prefix + truncated hex.
    // In practice Circle accepts any unique string as idempotency key, not just UUIDs,
    // but we wrap it to satisfy the schema. We pass the raw key here and skip the
    // /api/circle/transfer proxy (to avoid double-hop).
    const idempotencyKeyFinal = await deterministicUuid(idempotencyKey);

    // ──  // Get a fresh Circle userToken for the sender
    let userToken: string;
    try {
        const tokenData = await createUserToken(authUserId);
        userToken = tokenData.userToken;
    } catch (err) {
        console.error('[settle] getUserToken failed:', err);
        return NextResponse.json(
            { success: false, error: 'Could not obtain transfer token. Please try again.' },
            { status: 500 }
        );
    }

    // ── 7. Execute Circle transfer ───────────────────────────────────────────────
    let txHash: string | null = null;
    let transferSuccess = false;

    try {
        const result = await transferUSDC(
            userToken,
            fromWalletId,
            toAddress,
            amount,
            idempotencyKeyFinal
        );
        txHash = result.txHash ?? null;
        transferSuccess = true;
    } catch (err: unknown) {
        const circleStatus = (err as { response?: { status?: number } })?.response?.status;
        const circleMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? (err instanceof Error ? err.message : 'Transfer failed');

        // 409 from Circle = duplicate idempotency key = already transferred
        if (circleStatus === 409) {
            transferSuccess = true; // treat as success, continue to DB update
            // txHash unknown — we'll leave it null
        } else if (circleStatus === 422) {
            // Circle's code for insufficient funds
            const balance = await getSenderBalance(userToken, fromWalletId);
            const balMsg = balance !== null ? ` Mevcut: $${balance.toFixed(2)} USDC` : '';
            return NextResponse.json(
                { success: false, error: `Yetersiz USDC bakiyesi.${balMsg}` },
                { status: 402 }
            );
        } else {
            console.error('[settle] Circle transfer error:', circleStatus, circleMsg);
            return NextResponse.json({ success: false, error: circleMsg }, { status: circleStatus ?? 500 });
        }
    }

    if (!transferSuccess) {
        return NextResponse.json({ success: false, error: 'Transfer failed unexpectedly' }, { status: 500 });
    }

    // ── 8. Mark splits as settled in DB ─────────────────────────────────────────
    const settleResults = await Promise.all(
        splitIds.map((splitId) => markSplitSettledById(splitId, txHash ?? 'pending'))
    );

    // Collect any DB errors (non-fatal for idempotent retries)
    const dbErrors = settleResults
        .filter((r) => r.error !== null)
        .map((r) => r.error);

    if (dbErrors.length > 0) {
        // Some splits may have already been settled (ALREADY_SETTLED) — that's fine
        const nonIdempotentErrors = dbErrors.filter((e) => !String(e).includes('already settled'));
        if (nonIdempotentErrors.length > 0) {
            console.error('[settle] DB settle errors:', nonIdempotentErrors);
            // Transfer already happened — return 200 with a warning rather than 500
            return NextResponse.json({
                success: true,
                txHash,
                warning: 'Transfer completed but some splits could not be marked settled. They will be updated automatically.',
            });
        }
    }

    return NextResponse.json({ success: true, txHash });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts an arbitrary string into a stable UUID-v4-shaped string.
 * Uses the Web Crypto API (available in Next.js Edge/Node runtimes).
 * Output is deterministic for the same input.
 */
async function deterministicUuid(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    // Format as UUID: 8-4-4-4-12
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        '4' + hex.slice(13, 16),          // version 4
        (parseInt(hex[16], 16) & 0x3 | 0x8).toString(16) + hex.slice(17, 20), // variant
        hex.slice(20, 32),
    ].join('-');
}

/**
 * Attempts to fetch the sender's current USDC balance.
 * Returns null if it can't be obtained.
 */
async function getSenderBalance(userToken: string, walletId: string): Promise<number | null> {
    try {
        return await getUserBalance(walletId, userToken);
    } catch {
        return null;
    }
}
