/**
 * GET /api/circle/wallet-info?userId=xxx
 *
 * Called AFTER the user completes the Circle PIN challenge client-side.
 * Returns the walletId and EVM address for the authenticated user.
 *
 * Query params:
 *   userId - your internal user UUID
 *
 * Success: { success: true, data: { walletId: string, address: string } }
 * Error:   { success: false, error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWalletInfo } from '@/lib/circle';

const QuerySchema = z.object({
    userId: z.string().uuid('userId must be a valid UUID'),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
    const raw = {
        userId: req.nextUrl.searchParams.get('userId') ?? undefined,
    };

    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: parsed.error.issues.map((i) => i.message).join('; ') },
            { status: 400 }
        );
    }

    try {
        const info = await getWalletInfo(parsed.data.userId);
        if (!info) {
            return NextResponse.json(
                { success: false, error: 'No wallet found for this user. PIN setup may be incomplete.' },
                { status: 404 }
            );
        }
        return NextResponse.json({ success: true, data: info }, { status: 200 });
    } catch (err: unknown) {
        console.error('[GET /api/circle/wallet-info]', err);
        const status = (err as { response?: { status?: number } })?.response?.status ?? 500;
        const message = err instanceof Error ? err.message : 'Unexpected error.';
        return NextResponse.json({ success: false, error: message }, { status });
    }
}
