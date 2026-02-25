/**
 * API Route: POST /api/circle/create-wallet
 *
 * Creates a new Circle user-controlled wallet for the signed-in user.
 * Returns the challenge data needed for the Circle JS SDK PIN setup on client.
 *
 * Body: { userId: string }
 * Response: CreateWalletResponse
 */

import { NextRequest, NextResponse } from 'next/server';
import { createUserWallet } from '@/lib/circle';
import type { CreateWalletResponse } from '@/types';

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body = (await req.json()) as { userId?: string };

        if (!body.userId || typeof body.userId !== 'string') {
            return NextResponse.json(
                { error: 'userId is required' },
                { status: 400 }
            );
        }

        const result: CreateWalletResponse = await createUserWallet(body.userId);
        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        console.error('[POST /api/circle/create-wallet]', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
