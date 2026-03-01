/**
 * src/lib/env.ts
 *
 * Validates that all required environment variables are present at startup.
 * Import this at the top of any server-side entry point (API routes, lib files).
 *
 * Usage:
 *   import '@/lib/env';               // throws if missing
 *   import { env } from '@/lib/env';  // typed, validated values
 */

// ── Required variables ────────────────────────────────────────────────────────

const REQUIRED: Record<string, string> = {
    CIRCLE_API_KEY: 'Circle API key (get one at https://console.circle.com)',
    CIRCLE_ENV: '"sandbox" or "production"',
    NEXT_PUBLIC_SUPABASE_URL: 'Your Supabase project URL (Settings → API)',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Your Supabase anon/public key (Settings → API)',
    SUPABASE_SERVICE_KEY: 'Your Supabase service role key (Settings → API → Never expose client-side!)',
};

// ── Validate ──────────────────────────────────────────────────────────────────

const missing: string[] = [];

for (const [key, hint] of Object.entries(REQUIRED)) {
    if (!process.env[key]) {
        missing.push(`  • ${key.padEnd(35)} → ${hint}`);
    }
}

if (missing.length > 0) {
    throw new Error(
        [
            '',
            '╔══════════════════════════════════════════════════════════╗',
            '║          SplitPay — Missing Environment Variables        ║',
            '╚══════════════════════════════════════════════════════════╝',
            '',
            'The following required environment variables are not set:',
            '',
            ...missing,
            '',
            'Set them in .env.local (development) or your deployment platform.',
            'See README.md → Quick Setup for step-by-step instructions.',
            '',
        ].join('\n')
    );
}

// ── Typed exports ─────────────────────────────────────────────────────────────

/**
 * Validated, non-nullable environment variables.
 * Safe to use in server-side code after this module has been imported.
 */
export const env = {
    CIRCLE_API_KEY: process.env.CIRCLE_API_KEY!,
    CIRCLE_ENV: (process.env.CIRCLE_ENV ?? 'sandbox') as 'sandbox' | 'production',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY!,
} as const;

export type Env = typeof env;
