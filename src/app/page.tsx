import Link from 'next/link';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gray-950 text-white font-sans antialiased">

            {/* ── Nav ─────────────────────────────────────────────────────────────── */}
            <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-gray-950/80 backdrop-blur">
                <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
                    <span className="text-xl font-bold tracking-tight">
                        Split<span className="text-indigo-400">Pay</span>
                    </span>
                    <Link
                        href="/login"
                        className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5
                       text-sm font-semibold text-white transition-colors"
                    >
                        Get Started
                    </Link>
                </div>
            </nav>

            {/* ── Hero ────────────────────────────────────────────────────────────── */}
            <section className="relative flex min-h-screen items-center justify-center px-6 pt-20">
                {/* Glow */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2
                          h-[500px] w-[700px] rounded-full
                          bg-indigo-600/15 blur-[120px]" />
                </div>

                <div className="relative z-10 mx-auto max-w-3xl text-center">
                    {/* Badge */}
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/30
                          bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        Powered by Circle &amp; Arc
                    </div>

                    <h1 className="text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
                        Split expenses.<br />
                        <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                            Settle instantly.
                        </span>
                    </h1>

                    <p className="mx-auto mt-6 max-w-xl text-lg text-gray-400 leading-relaxed">
                        The simplest way to track shared costs with friends and settle debts
                        in real-time using USDC — no wallets to set up, just your email.
                    </p>

                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            href="/login"
                            className="w-full sm:w-auto rounded-2xl bg-indigo-600 hover:bg-indigo-500
                         active:bg-indigo-700 px-8 py-4 text-base font-semibold
                         text-white transition-colors shadow-lg shadow-indigo-500/25"
                        >
                            Get Started — it&apos;s free
                        </Link>
                        <a
                            href="https://github.com/Uw4ng/split-pay"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto rounded-2xl border border-white/10
                         px-8 py-4 text-base font-semibold text-gray-300
                         hover:bg-white/5 transition-colors"
                        >
                            View on GitHub →
                        </a>
                    </div>
                </div>
            </section>

            {/* ── Features ────────────────────────────────────────────────────────── */}
            <section className="relative py-24 px-6">
                <div className="mx-auto max-w-5xl">
                    <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-indigo-400 mb-4">
                        Features
                    </h2>
                    <p className="text-center text-3xl font-bold text-white mb-14">
                        Everything you need, nothing you don&apos;t
                    </p>

                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {[
                            {
                                icon: '👥',
                                title: 'Group Expenses',
                                desc: 'Create groups for trips, roommates, or dinners. Add any expense in seconds and split it evenly or with custom amounts.',
                            },
                            {
                                icon: '⚡',
                                title: 'Instant USDC Settlement',
                                desc: 'Settle debts with a single tap. Circle Programmable Wallets move USDC on-chain automatically — no manual transfers.',
                            },
                            {
                                icon: '📧',
                                title: 'No Wallet Setup',
                                desc: 'Sign in with just your email. A secure USDC wallet is created for you behind the scenes — no seed phrases ever.',
                            },
                            {
                                icon: '🔒',
                                title: 'Non-Custodial Security',
                                desc: 'Your wallet is always yours. Circle\'s user-controlled architecture means only you can authorise transactions.',
                            },
                            {
                                icon: '🧮',
                                title: 'Debt Minimisation',
                                desc: 'Smart algorithm calculates the fewest possible transfers to settle a group — no unnecessary back-and-forth.',
                            },
                            {
                                icon: '🔗',
                                title: 'On-Chain Receipts',
                                desc: 'Every settlement is a real blockchain transaction on Arc. Click the hash to verify it on the explorer.',
                            },
                        ].map((f) => (
                            <div
                                key={f.title}
                                className="rounded-2xl border border-white/8 bg-white/3 p-6
                           hover:border-indigo-500/30 hover:bg-white/5
                           transition-all duration-200"
                            >
                                <div className="mb-4 text-3xl">{f.icon}</div>
                                <h3 className="mb-2 font-semibold text-white">{f.title}</h3>
                                <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── How it works ────────────────────────────────────────────────────── */}
            <section className="py-24 px-6 border-t border-white/5">
                <div className="mx-auto max-w-3xl">
                    <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-indigo-400 mb-4">
                        How it works
                    </h2>
                    <p className="text-center text-3xl font-bold text-white mb-14">
                        Three steps to zero debts
                    </p>

                    <div className="space-y-6">
                        {[
                            {
                                step: '01',
                                title: 'Create a group',
                                desc: 'Sign in with your email and invite friends by their email address. No app download required.',
                            },
                            {
                                step: '02',
                                title: 'Add expenses',
                                desc: 'Log who paid and split the cost equally or with custom amounts. The dashboard tracks who owes what in real time.',
                            },
                            {
                                step: '03',
                                title: 'Settle with USDC',
                                desc: 'Hit "Settle Up", confirm the amount, and USDC is transferred on-chain instantly. Everyone\'s balance resets to zero.',
                            },
                        ].map((item) => (
                            <div
                                key={item.step}
                                className="flex gap-6 rounded-2xl border border-white/8 bg-white/3 p-6"
                            >
                                <span className="flex-shrink-0 text-4xl font-bold text-indigo-500/40">
                                    {item.step}
                                </span>
                                <div>
                                    <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ─────────────────────────────────────────────────────────────── */}
            <section className="py-24 px-6">
                <div className="mx-auto max-w-2xl text-center">
                    <div className="rounded-3xl border border-indigo-500/20 bg-indigo-500/5 px-8 py-16">
                        <h2 className="text-3xl font-bold text-white mb-4">
                            Ready to split smarter?
                        </h2>
                        <p className="text-gray-400 mb-8">
                            Free to use. No card required. Just your email.
                        </p>
                        <Link
                            href="/login"
                            className="inline-block rounded-2xl bg-indigo-600 hover:bg-indigo-500
                         px-10 py-4 text-base font-semibold text-white
                         transition-colors shadow-lg shadow-indigo-500/25"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── Footer ──────────────────────────────────────────────────────────── */}
            <footer className="border-t border-white/5 px-6 py-8">
                <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <span className="text-sm font-bold">
                        Split<span className="text-indigo-400">Pay</span>
                    </span>
                    <p className="text-xs text-gray-600">
                        Built on{' '}
                        <a href="https://arc.network" target="_blank" rel="noopener noreferrer"
                            className="hover:text-gray-400 transition-colors">Arc</a>
                        {' '}·{' '}
                        Powered by{' '}
                        <a href="https://circle.com" target="_blank" rel="noopener noreferrer"
                            className="hover:text-gray-400 transition-colors">Circle</a>
                    </p>
                    <a
                        href="https://github.com/Uw4ng/split-pay"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-600 hover:text-gray-300 transition-colors"
                    >
                        GitHub →
                    </a>
                </div>
            </footer>
        </div>
    );
}
