/**
 * lib/debt.ts
 *
 * Debt minimisation algorithm for SplitPay.
 *
 * Given a list of expenses and the group members, computes the minimal set of
 * USDC transfers needed to settle all debts ("Splitwise algorithm").
 *
 * All amounts are in USDC. Floating-point operations are rounded to 2 decimal
 * places to avoid cent-level drift (USDC has 6 on-chain decimals, but we
 * present with 2 for UX).
 *
 * Pure functions — no side effects, safe to call anywhere including tests.
 */

import type { Expense, Settlement, User } from '@/types';

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Round to 2 decimal places (USDC display precision).
 */
function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Compute net balance for each user across all (unsettled) expenses.
 * Positive balance → owed money (creditor).
 * Negative balance → owes money (debtor).
 *
 * @returns Map from userId to net USDC balance
 */
export function computeNetBalances(
    expenses: Expense[]
): Map<string, number> {
    const balances = new Map<string, number>();

    for (const expense of expenses) {
        // The payer fronted `amount` for the whole group.
        const payerId = expense.paidBy.id;

        for (const split of expense.splits) {
            // Skip already-settled splits
            if (split.settled) continue;

            // The person who split owes `split.amount` to the payer.
            // Payer's balance increases (they are owed).
            // Splitter's balance decreases (they owe).

            if (split.userId === payerId) {
                // Payer's own share — net zero for the payer:
                // they paid `amount` total, their share is `split.amount`.
                // Effectively payer is creditor for (amount - their split).
                // This is automatically handled by summing across all splits.
                continue;
            }

            // Debtor: owes split.amount to payer
            const debtorBalance = balances.get(split.userId) ?? 0;
            balances.set(split.userId, round2(debtorBalance - split.amount));

            // Creditor: is owed split.amount by debtor
            const creditorBalance = balances.get(payerId) ?? 0;
            balances.set(payerId, round2(creditorBalance + split.amount));
        }
    }

    return balances;
}

/**
 * Debt minimisation using the "greedy creditor-debtor matching" approach.
 *
 * Steps:
 * 1. Compute net balances.
 * 2. Split into debtors (negative) and creditors (positive).
 * 3. Greedily match largest debtor to largest creditor, creating
 *    a settlement for min(|debtor|, |creditor|).
 * 4. Repeat until all balances are zero.
 *
 * This produces at most N-1 transfers for N participants (optimal).
 *
 * @param expenses   All unsettled expenses in the group
 * @param members    All group members (needed to resolve User objects)
 * @returns          Minimal list of USDC settlements
 */
export function computeSettlements(
    expenses: Expense[],
    members: User[]
): Settlement[] {
    const balanceMap = computeNetBalances(expenses);

    // Build user lookup
    const userById = new Map<string, User>(members.map((m) => [m.id, m]));

    // Separate into debtors (owe money) and creditors (are owed money)
    const debtors: Array<{ userId: string; amount: number }> = [];
    const creditors: Array<{ userId: string; amount: number }> = [];

    for (const [userId, balance] of balanceMap.entries()) {
        if (balance < -0.01) {
            debtors.push({ userId, amount: Math.abs(balance) });
        } else if (balance > 0.01) {
            creditors.push({ userId, amount: balance });
        }
    }

    // Sort largest first for optimal greedy matching
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements: Settlement[] = [];
    let d = 0;
    let c = 0;

    while (d < debtors.length && c < creditors.length) {
        const debtor = debtors[d];
        const creditor = creditors[c];

        const amount = round2(Math.min(debtor.amount, creditor.amount));

        const fromUser = userById.get(debtor.userId);
        const toUser = userById.get(creditor.userId);

        if (!fromUser || !toUser) {
            throw new Error(
                `User not found in members list: ${!fromUser ? debtor.userId : creditor.userId}`
            );
        }

        settlements.push({ from: fromUser, to: toUser, amount });

        debtor.amount = round2(debtor.amount - amount);
        creditor.amount = round2(creditor.amount - amount);

        if (debtor.amount < 0.01) d++;
        if (creditor.amount < 0.01) c++;
    }

    return settlements;
}

/**
 * Convenience: given an expense and the number of members to split with,
 * returns the equal USDC share per person.
 */
export function equalSplit(totalAmount: number, memberCount: number): number {
    if (memberCount <= 0) throw new Error('memberCount must be greater than 0');
    return round2(totalAmount / memberCount);
}

/**
 * Validates that all splits in an expense sum to the total amount.
 * Allows ±$0.01 rounding tolerance.
 */
export function validateSplits(
    totalAmount: number,
    splitAmounts: number[]
): boolean {
    const sum = splitAmounts.reduce((acc, n) => acc + n, 0);
    return Math.abs(sum - totalAmount) <= 0.01;
}
