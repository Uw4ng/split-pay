/**
 * src/store/userStore.ts
 *
 * Zustand store — global user + wallet state.
 *
 * Kept intentionally thin: session management lives in AuthProvider,
 * which calls setUser / clearUser after Supabase auth events.
 */

import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;       // Supabase auth user id
  email: string;
  displayName: string | null;
  walletId: string;       // Circle wallet UUID (empty until PIN setup)
  walletAddress: string;  // 0x... EVM address (empty until PIN setup)
}

interface UserState {
  // ── State ───────────────────────────────────────────────────────────────────
  user: AppUser | null;
  walletBalance: number;
  isLoadingBalance: boolean;
  isHydrated: boolean; // true once AuthProvider has resolved initial session

  // ── Actions ─────────────────────────────────────────────────────────────────
  setUser: (user: AppUser) => void;
  clearUser: () => void;
  setWalletBalance: (balance: number) => void;
  setLoadingBalance: (loading: boolean) => void;
  setHydrated: () => void;
  refreshBalance: () => Promise<void>;
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  walletBalance: 0,
  isLoadingBalance: false,
  isHydrated: false,

  setUser: (user) => set({ user }),

  clearUser: () => set({ user: null, walletBalance: 0 }),

  setWalletBalance: (balance) => set({ walletBalance: balance }),

  setLoadingBalance: (loading) => set({ isLoadingBalance: loading }),

  setHydrated: () => set({ isHydrated: true }),

  /**
   * Fetches the current USDC balance from the Circle API and writes it
   * to the store. Requires a valid userToken in the session — if the user
   * has no wallet yet, the balance stays at 0 silently.
   *
   * Callers should prefer useWalletBalance() which handles polling.
   */
  refreshBalance: async () => {
    const { user } = get();
    if (!user?.walletId) return;

    set({ isLoadingBalance: true });
    try {
      // userToken comes from Supabase session cookie via the API route
      const res = await fetch(
        `/api/circle/balance?walletId=${encodeURIComponent(user.walletId)}` +
        `&userToken=${encodeURIComponent('')}` // server resolves real token
      );
      if (!res.ok) return;
      const json = await res.json() as { success: boolean; data?: { balance: number } };
      if (json.success && json.data) {
        set({ walletBalance: json.data.balance });
      }
    } catch {
      // Balance fetch failure is non-critical; don't reset to 0
    } finally {
      set({ isLoadingBalance: false });
    }
  },
}));

// ── Selectors ─────────────────────────────────────────────────────────────────

/** Returns the current user or null — avoids a whole-store subscription */
export const selectUser = (s: UserState) => s.user;
export const selectBalance = (s: UserState) => s.walletBalance;
export const selectIsHydrated = (s: UserState) => s.isHydrated;
