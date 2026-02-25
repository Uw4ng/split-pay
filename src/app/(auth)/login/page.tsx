'use client';

/**
 * (auth)/login/page.tsx
 *
 * SplitPay login page.
 * Users sign in with email — Circle Programmable Wallets handles
 * wallet creation automatically. No seed phrase needed.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emailSent, setEmailSent] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (!email.trim() || !email.includes('@')) {
            setError('Please enter a valid email address.');
            return;
        }

        setIsLoading(true);
        try {
            // TODO: implement actual auth logic (Circle user creation + Supabase session)
            // For now, just simulate a magic-link flow
            await new Promise((res) => setTimeout(res, 1000));
            setEmailSent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }

    if (emailSent) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background px-4">
                <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl">
                    <div className="mb-4 text-4xl">✉️</div>
                    <h1 className="mb-2 text-xl font-bold text-foreground">Check your inbox</h1>
                    <p className="text-sm text-muted-foreground">
                        We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.
                        Click it to log into SplitPay.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="mb-8 text-center">
                    <div className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-primary-foreground">
                        S
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">Welcome to SplitPay</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Split expenses. Settle with USDC. No crypto knowledge needed.
                    </p>
                </div>

                {/* Form */}
                <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                                Email address
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                                className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>

                        {error && (
                            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isLoading ? 'Sending…' : 'Continue with Email'}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-xs text-muted-foreground">
                        By continuing, you agree to our Terms of Service and Privacy Policy.
                        <br />
                        A secure USDC wallet is automatically created for you.
                    </p>
                </div>
            </div>
        </main>
    );
}
