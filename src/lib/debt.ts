/**
 * src/lib/debt.ts
 *
 * Debt Simplification — pure functions with no side effects.
 *
 * Problem: given a list of group expenses (each with a payer and per-member
 * splits), compute the minimum number of USDC transfers needed to settle
 * everyone's balance back to zero.
 *
 * Algorithm (Greedy Two-Pointer):
 *   1. computeNetBalances  — credit payers, debit split members.
 *   2. simplifyDebts       — greedily pair the most-indebted person with the
 *                            most-owed person until all balances are cleared.
 *
 * Precision rules:
 *   - All amounts are rounded to 2 decimal places (round-half-up).
 *   - Amounts < 0.01 are treated as zero (floating-point residue).
 *
 * This file has no imports from the rest of the codebase — it only relies
 * on the local type definitions below, making it trivial to unit-test.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal expense split shape needed by the algorithm */
export interface DebtSplit {
    userId: string;
    amount: number; // the share this person owes
    settled: boolean;
}

/** Minimal expense shape needed by the algorithm */
export interface DebtExpense {
    paidByUserId: string; // who footed the bill
    amount: number;       // total amount paid
    splits: DebtSplit[];  // how it is divided
}

/** Net balance per user: positive = creditor (is owed money), negative = debtor (owes money) */
export type BalanceMap = Record<string, number>;

