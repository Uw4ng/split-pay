/**
 * src/app/api/settle/route.test.ts
 *
 * Unit tests for POST /api/settle.
 *
 * Strategy: mock the three external boundaries
 *   - @/lib/circle   (Circle SDK calls)
 *   - @/lib/db/users (DB user lookup)
 *   - @/lib/db/expenses (DB split settle)
 * and stub Supabase session via @supabase/supabase-js.
 *
 * We call the route handler directly (Next.js Route Handler pattern)
 * by constructing a real NextRequest.
 */

import { NextRequest } from 'next/server';

// ── Mocks — must be at top before any imports that would load the real modules ──

jest.mock('@/lib/circle', () => ({
    transferUSDC: jest.fn(),
    createUserToken: jest.fn(),
    getUserBalance: jest.fn(),
    getWalletInfo: jest.fn(),
}));

jest.mock('@/lib/db/users', () => ({
    getUser: jest.fn(),
}));

jest.mock('@/lib/db/expenses', () => ({
    markSplitSettledById: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({
        auth: {
            getSession: jest.fn(),
        },
    })),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { POST } from './route';
import * as circle from '@/lib/circle';
import * as dbUsers from '@/lib/db/users';
import * as dbExpenses from '@/lib/db/expenses';
import { createClient } from '@supabase/supabase-js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const FROM_WALLET_ID = 'wlt-aaaaaa-bbbb-cccc';
const TO_USER_ID = '22222222-2222-4222-9222-222222222222';
const TO_ADDRESS = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
const SPLIT_IDS = [
    'aaaabbbb-cccc-4ddd-8eee-ffffffffffff',
    'bbbbcccc-dddd-4eee-9fff-aaaaaaaaaaaa',
];
const AMOUNT = 25.00;
const TX_HASH = '0x' + 'a'.repeat(64);
const USER_TOKEN = 'ut_fake_token';

function makeRequest(body: object, cookie = 'sb-access=fake') {
    return new NextRequest('http://localhost/api/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body),
    });
}

// Re-cast for typed mock access
const mockTransferUSDC = circle.transferUSDC as jest.MockedFunction<typeof circle.transferUSDC>;
const mockCreateUserToken = circle.createUserToken as jest.MockedFunction<typeof circle.createUserToken>;
const mockGetUserBalance = circle.getUserBalance as jest.MockedFunction<typeof circle.getUserBalance>;
const mockGetWalletInfo = circle.getWalletInfo as jest.MockedFunction<typeof circle.getWalletInfo>;
const mockGetUser = dbUsers.getUser as jest.MockedFunction<typeof dbUsers.getUser>;
const mockMarkSplitSettled = dbExpenses.markSplitSettledById as jest.MockedFunction<typeof dbExpenses.markSplitSettledById>;

// ── Shared setup ─────────────────────────────────────────────────────────────

function setupHappyPath() {
    // Supabase session resolves to auth user
    (createClient as jest.Mock).mockReturnValue({
        auth: {
            getSession: jest.fn().mockResolvedValue({
                data: { session: { user: { id: AUTH_USER_ID } } },
            }),
        },
    });

    // DB: sender user has wallet
    mockGetUser.mockResolvedValue({
        data: { wallet_id: FROM_WALLET_ID, id: AUTH_USER_ID, email: 'a@b.com', wallet_address: '0xsender', display_name: null, created_at: '2025-01-01T00:00:00Z' },
        error: null,
    });

    // Circle: recipient wallet info
    mockGetWalletInfo.mockResolvedValue({ walletId: 'wlt-recipient', address: TO_ADDRESS });

    // Circle: fresh user token
    mockCreateUserToken.mockResolvedValue({ userToken: USER_TOKEN, encryptionKey: 'enc-key' });

    // Circle: transfer succeeds
    mockTransferUSDC.mockResolvedValue({ txHash: TX_HASH, transferId: 'txfr-123', status: 'pending' });

    // DB: mark splits settled succeeds
    mockMarkSplitSettled.mockResolvedValue({ data: { id: '', expenseId: '', userId: '', amount: 0, settled: true, settledAt: null, txHash: TX_HASH }, error: null });
}

beforeEach(() => {
    jest.clearAllMocks();
    // Reset env
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key';
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/settle', () => {

    // ── 1. Successful transfer ─────────────────────────────────────────────────

    describe('successful transfer', () => {
        it('returns 200 with txHash and marks all splits settled', async () => {
            setupHappyPath();

            const req = makeRequest({ toUserId: TO_USER_ID, amount: AMOUNT, splitIds: SPLIT_IDS });
            const res = await POST(req);
            const body = await res.json() as { success: boolean; txHash: string };

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(body.txHash).toBe(TX_HASH);

            // Circle transfer was called once with correct args
            expect(mockTransferUSDC).toHaveBeenCalledTimes(1);
            expect(mockTransferUSDC).toHaveBeenCalledWith(
                USER_TOKEN,
                FROM_WALLET_ID,
                TO_ADDRESS,
                AMOUNT,
                expect.stringMatching(/^[0-9a-f-]{36}$/)  // deterministic UUID
            );

            // All split IDs were marked settled
            expect(mockMarkSplitSettled).toHaveBeenCalledTimes(SPLIT_IDS.length);
            for (const id of SPLIT_IDS) {
                expect(mockMarkSplitSettled).toHaveBeenCalledWith(id, TX_HASH);
            }
        });
    });

    // ── 2. Insufficient balance ────────────────────────────────────────────────

    describe('insufficient balance', () => {
        it('returns 402 with Turkish error message including current balance', async () => {
            setupHappyPath();

            // Circle rejects with status 422
            const circleErr = Object.assign(new Error('insufficient funds'), {
                response: { status: 422, data: { message: 'Insufficient funds' } },
            });
            mockTransferUSDC.mockRejectedValue(circleErr);

            // Balance lookup returns 5.00 USDC
            mockGetUserBalance.mockResolvedValue(5.00);

            const req = makeRequest({ toUserId: TO_USER_ID, amount: AMOUNT, splitIds: SPLIT_IDS });
            const res = await POST(req);
            const body = await res.json() as { success: boolean; error: string };

            expect(res.status).toBe(402);
            expect(body.success).toBe(false);
            expect(body.error).toContain('Yetersiz USDC');
            expect(body.error).toContain('5.00');

            // DB should NOT have been touched
            expect(mockMarkSplitSettled).not.toHaveBeenCalled();
        });
    });

    // ── 3. Security: another user's wallet ────────────────────────────────────

    describe('security: wallet ownership', () => {
        it('returns 404 if sender user not found in DB (implicitly rejects spoofed walletId)', async () => {
            // Session authenticates as AUTH_USER_ID
            (createClient as jest.Mock).mockReturnValue({
                auth: {
                    getSession: jest.fn().mockResolvedValue({
                        data: { session: { user: { id: AUTH_USER_ID } } },
                    }),
                },
            });

            // DB returns no user record (user hasn't completed setup)
            mockGetUser.mockResolvedValue({ data: null, error: 'User not found' });

            const req = makeRequest({ toUserId: TO_USER_ID, amount: AMOUNT, splitIds: SPLIT_IDS });
            const res = await POST(req);
            const body = await res.json() as { success: boolean; error: string };

            expect(res.status).toBe(404);
            expect(body.success).toBe(false);
            expect(mockTransferUSDC).not.toHaveBeenCalled();
        });

        it('returns 401 if request is unauthenticated', async () => {
            (createClient as jest.Mock).mockReturnValue({
                auth: {
                    getSession: jest.fn().mockResolvedValue({
                        data: { session: null },
                    }),
                },
            });

            const req = makeRequest({ toUserId: TO_USER_ID, amount: AMOUNT, splitIds: SPLIT_IDS });
            const res = await POST(req);
            const body = await res.json() as { success: boolean; error: string };

            expect(res.status).toBe(401);
            expect(body.success).toBe(false);
            expect(mockTransferUSDC).not.toHaveBeenCalled();
        });
    });

    // ── 4. Idempotency ─────────────────────────────────────────────────────────

    describe('idempotency', () => {
        it('treats Circle 409 as success and still marks splits settled', async () => {
            setupHappyPath();

            // Circle returns 409 (duplicate idempotency key)
            const circleErr = Object.assign(new Error('duplicate'), {
                response: { status: 409, data: { message: 'Duplicate idempotency key' } },
            });
            mockTransferUSDC.mockRejectedValue(circleErr);

            const req = makeRequest({ toUserId: TO_USER_ID, amount: AMOUNT, splitIds: SPLIT_IDS });
            const res = await POST(req);
            const body = await res.json() as { success: boolean; txHash: string | null };

            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            // txHash may be null since we didn't get it from Circle on a 409
            expect(body.txHash).toBeNull();

            // Splits still get marked settled (idempotent DB update is safe)
            expect(mockMarkSplitSettled).toHaveBeenCalledTimes(SPLIT_IDS.length);
        });

        it('already-settled splits are skipped gracefully (no error returned)', async () => {
            setupHappyPath();

            // DB: all splits already settled
            mockMarkSplitSettled.mockResolvedValue({ data: null, error: 'already settled' });

            const req = makeRequest({ toUserId: TO_USER_ID, amount: AMOUNT, splitIds: SPLIT_IDS });
            const res = await POST(req);
            const body = await res.json() as { success: boolean; txHash: string };

            // Still 200 — 'already settled' is treated as non-fatal
            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
        });
    });

    // ── 5. Validation ──────────────────────────────────────────────────────────

    describe('request validation', () => {
        it('returns 400 for missing splitIds', async () => {
            (createClient as jest.Mock).mockReturnValue({
                auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: AUTH_USER_ID } } } }) },
            });

            const req = makeRequest({ toUserId: TO_USER_ID, amount: AMOUNT }); // no splitIds
            const res = await POST(req);
            expect(res.status).toBe(400);
        });

        it('returns 400 for negative amount', async () => {
            (createClient as jest.Mock).mockReturnValue({
                auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: AUTH_USER_ID } } } }) },
            });

            const req = makeRequest({ toUserId: TO_USER_ID, amount: -5, splitIds: SPLIT_IDS });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });
    });
});
