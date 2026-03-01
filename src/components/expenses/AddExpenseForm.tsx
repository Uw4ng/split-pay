'use client';

/**
 * src/components/expenses/AddExpenseForm.tsx
 *
 * Inline form for adding a new expense to a group.
 * Supports equal split (default) and custom per-member amounts.
 */

import { useState, useEffect, type FormEvent } from 'react';
import { useExpenseStore } from '@/store/expenseStore';
import { equalSplit, validateSplits, round2 } from '@/lib/debt';
import type { Group, User, ExpenseCategory } from '@/types';

interface AddExpenseFormProps {
    group: Group;
    currentUserId: string;
    onSuccess: () => void;
    onCancel: () => void;
}

type SplitMode = 'equal' | 'custom';

const CATEGORIES: { value: ExpenseCategory; label: string; emoji: string }[] = [
    { value: 'food', label: 'Yemek', emoji: '🍽️' },
    { value: 'transport', label: 'Ulaşım', emoji: '🚗' },
    { value: 'accommodation', label: 'Konaklama', emoji: '🏠' },
    { value: 'entertainment', label: 'Eğlence', emoji: '🎬' },
    { value: 'utilities', label: 'Fatura', emoji: '⚡' },
    { value: 'other', label: 'Diğer', emoji: '📦' },
];

