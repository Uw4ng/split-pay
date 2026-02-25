/**
 * src/lib/circle.ts
 *
 * Circle Programmable Wallets — server-side singleton.
 *
 * IMPORTANT: This file MUST only be imported in Next.js API routes or
 * Server Actions. NEVER import on the client — it reads CIRCLE_API_KEY.
 *
 * Auth flow (User-Controlled Wallets):
 *   1. createUser(userId)            — register user in Circle
 *   2. createUserToken(userId)       — get short-lived token + encryptionKey
 *   3. createUserPinWithWallets(...)  — get challengeId → client completes PIN
 *   4. After PIN, walletId + address are available via getWallets()
 *
 * All amounts are USDC. USDC has 6 on-chain decimals but Circle's SDK
 * acceptsand returns human-readable decimal strings (e.g. "12.50").
 *
 * Docs: https://developers.circle.com/w3s/reference
 */

import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';

// ─────────────────────────────────────────────────────────────────────────────
// Environment helpers
// ─────────────────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing environment variable: ${key}`);
    return val;
}

/**
 * Returns the Circle API base URL based on CIRCLE_ENV.
 *  - "sandbox"    → https://api-sandbox.circle.com  (testnet faucet available)
 *  - anything else → https://api.circle.com         (production / mainnet)
 */
function getBaseUrl(): string {
    return process.env.CIRCLE_ENV === 'sandbox'
        ? 'https://api-sandbox.circle.com'
        : 'https://api.circle.com';
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton client
// ─────────────────────────────────────────────────────────────────────────────

type CircleClient = ReturnType<typeof initiateUserControlledWalletsClient>;
let _client: CircleClient | null = null;

/**
 * Returns the lazy-initialised Circle SDK client.
 * Singleton pattern avoids re-creating the client on every dev hot-reload.
 */
export function getCircleClient(): CircleClient {
    if (!_client) {
        _client = initiateUserControlledWalletsClient({
            apiKey: requireEnv('CIRCLE_API_KEY'),
            baseUrl: getBaseUrl(),
        });
    }
    return _client;
}

// ─────────────────────────────────────────────────────────────────────────────
// Return types (not re-exported from Circle SDK to keep our API surface clean)
// ─────────────────────────────────────────────────────────────────────────────

export interface WalletCreationChallenge {
    /** Circle internal user-auth token — short-lived (~60 min) */
    userToken: string;
    /** Passed to Circle JS SDK on the client to encrypt PIN */
    encryptionKey: string;
    /** Passed to Circle JS SDK on the client to complete PIN setup */
    challengeId: string;
}

export interface WalletInfo {
    walletId: string;
    address: string; // 0x... EVM address on Arc
}

export interface TransferResult {
    /** Circle internal transfer/transaction ID */
    transferId: string;
    /** Arc transaction hash — only available after CONFIRMED */
    txHash: string | null;
    status: 'pending' | 'confirmed' | 'failed';
}

// ─────────────────────────────────────────────────────────────────────────────
// User & wallet management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers a new user in Circle's system.
 * Idempotent — safe to call multiple times for the same userId.
 * (Circle returns 409 if user already exists; we swallow that.)
 */
export async function createCircleUser(userId: string): Promise<void> {
    const client = getCircleClient();
    try {
        await client.createUser({ userId });
    } catch (err: unknown) {
        // 409 = user already exists — treat as success
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status !== 409) throw err;
    }
}

/**
 * Creates a short-lived user token and encryption key for the given userId.
 * These are fed into the Circle JS SDK on the client to complete PIN setup.
 */
export async function createUserToken(
    userId: string
): Promise<{ userToken: string; encryptionKey: string }> {
    const client = getCircleClient();
    const res = await client.createUserToken({ userId });
    const { userToken, encryptionKey } = res.data ?? {};
    if (!userToken || !encryptionKey) {
        throw new Error('Circle createUserToken returned empty data.');
    }
    return { userToken, encryptionKey };
}

/**
 * Step 2 of wallet creation: creates a challenge for PIN setup + wallet.
 * The client completes the challenge with the Circle JS SDK (PIN modal).
 * After completion, call getWallets(userId) to get the wallet ID + address.
 *
 * @param userToken - from createUserToken()
 * @param idempotencyKey - caller-supplied UUID to prevent duplicate wallets
 */
export async function createUserWallet(
    userToken: string,
    idempotencyKey: string
): Promise<WalletCreationChallenge> {
    const client = getCircleClient();

    const res = await client.createUserPinWithWallets({
        userToken,
        blockchains: ['AVAX-FUJI'], // Closest EVM-compatible testnet; update to Arc when available
        idempotencyKey,
    });

    const { challengeId } = res.data ?? {};
    if (!challengeId) {
        throw new Error('Circle createUserPinWithWallets returned no challengeId.');
    }

    return {
        userToken, // pass back so caller can store for the client-side SDK
        encryptionKey: '', // encryptionKey comes from createUserToken step, not here
        challengeId,
    };
}

/**
 * Full wallet setup pipeline: register user → get token → get challenge.
 * Returns everything the client needs to render the Circle PIN modal.
 *
 * @param userId - Your internal user ID (e.g. Supabase user.id)
 * @param idempotencyKey - UUID to prevent duplicate wallet creation
 */