/** A single transfer that settles debt: `fromUserId` pays `toUserId` exactly `amount` */
export interface Settlement {
    fromUserId: string;
    toUserId: string;
    amount: number; // always > 0, rounded to 2 d.p.
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Amounts below this threshold are treated as zero (floating-point residue) */
const EPSILON = 0.005; // rounds to 0.01

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Round-half-up to 2 decimal places.
 * e.g. round2(1.005) → 1.01, round2(1.004) → 1.00
 *
 * We multiply by 100, add a tiny nudge for fp errors, round, then divide.
 */
export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Compute each user's net balance across all expenses.
 *
 * For every expense:
 *   - the payer is credited the full expense amount (+)
 *   - each split member is debited their share (-)
 *   - already-settled splits are still included in the net balance
 *     (they represent money that has already moved on-chain)
 *
 * Only unsettled splits feed into outstanding debt — pass `includeSettled`
 * as false (default) to compute what is *still owed*, or true to compute
 * the canonical historical balance.
 *
 * @param expenses        List of expenses to process
 * @param includeSettled  If true, include already-settled splits in the debit
 *                        calculation. Default: false (only count outstanding debt).
 */
export function calculateNetBalances(
    expenses: DebtExpense[],
    includeSettled = false
): BalanceMap {
    const balances: BalanceMap = {};

    const credit = (userId: string, amount: number) => {
        balances[userId] = round2((balances[userId] ?? 0) + amount);
    };
    const debit = (userId: string, amount: number) => {
        balances[userId] = round2((balances[userId] ?? 0) - amount);
    };

    for (const expense of expenses) {
        // Ensure every userId referenced appears in the map
        balances[expense.paidByUserId] = balances[expense.paidByUserId] ?? 0;

        // Tally unsettled splits (or all splits if requested)
        let debitedTotal = 0;
        for (const split of expense.splits) {
            balances[split.userId] = balances[split.userId] ?? 0;

            if (!includeSettled && split.settled) {
                // This split is settled — the payer already received this money on-chain.
                // Exclude both the credit and the debit so it doesn't skew current balances.
                continue;
            }

            debit(split.userId, split.amount);
            debitedTotal = round2(debitedTotal + split.amount);
        }

        // Credit the payer only for the portion not yet settled
        credit(expense.paidByUserId, debitedTotal);
    }

    return balances;
}

/**
 * Compute the minimum set of transfers to bring every balance to zero.
 *
 * Uses a greedy two-heap approach (implemented via sorted arrays):
 *   - Sort creditors (positive balances) descending.
 *   - Sort debtors  (negative balances) ascending (most negative first).
 *   - Pair the largest debtor with the largest creditor.
 *   - Transfer min(|debtor|, creditor).  Update both; repeat.
 *
 * Time complexity: O(n² log n) in the worst case — acceptable for group sizes.
 *
 * @param balances  BalanceMap from calculateNetBalances
 * @returns         Ordered list of settlements (each amount > 0, rounded to 2 d.p.)
 */
export function simplifyDebts(balances: BalanceMap): Settlement[] {
    const settlements: Settlement[] = [];

    // Working copy — avoid mutating the input
    const working: BalanceMap = {};
    for (const [id, bal] of Object.entries(balances)) {
        const rounded = round2(bal);
        if (Math.abs(rounded) >= EPSILON) {
            working[id] = rounded;
        }
    }

    while (true) {
        // Split into creditors (positive) and debtors (negative)
        const creditors = Object.entries(working)
            .filter(([, b]) => b > EPSILON)
            .sort(([, a], [, b]) => b - a);       // descending: largest creditor first

        const debtors = Object.entries(working)
            .filter(([, b]) => b < -EPSILON)
            .sort(([, a], [, b]) => a - b);       // ascending: most indebted first

        if (creditors.length === 0 || debtors.length === 0) break;

        const [creditorId, creditorBal] = creditors[0];
        const [debtorId, debtorBal] = debtors[0];

        // Transfer is bounded by whichever side runs out first
        const transfer = round2(Math.min(creditorBal, Math.abs(debtorBal)));

        if (transfer < EPSILON) break; // nothing meaningful left

        settlements.push({
            fromUserId: debtorId,
            toUserId: creditorId,
            amount: transfer,
        });

        // Update working balances
        working[creditorId] = round2(creditorBal - transfer);
        working[debtorId] = round2(debtorBal + transfer);

        // Prune zero balances
        if (Math.abs(working[creditorId]) < EPSILON) delete working[creditorId];
        if (Math.abs(working[debtorId]) < EPSILON) delete working[debtorId];
    }

    return settlements;
}

/**
 * High-level entry point: given group expenses and a member list,
 * returns the minimum set of settlements needed to clear all debts.
 *
 * Members that have zero outstanding balance are omitted from the output.
 *
 * @param expenses  All expenses for a group (with splits)
 * @param memberIds Optional allowlist of user IDs — ignored user IDs are filtered out.
 *                  Pass an empty array (or omit) to include everyone in the expenses.
 */
export function getGroupSettlements(
    expenses: DebtExpense[],
    memberIds: string[] = []
): Settlement[] {
    const balances = calculateNetBalances(expenses);

    // If a member allowlist is provided, zero out anyone not in the list
    // (shouldn't happen in practice, but guards against data inconsistency)
    if (memberIds.length > 0) {
        const allowed = new Set(memberIds);
        for (const id of Object.keys(balances)) {
            if (!allowed.has(id)) delete balances[id];
        }
    }

    return simplifyDebts(balances);
}

/**
 * Splits a total amount equally among N users, rounded to 2 d.p.
 * The last member absorbs the rounding remainder so the total is always exact.
 *
 * @param total   Total amount to split
 * @param userIds Array of user IDs to receive an equal share
 */
export function equalSplit(
    total: number,
    userIds: string[]
): Record<string, number> {
    if (userIds.length === 0) return {};
    const share = round2(Math.floor((total / userIds.length) * 100) / 100);
    const result: Record<string, number> = {};
    let distributed = 0;

    for (let i = 0; i < userIds.length - 1; i++) {
        result[userIds[i]] = share;
        distributed = round2(distributed + share);
    }

    // Last person absorbs the rounding remainder
    result[userIds[userIds.length - 1]] = round2(total - distributed);
    return result;
}

/**
 * Validates that a set of splits sums to the total amount.
 * Returns null if valid, or an error message if not.
 *
 * @param total   Expected total
 * @param splits  Map of userId → amount
 * @param tol     Tolerance for floating-point drift (default 0.01)
 */
export function validateSplits(
    total: number,
    splits: Record<string, number>,
    tol = 0.01
): string | null {
    const sum = round2(Object.values(splits).reduce((s, v) => s + v, 0));
    const diff = Math.abs(sum - round2(total));
    if (diff > tol) {
        return `Split amounts (${sum.toFixed(2)}) must sum to total (${round2(total).toFixed(2)})`;
    }
    return null;
}
