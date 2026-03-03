'use client';

/**
 * src/app/(auth)/login/page.tsx
 *
 * Magic-link login page.
 * User enters their email → Supabase sends a one-time link → they click it
 * → /auth/callback handles the session and wallet setup.
 *
 * No passwords, no private keys. Ever.
 */

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

type Stage = 'idle' | 'loading' | 'sent' | 'error';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [stage, setStage] = useState<Stage>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!trimmed) return;

        setStage('loading');
        setErrorMsg('');

        const { error } = await supabase.auth.signInWithOtp({
            email: trimmed,
            options: {
                emailRedirectTo: `${appUrl}/auth/callback`,
                // Create user if they don't exist yet
                shouldCreateUser: true,
            },
        });

        if (error) {
            setStage('error');
            setErrorMsg(error.message);
            return;
        }

        setStage('sent');
    }

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
            <div className="w-full max-w-sm">
                {/* Logo / wordmark */}
                <div className="mb-10 text-center">
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        Split<span className="text-indigo-400">Pay</span>
                    </h1>
                    <p className="mt-2 text-sm text-gray-400">
                        Split expenses. Settle with USDC.
                    </p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8 shadow-xl">
                    {stage === 'sent' ? (
                        /* ── Success state ───────────────────────────────────────────── */
                        <div className="text-center space-y-4">
                            <div className="flex justify-center">
                                <span className="text-5xl" role="img" aria-label="email sent">📬</span>
                            </div>
                            <h2 className="text-lg font-semibold text-white">Link sent!</h2>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                We sent a sign-in link to{' '}
                                <strong className="text-gray-200">{email}</strong>.
                                Check your inbox.
                            </p>
                            <button
                                type="button"
                                onClick={() => { setStage('idle'); setEmail(''); }}
                                className="mt-4 w-full rounded-xl py-2.5 px-4 text-sm font-medium
                           border border-white/10 text-gray-300 hover:bg-white/5
                           transition-colors"
                            >
                                Use a different email
                            </button>
                        </div>
                    ) : (
                        /* ── Form state ──────────────────────────────────────────────── */
                        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-gray-300 mb-1.5"
                                >
                                    Email address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={stage === 'loading'}
                                    className="
                    w-full rounded-xl px-4 py-3 text-sm
                    bg-white/8 border border-white/10
                    text-white placeholder:text-gray-500
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition
                  "
                                />
                            </div>

                            {/* Error message */}
                            {stage === 'error' && (
                                <p
                                    role="alert"
                                    className="text-sm text-red-400 bg-red-900/20 border border-red-500/20
                             rounded-lg px-3 py-2"
                                >
                                    {errorMsg}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={stage === 'loading' || !email.trim()}
                                className="
                  w-full rounded-xl py-3 px-4 text-sm font-semibold
                  bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700
                  text-white transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2
                "
                            >
                                {stage === 'loading' ? (
                                    <>
                                        <span className="h-4 w-4 rounded-full border-2 border-white/30
                                     border-t-white animate-spin" />
                                        Sending…
                                    </>
                                ) : (
                                    'Send Magic Link'
                                )}
                            </button>

                            <p className="text-center text-xs text-gray-500 leading-relaxed mt-2">
                                No passwords. No private keys. No seed phrases.<br />Just click the link in your email.
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </main>
    );
}