export function AddExpenseForm({ group, currentUserId, onSuccess, onCancel }: AddExpenseFormProps) {
    const { createExpense, isLoading } = useExpenseStore();

    // ── Form state ─────────────────────────────────────────────────────────────
    const [description, setDescription] = useState('');
    const [amountStr, setAmountStr] = useState('');
    const [paidById, setPaidById] = useState(currentUserId);
    const [category, setCategory] = useState<ExpenseCategory>('other');
    const [splitMode, setSplitMode] = useState<SplitMode>('equal');
    const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
    const [error, setError] = useState('');

    const memberIds = group.members.map((m) => m.id);
    const amount = parseFloat(amountStr) || 0;

    // Re-initialise custom splits when amount or members change
    useEffect(() => {
        if (splitMode === 'equal') return;
        const splits = equalSplit(amount, memberIds);
        const strSplits: Record<string, string> = {};
        for (const id of memberIds) strSplits[id] = (splits[id] ?? 0).toFixed(2);
        setCustomSplits(strSplits);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [splitMode, amountStr]);

    // ── Split logic ────────────────────────────────────────────────────────────

    function computeSplits(): Record<string, number> {
        if (splitMode === 'equal') {
            return equalSplit(amount, memberIds);
        }
        const result: Record<string, number> = {};
        for (const id of memberIds) {
            result[id] = round2(parseFloat(customSplits[id] || '0') || 0);
        }
        return result;
    }

    function splitTotal(): number {
        if (splitMode === 'equal') return amount;
        return round2(
            Object.values(customSplits).reduce((s, v) => s + (parseFloat(v) || 0), 0)
        );
    }

    function splitRemaining(): number {
        return round2(amount - splitTotal());
    }

    function memberName(user: User) {
        return user.displayName ?? user.email.split('@')[0];
    }

    // ── Submit ─────────────────────────────────────────────────────────────────

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError('');

        if (!description.trim()) { setError('Açıklama zorunlu'); return; }
        if (amount <= 0) { setError('Tutar 0\'dan büyük olmalı'); return; }

        const splits = computeSplits();
        const validationError = validateSplits(amount, splits);
        if (validationError) { setError(validationError); return; }

        try {
            await createExpense({
                groupId: group.id,
                paidByUserId: paidById,
                amount,
                description: description.trim(),
                category,
                splits,
            });
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Harcama eklenemedi');
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="rounded-2xl border border-white/10 bg-gray-900 p-5">
            <h3 className="text-base font-semibold text-white mb-5">Harcama Ekle</h3>

            <form onSubmit={handleSubmit} className="space-y-4">

                {/* Description */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5" htmlFor="exp-desc">
                        Açıklama *
                    </label>
                    <input
                        id="exp-desc"
                        type="text"
                        autoFocus
                        required
                        placeholder="ör. Akşam yemeği"
                        maxLength={200}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm
                       text-white placeholder:text-gray-600 focus:outline-none
                       focus:ring-2 focus:ring-indigo-500/60 transition"
                    />
                </div>

                {/* Amount + Category (side by side on mobile) */}
                <div className="flex gap-3">
                    {/* Amount */}
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-400 mb-1.5" htmlFor="exp-amount">
                            Tutar (USDC) *
                        </label>
                        <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                            <input
                                id="exp-amount"
                                type="number"
                                required
                                min="0.01"
                                step="0.01"
                                placeholder="0.00"
                                value={amountStr}
                                onChange={(e) => setAmountStr(e.target.value)}
                                className="w-full rounded-xl bg-white/5 border border-white/10 pl-7 pr-4 py-3
                           text-sm text-white placeholder:text-gray-600
                           focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition"
                            />
                        </div>
                    </div>

                    {/* Category */}
                    <div className="w-36">
                        <label className="block text-xs font-medium text-gray-400 mb-1.5" htmlFor="exp-cat">
                            Kategori
                        </label>
                        <select
                            id="exp-cat"
                            value={category}
                            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm
                         text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                         transition appearance-none"
                        >
                            {CATEGORIES.map(({ value, label, emoji }) => (
                                <option key={value} value={value}>{emoji} {label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Payer */}
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5" htmlFor="exp-payer">
                        Ödeyen *
                    </label>
                    <select
                        id="exp-payer"
                        value={paidById}
                        onChange={(e) => setPaidById(e.target.value)}
                        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm
                       text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                       transition appearance-none"
                    >
                        {group.members.map((m) => (
                            <option key={m.id} value={m.id}>
                                {memberName(m)}{m.id === currentUserId ? ' (Sen)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Split mode toggle */}
                <div>
                    <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-medium text-gray-400">Bölüşüm</span>
                        <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs">
                            <button
                                type="button"
                                onClick={() => setSplitMode('equal')}
                                className={`px-3 py-1.5 font-medium transition-colors ${splitMode === 'equal'
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-400 hover:bg-white/5'
                                    }`}
                            >
                                Eşit
                            </button>
                            <button
                                type="button"
                                onClick={() => setSplitMode('custom')}
                                className={`px-3 py-1.5 font-medium transition-colors ${splitMode === 'custom'
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-400 hover:bg-white/5'
                                    }`}
                            >
                                Özel
                            </button>
                        </div>
                    </div>

                    {splitMode === 'equal' ? (
                        /* Equal preview */
                        <div className="rounded-xl bg-white/3 border border-white/5 px-4 py-3 space-y-1.5">
                            {group.members.map((m) => {
                                const share = amount > 0 ? round2(amount / group.members.length) : 0;
                                return (
                                    <div key={m.id} className="flex justify-between text-xs">
                                        <span className={m.id === currentUserId ? 'text-indigo-300' : 'text-gray-400'}>
                                            {memberName(m)}
                                        </span>
                                        <span className="text-white font-medium">${share.toFixed(2)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        /* Custom split inputs */
                        <div className="rounded-xl bg-white/3 border border-white/5 px-4 py-3 space-y-2.5">
                            {group.members.map((m) => (
                                <div key={m.id} className="flex items-center gap-3">
                                    <span className={`flex-1 text-xs ${m.id === currentUserId ? 'text-indigo-300' : 'text-gray-400'}`}>
                                        {memberName(m)}
                                    </span>
                                    <div className="relative w-28">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={customSplits[m.id] ?? '0.00'}
                                            onChange={(e) =>
                                                setCustomSplits((prev) => ({ ...prev, [m.id]: e.target.value }))
                                            }
                                            className="w-full rounded-lg bg-white/5 border border-white/10 pl-6 pr-2 py-1.5
                                 text-xs text-white text-right focus:outline-none
                                 focus:ring-1 focus:ring-indigo-500/60 transition"
                                        />
                                    </div>
                                </div>
                            ))}
                            {/* Remaining */}
                            <div className={`flex justify-between text-xs pt-1 border-t border-white/5 ${Math.abs(splitRemaining()) < 0.01 ? 'text-green-500' : 'text-red-400'
                                }`}>
                                <span>Kalan</span>
                                <span>${splitRemaining().toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <p className="text-sm text-red-400 bg-red-900/20 border border-red-500/20
                         rounded-lg px-3 py-2">
                        {error}
                    </p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 rounded-xl border border-white/10 px-4 py-3
                       text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors"
                    >
                        İptal
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading || !description.trim() || amount <= 0}
                        className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
                       px-4 py-3 text-sm font-semibold text-white transition-colors
                       flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <span className="h-4 w-4 rounded-full border-2 border-white/30
                                 border-t-white animate-spin" />
                                Kaydediliyor…
                            </>
                        ) : (
                            'Harcama Ekle'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
