/**
 * src/app/(auth)/callback/route.ts
 *
 * Supabase Magic Link callback handler.
 *
 * Flow:
 *   1. Exchange the `code` query param for a Supabase session.
 *   2. Look up (or create) the user record in our `users` table.
 *   3. If the user has no wallet yet → call the circle create-wallet API
 *      to register them in Circle and get the PIN challenge data.
 *      Store the challengeId in the session for the client-side PIN flow.
 *   4. Redirect to /dashboard (wallet setup PIN modal opens there).
 *
 * Note on the PIN flow:
 *   Circle User-Controlled Wallets require the user to set a PIN via
 *   the Circle JS SDK *on the client side*. We can't complete wallet
 *   creation fully server-side. So after this callback we:
 *     - Store `needsPinSetup=true` in the redirect URL or a cookie
 *     - The dashboard detects it and shows the Circle PIN modal
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getOrCreateUser, updateWalletInfo } from '@/lib/db/users';

// ── Helper: build a server-side Supabase client from the request cookies ─────

function makeServerClient(req: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClient<any>(supabaseUrl, supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        global: {
            headers: { Cookie: req.headers.get('cookie') ?? '' },
        },
    });
}

// ── GET /auth/callback ────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
    const requestUrl = new URL(req.url);
    const code = requestUrl.searchParams.get('code');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    if (!code) {
        return NextResponse.redirect(`${appUrl}/login?error=missing_code`);
    }

    // 1. Exchange code for session
    const supabase = makeServerClient(req);
    const { data: sessionData, error: sessionError } =
        await supabase.auth.exchangeCodeForSession(code);

    if (sessionError || !sessionData.session) {
        console.error('[callback] session exchange failed:', sessionError?.message);
        return NextResponse.redirect(`${appUrl}/login?error=auth_failed`);
    }

    const authUser = sessionData.session.user;

    // 2. Upsert user record in our DB
    const { data: dbUser, error: dbError } =
        await getOrCreateUser(authUser.id, authUser.email ?? '');

    if (dbError) {
        console.error('[callback] getOrCreateUser failed:', dbError);
        // Non-fatal — redirect anyway, user can retry
        return NextResponse.redirect(`${appUrl}/dashboard`);
    }

    // 3. First login? → kick off Circle wallet creation server-side.
    //    We create the Circle user + obtain challenge data.
    //    The actual wallet is finalised after the PIN modal on the client.
    const needsWallet = !dbUser!.wallet_id || dbUser!.wallet_id === '';

    if (needsWallet) {
        try {
            const idempotencyKey = crypto.randomUUID();
            const walletRes = await fetch(`${appUrl}/api/circle/create-wallet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: authUser.id, idempotencyKey }),
            });

            if (walletRes.ok) {
                const walletJson = await walletRes.json() as {
                    success: boolean;
                    data?: { userToken: string; encryptionKey: string; challengeId: string };
                };

                if (walletJson.success && walletJson.data) {
                    // Redirect to dashboard with PIN setup params in the URL.
                    // The dashboard reads these params, launches the Circle JS SDK modal,
                    // then calls /api/circle/wallet-info to get the final address.
                    const dashUrl = new URL(`${appUrl}/dashboard`);
                    dashUrl.searchParams.set('pinSetup', 'true');
                    dashUrl.searchParams.set('challengeId', walletJson.data.challengeId);
                    dashUrl.searchParams.set('userToken', walletJson.data.userToken);
                    dashUrl.searchParams.set('encryptionKey', walletJson.data.encryptionKey);
                    return NextResponse.redirect(dashUrl.toString());
                }
            }
        } catch (err) {
            console.error('[callback] wallet creation failed:', err);
            // Non-fatal — user can retry from dashboard
        }

        // Wallet creation failed or had no data — go to dashboard anyway
        return NextResponse.redirect(`${appUrl}/dashboard?pinSetup=retry`);
    }

    // 4. Returning user — wallet already exists, go straight to dashboard
    return NextResponse.redirect(`${appUrl}/dashboard`);
}