export async function setupUserWallet(
    userId: string,
    idempotencyKey: string
): Promise<WalletCreationChallenge> {
    // 1. Ensure user exists in Circle
    await createCircleUser(userId);

    // 2. Get user token + encryption key
    const { userToken, encryptionKey } = await createUserToken(userId);

    // 3. Create PIN challenge + wallet
    const res = await getCircleClient().createUserPinWithWallets({
        userToken,
        blockchains: ['AVAX-FUJI'],
        idempotencyKey,
    });

    const challengeId = res.data?.challengeId;
    if (!challengeId) {
        throw new Error('Wallet creation challenge not returned from Circle.');
    }

    return { userToken, encryptionKey, challengeId };
}

/**
 * Fetches all wallets for a given userId.
 * Returns the first EOA wallet's ID and address (SplitPay only needs one).
 */
export async function getWalletInfo(userId: string): Promise<WalletInfo | null> {
    const client = getCircleClient();

    // Need a fresh token to query wallets
    const { userToken } = await createUserToken(userId);

    const res = await client.listWallets({ userToken });
    const wallets = res.data?.wallets ?? [];

    const wallet = wallets.find((w) => w.state === 'LIVE') ?? wallets[0];
    if (!wallet) return null;

    return {
        walletId: wallet.id,
        address: wallet.address ?? '',
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Balance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the USDC balance (as a human-readable number) for the given wallet.
 * Searches for any token with symbol "USDC" or "USDC-TESTNET".
 *
 * @param userToken Short-lived Circle user token — required by the SDK
 */
export async function getUserBalance(
    walletId: string,
    userToken: string
): Promise<number> {
    const client = getCircleClient();

    const res = await client.getWalletTokenBalance({ walletId, userToken });
    const tokenBalances = res.data?.tokenBalances ?? [];

    const usdcEntry = tokenBalances.find(
        (b) =>
            b.token?.symbol === 'USDC' ||
            b.token?.symbol === 'USDC-TESTNET' ||
            b.token?.name?.toLowerCase().includes('usd coin')
    );

    if (!usdcEntry?.amount) return 0;
    return parseFloat(usdcEntry.amount);
}

// ─────────────────────────────────────────────────────────────────────────────
// Transfers (USDC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initiates a native USDC transfer from one wallet to an address.
 *
 * Circle's `createTransaction` for a token transfer requires:
 *  - amounts[]          → ["12.50"] (human-readable decimal string)
 *  - destinationAddress → recipient's 0x address
 *  - tokenId OR tokenAddress + blockchain
 *  - userToken          → sender must authenticate
 *  - idempotencyKey     → prevents duplicate sends
 *
 * @param userToken      Short-lived token for the sending user
 * @param fromWalletId   Circle wallet ID of the sender
 * @param toAddress      Recipient EVM address (0x...)
 * @param amount         USDC amount as a number (e.g. 12.5 → "12.50")
 * @param idempotencyKey Caller-supplied UUID — REQUIRED to prevent double-sends
 */
export async function transferUSDC(
    userToken: string,
    fromWalletId: string,
    toAddress: string,
    amount: number,
    idempotencyKey: string
): Promise<TransferResult> {
    const client = getCircleClient();

    const usdcContractAddress = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS;
    if (!usdcContractAddress) {
        throw new Error('NEXT_PUBLIC_USDC_CONTRACT_ADDRESS is not set.');
    }

    const res = await client.createTransaction({
        userToken,
        walletId: fromWalletId,
        amounts: [amount.toFixed(6)], // 6 decimal string, e.g. "12.500000"
        destinationAddress: toAddress,
        tokenAddress: usdcContractAddress,
        // blockchain will be inferred from the wallet; set explicitly if needed:
        // blockchain: 'AVAX-FUJI',
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey,
    });

    const challengeId = res.data?.challengeId;
    if (!challengeId) {
        throw new Error('Circle createTransaction returned no challenge ID.');
    }

    // The actual txHash is populated once user completes PIN challenge & tx confirms.
    return { transferId: challengeId, txHash: null, status: 'pending' };
}

/**
 * Polls Circle for the current state of a transfer.
 * Use this after initiating a transfer to check for CONFIRMED / FAILED.
 */
export async function getTransferStatus(
    userId: string,
    transferId: string
): Promise<TransferResult> {
    const client = getCircleClient();
    const { userToken } = await createUserToken(userId);

    const res = await client.getTransaction({ id: transferId, userToken });
    const tx = res.data?.transaction;

    if (!tx) {
        throw new Error(`Transaction ${transferId} not found.`);
    }

    const STATE_MAP: Record<string, TransferResult['status']> = {
        INITIATED: 'pending',
        PENDING_RISK_SCREENING: 'pending',
        QUEUED: 'pending',
        SENT: 'pending',
        CONFIRMED: 'confirmed',
        COMPLETE: 'confirmed',
        FAILED: 'failed',
        CANCELLED: 'failed',
        DENIED: 'failed',
    };

    return {
        transferId,
        txHash: tx.txHash ?? null,
        status: STATE_MAP[tx.state ?? ''] ?? 'pending',
    };
}
