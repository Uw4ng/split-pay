/**
 * lib/circle.ts
 *
 * Circle Web3 Services SDK singleton.
 * IMPORTANT: This module is SERVER-SIDE ONLY.
 * Never import this on the client. API key is read from env at runtime.
 *
 * Uses @circle-fin/user-controlled-wallets SDK.
 * Docs: https://developers.circle.com/w3s/docs/programmable-wallets-sdk
 */

import { initiateUserControlledWalletsClient } from '@circle-fin/user-controlled-wallets';
import type {
    CreateWalletResponse,
    TransferRequest,
    TransferResponse,
    BalanceResponse,
} from '@/types';

// ── Singleton client ────────────────────────────────────────────────────────

function getCircleClient() {
    const apiKey = process.env.CIRCLE_API_KEY;
    if (!apiKey) {
        throw new Error('CIRCLE_API_KEY environment variable is not set.');
    }

    return initiateUserControlledWalletsClient({ apiKey });
}

// Lazy singleton (avoids re-init on every request in dev hot-reload)
let _client: ReturnType<typeof getCircleClient> | null = null;

export function getClient() {
    if (!_client) {
        _client = getCircleClient();
    }
    return _client;
}

// ── Wallet helpers ──────────────────────────────────────────────────────────

/**
 * Creates a new user-controlled wallet for a SplitPay user.
 * Returns the wallet ID, address, and the challenge data needed for the
 * Circle SDK PIN setup flow on the client.
 */
export async function createUserWallet(
    userId: string
): Promise<CreateWalletResponse> {
    const client = getClient();

    // Step 1: Create a user token + encryption key
    const tokenRes = await client.createUserToken({ userId });
    const { userToken, encryptionKey } = tokenRes.data ?? {};
    if (!userToken || !encryptionKey) {
        throw new Error('Failed to create Circle user token.');
    }

    // Step 2: Create the wallet set + wallet (triggers PIN setup challenge)
    const walletRes = await client.createUserTokenAndWallets({
        userId,
        blockchains: ['ARB-SEPOLIA'], // TODO: update to Arc chain ID when available
    });

    const challengeId = walletRes.data?.challengeId;
    if (!challengeId) {
        throw new Error('Failed to initiate wallet creation challenge.');
    }

    // Note: walletId and walletAddress are obtained AFTER the user completes the
    // PIN challenge client-side via the Circle SDK. The API route will need to
    // poll or webhook for completion. This returns the challenge data for now.
    return {
        walletId: '', // populated after PIN challenge
        walletAddress: '', // populated after PIN challenge
        userToken,
        encryptionKey,
        challengeId,
    };
}

/**
 * Fetches the USDC balance for a given Circle wallet ID.
 */
export async function getWalletBalance(
    walletId: string
): Promise<BalanceResponse> {
    const client = getClient();

    const res = await client.getWalletTokenBalance({ id: walletId });
    const tokenBalances = res.data?.tokenBalances ?? [];

    // USDC is the only token we care about
    const usdc = tokenBalances.find(
        (b) => b.token?.symbol === 'USDC' || b.token?.symbol === 'USDC-TESTNET'
    );

    return {
        walletId,
        usdcBalance: usdc?.amount ?? '0.00',
    };
}

/**
 * Initiates a USDC transfer between two wallets on Arc.
 * Requires the sender's userToken (obtained via server-side Circle auth).
 */
export async function initiateTransfer(
    userToken: string,
    req: TransferRequest
): Promise<TransferResponse> {
    const client = getClient();

    const res = await client.createTransaction({
        userToken,
        walletId: req.fromWalletId,
        contractAddress: process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS ?? '',
        abiFunctionSignature: 'transfer(address,uint256)',
        abiParameters: [
            req.toAddress,
            // USDC has 6 decimals — convert human amount to raw uint256
            String(Math.round(parseFloat(req.amount) * 1_000_000)),
        ],
        feeLevel: 'MEDIUM',
    });

    const transferId = res.data?.id;
    if (!transferId) {
        throw new Error('Circle transfer initiation failed — no transfer ID returned.');
    }

    return {
        transferId,
        status: 'pending',
    };
}

/**
 * Polls Circle for the status of a previously initiated transfer.
 */
export async function getTransferStatus(
    transferId: string
): Promise<TransferResponse> {
    const client = getClient();

    const res = await client.getTransaction({ id: transferId });
    const tx = res.data?.transaction;

    if (!tx) {
        throw new Error(`Transfer ${transferId} not found.`);
    }

    const statusMap: Record<string, TransferResponse['status']> = {
        INITIATED: 'pending',
        PENDING_RISK_SCREENING: 'pending',
        SENT: 'pending',
        CONFIRMED: 'confirmed',
        COMPLETE: 'confirmed',
        FAILED: 'failed',
        CANCELLED: 'failed',
    };

    return {
        transferId,
        status: statusMap[tx.state] ?? 'pending',
        txHash: tx.txHash ?? undefined,
    };
}
