/**
 * API Route: GET /api/circle/balance?walletId=...
 *
 * Returns the USDC balance for a given Circle wallet.
 *
 * Query params: walletId (string)
 * Response: BalanceResponse
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWalletBalance } from '@/lib/circle';
import type { BalanceResponse } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        const walletId = req.nextUrl.searchParams.get('walletId');

        if (!walletId) {
            return NextResponse.json(
                { error: 'walletId query parameter is required' },
                { status: 400 }
            );
        }

        const result: BalanceResponse = await getWalletBalance(walletId);
        return NextResponse.json(result, { status: 200 });
    } catch (err) {
        console.error('[GET /api/circle/balance]', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
