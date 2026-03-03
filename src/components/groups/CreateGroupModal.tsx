'use client';

/**
 * src/components/groups/CreateGroupModal.tsx
 *
 * Modal for creating a new group with optional initial members.
 */

import { useState, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { useGroupStore } from '@/store/groupStore';

interface CreateGroupModalProps {
    onClose: () => void;
    onCreated: () => void;
}

// ── Email chip ────────────────────────────────────────────────────────────────

function EmailChip({ email, onRemove }: { email: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600/20
                     border border-indigo-500/30 px-3 py-1 text-xs text-indigo-300">
            {email}
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${email}`}
                className="text-indigo-400 hover:text-white transition-colors leading-none"
            >
                ×
            </button>
        </span>
    );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function CreateGroupModal({ onClose, onCreated }: CreateGroupModalProps) {
    const { createGroup, isLoading } = useGroupStore();

    const [name, setName] = useState('');
    const [emailInput, setEmailInput] = useState('');
    const [emails, setEmails] = useState<string[]>([]);
    const [emailError, setEmailError] = useState('');
    const [submitError, setSubmitError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Email management ────────────────────────────────────────────────────────

    function addEmail() {
        const trimmed = emailInput.trim().toLowerCase();
        if (!trimmed) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setEmailError('Enter a valid email address');
            return;
        }
        if (emails.includes(trimmed)) {
            setEmailError('This email has already been added');
            return;
        }
        setEmails((prev) => [...prev, trimmed]);
        setEmailInput('');
        setEmailError('');
        inputRef.current?.focus();
    }

    function removeEmail(email: string) {
        setEmails((prev) => prev.filter((e) => e !== email));
    }

    function handleEmailKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') { e.preventDefault(); addEmail(); }
        if (e.key === 'Backspace' && !emailInput && emails.length) {
            removeEmail(emails[emails.length - 1]);
        }
    }

    // ── Submit ──────────────────────────────────────────────────────────────────

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName) return;
        setSubmitError('');

        try {
            const group = await createGroup(trimmedName);

            // Add members one by one (fire and forget — UI shows group immediately)
            if (emails.length > 0) {
                const { addMember } = useGroupStore.getState();
                await Promise.allSettled(emails.map((email) => addMember(group.id, email)));
            }

            onCreated();
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Failed to create group');
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-md rounded-2xl border border-white/10
                      bg-gray-900 shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5">
                    <h2 className="text-base font-semibold text-white">Create a New Group</h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-5">
                    {/* Group name */}
                    <div>
                        <label htmlFor="group-name" className="block text-xs font-medium text-gray-400 mb-1.5">
                            Group Name *
                        </label>
                        <input
                            id="group-name"
                            type="text"
                            autoFocus
                            required
                            placeholder="e.g. Summer Trip 2025"
                            maxLength={100}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="
                w-full rounded-xl bg-white/5 border border-white/10
                px-4 py-3 text-sm text-white placeholder:text-gray-600
                focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                transition
              "
                        />
                    </div>

                    {/* Member emails */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">
                            Add Members <span className="text-gray-600">(optional)</span>
                        </label>

                        {/* Chips */}
                        {emails.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {emails.map((email) => (
                                    <EmailChip key={email} email={email} onRemove={() => removeEmail(email)} />
                                ))}
                            </div>
                        )}

                        {/* Email input + add button */}
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                type="email"
                                placeholder="friend@example.com"
                                value={emailInput}
                                onChange={(e) => { setEmailInput(e.target.value); setEmailError(''); }}
                                onKeyDown={handleEmailKeyDown}
                                className="
                  flex-1 rounded-xl bg-white/5 border border-white/10
                  px-4 py-3 text-sm text-white placeholder:text-gray-600
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                  transition
                "
                            />
                            <button
                                type="button"
                                onClick={addEmail}
                                disabled={!emailInput.trim()}
                                className="rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40
                           px-4 py-3 text-sm font-medium text-white transition-colors"
                            >
                                Add
                            </button>
                        </div>
                        {emailError && (
                            <p className="mt-1.5 text-xs text-red-400">{emailError}</p>
                        )}
                        <p className="mt-1.5 text-xs text-gray-600">
                            Press Enter to add. Members get a wallet automatically on first sign-in.
                        </p>
                    </div>

                    {/* Submit error */}
                    {submitError && (
                        <p className="text-sm text-red-400 bg-red-900/20 border border-red-500/20
                           rounded-lg px-3 py-2">
                            {submitError}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-xl border border-white/10 px-4 py-3
                         text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || !name.trim()}
                            className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500
                         disabled:opacity-50 px-4 py-3 text-sm font-semibold
                         text-white transition-colors flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <span className="h-4 w-4 rounded-full border-2 border-white/30
                                   border-t-white animate-spin" />
                                    Creating…
                                </>
                            ) : (
                                'Create Group'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
