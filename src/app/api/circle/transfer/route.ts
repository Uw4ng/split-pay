/**
 * API Route: POST /api/circle/transfer
 *
 * Initiates a USDC transfer on Arc blockchain via Circle.
 * Only callable server-side — API key never exposed to client.
 *
 * Body: { userToken: string; fromWalletId: string; toAddress: string; amount: string }
 * Response: TransferResponse
 */

import { NextRequest, NextResponse } from 'next/server';
import { initiateTransfer } from '@/lib/circle';
import type { TransferRequest, TransferResponse } from '@/types';

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body = (await req.json()) as {
            userToken?: string;
            fromWalletId?: string;
            toAddress?: string;
            amount?: string;
        };

        const { userToken, fromWalletId, toAddress, amount } = body;

        if (!userToken || !fromWalletId || !toAddress || !amount) {
            return NextResponse.json(
                { error: 'userToken, fromWalletId, toAddress, and amount are all required' },
                { status: 400 }
            );
        }

        // Basic USDC amount validation
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return NextResponse.json(
                { error: 'amount must be a positive number' },
                { status: 400 }
            );
        }

        const transferReq: TransferRequest = { fromWalletId, toAddress, amount };
        const result: TransferResponse = await initiateTransfer(userToken, transferReq);

        return NextResponse.json(result, { status: 200 });
    } catch (err) {
        console.error('[POST /api/circle/transfer]', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
