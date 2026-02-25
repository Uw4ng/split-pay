// ─────────────────────────────────────────────
// SplitPay — Core TypeScript Types
// ─────────────────────────────────────────────

// ── User ──────────────────────────────────────
/**
 * A registered SplitPay user.
 * walletId  → Circle programmable wallet ID (internal)
 * walletAddress → EVM address on Arc (for USDC transfers)
 */
export interface User {
  id: string;
  email: string;
  walletId: string;        // Circle wallet ID (UUID)
  walletAddress: string;   // 0x... EVM address on Arc
  displayName?: string;    // Optional friendly name
  createdAt: string;       // ISO 8601
}

// ── Group ─────────────────────────────────────
/**
 * A shared-expense group (e.g. "Barcelona Trip", "Flat Share").
 */
export interface Group {
  id: string;
  name: string;
  description?: string;
  members: User[];
  createdBy: string;       // User.id of creator
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}

// ── Split ─────────────────────────────────────
/**
 * Represents one member's share of an expense.
 * amount is denominated in USDC (6 decimal places, stored as number here).
 */
export interface Split {
  userId: string;           // User.id
  amount: number;           // USDC amount this user owes for this expense
  settled: boolean;         // true once the on-chain transfer is confirmed
  txHash?: string;          // Arc transaction hash once settled
}

// ── Expense ───────────────────────────────────
/**
 * A single shared expense within a group.
 * amount is the total USDC paid by paidBy.
 * splits must sum to amount.
 */
export interface Expense {
  id: string;
  groupId: string;
  paidBy: User;             // Who fronted the money
  amount: number;           // Total USDC amount
  description: string;      // e.g. "Dinner at Nobu"
  splits: Split[];          // One Split per group member (including payer)
  category?: ExpenseCategory;
  createdAt: string;        // ISO 8601
}

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'entertainment'
  | 'utilities'
  | 'other';

// ── Settlement ────────────────────────────────
/**
 * A computed debt record: `from` owes `amount` USDC to `to`.
 * Produced by the debt minimisation algorithm in lib/debt.ts.
 * Not stored directly — recomputed from expenses on demand.
 */
export interface Settlement {
  from: User;
  to: User;
  amount: number;           // USDC amount to transfer
}

// ── SettlementTransaction ─────────────────────
/**
 * A recorded on-chain settlement after the USDC transfer is initiated.
 */
export interface SettlementTransaction {
  id: string;
  groupId: string;
  from: User;
  to: User;
  amount: number;
  circleTransferId: string; // Circle transfer job ID
  txHash?: string;          // Arc transaction hash
  status: TransactionStatus;
  createdAt: string;
}

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

// ── Circle API types ──────────────────────────

export interface CircleWallet {
  id: string;               // Circle wallet UUID
  state: 'LIVE' | 'FROZEN';
  walletSetId: string;
  custodyType: 'ENDUSER';
  userId: string;
  address: string;          // EVM address
  blockchain: string;       // e.g. "ARB-SEPOLIA" → will be "ARC-TESTNET"
  accountType: 'EOA';
  createDate: string;
  updateDate: string;
}

export interface CircleBalance {
  amount: string;           // string to avoid float precision issues
  currency: 'USD';          // Circle represents USDC balance as USD
  updateDate: string;
}

export interface CircleTransfer {
  id: string;
  state: 'PENDING' | 'CONFIRMED' | 'FAILED';
  txHash: string;
  createDate: string;
}

// ── API Request / Response shapes ─────────────

export interface CreateWalletResponse {
  walletId: string;
  walletAddress: string;
  userToken: string;        // Short-lived token for Circle SDK PIN flow
  encryptionKey: string;
  challengeId: string;
}

export interface TransferRequest {
  fromWalletId: string;
  toAddress: string;
  amount: string;           // USDC amount as string (e.g. "12.50")
}

export interface TransferResponse {
  transferId: string;
  status: TransactionStatus;
  txHash?: string;
}

export interface BalanceResponse {
  walletId: string;
  usdcBalance: string;      // Human-readable USDC amount (e.g. "42.00")
}

// ── Supabase DB row types (snake_case mirrors DB schema) ──

export interface DbUser {
  id: string;
  email: string;
  wallet_id: string;
  wallet_address: string;
  display_name: string | null;
  created_at: string;
}

export interface DbGroup {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DbGroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface DbExpense {
  id: string;
  group_id: string;
  paid_by: string;          // user_id
  amount: number;
  description: string;
  category: ExpenseCategory | null;
  created_at: string;
}

export interface DbSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
  settled: boolean;
  tx_hash: string | null;
}

export interface DbSettlement {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  circle_transfer_id: string;
  tx_hash: string | null;
  status: TransactionStatus;
  created_at: string;
}

// ── Store slices (for Zustand) ─────────────────

export interface GroupState {
  groups: Group[];
  activeGroupId: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface ExpenseState {
  expenses: Record<string, Expense[]>; // keyed by groupId
  isLoading: boolean;
  error: string | null;
}
