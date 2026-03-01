'use client';

/**
 * components/settlement/SettlementSummary.tsx
 *
 * Shows computed settlements (who owes whom) and a
 * "Settle Up" button to trigger the USDC transfer flow.
 */

import { useState } from 'react';
import type { Settlement } from '@/types';
import { SettleConfirmModal } from './SettleConfirmModal';

interface SettlementSummaryProps {
    settlements: Settlement[];
    groupId: string;
}

export function SettlementSummary({ settlements, groupId }: SettlementSummaryProps) {
    const [selected, setSelected] = useState<Settlement | null>(null);

    return (
        <>
            <div className="space-y-2">
                {settlements.map((settlement, i) => (
                    <div
                        key={`${settlement.fromUserId}-${settlement.toUserId}-${i}`}
                        className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                    >
                        <p className="text-sm text-foreground">
                            {/* Display abbreviated IDs until we can look up display names */}
                            <span className="font-semibold">
                                {settlement.fromUserId.slice(0, 8)}
                            </span>
                            {' owes '}
                            <span className="font-semibold">
                                {settlement.toUserId.slice(0, 8)}
                            </span>
                        </p>

                        <div className="flex items-center gap-3">
                            <span className="font-bold text-foreground">
                                ${settlement.amount.toFixed(2)}
                            </span>
                            <button
                                onClick={() => setSelected(settlement)}
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                            >
                                Settle Up
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {selected && (
                <SettleConfirmModal
                    settlement={selected}
                    groupId={groupId}
                    onClose={() => setSelected(null)}
                />
            )}
        </>
    );
}
