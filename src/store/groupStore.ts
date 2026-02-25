/**
 * store/groupStore.ts
 *
 * Zustand store for group state management.
 * Handles CRUD operations for groups via SplitPay API routes.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Group, GroupState } from '@/types';

// ── Actions ──────────────────────────────────────────────────────────────────

interface GroupActions {
    /** Fetch all groups the current user belongs to */
    fetchGroups: () => Promise<void>;
    /** Create a new group */
    createGroup: (name: string, description?: string) => Promise<Group>;
    /** Set the currently viewed group */
    setActiveGroup: (groupId: string | null) => void;
    /** Add a member to a group by email */
    addMember: (groupId: string, email: string) => Promise<void>;
    /** Clear errors */
    clearError: () => void;
    /** Reset store */
    reset: () => void;
}

// ── Initial state ─────────────────────────────────────────────────────────────

const initialState: GroupState = {
    groups: [],
    activeGroupId: null,
    isLoading: false,
    error: null,
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGroupStore = create<GroupState & GroupActions>()(
    devtools(
        (set, get) => ({
            ...initialState,

            fetchGroups: async () => {
                set({ isLoading: true, error: null });
                try {
                    const res = await fetch('/api/groups');
                    if (!res.ok) {
                        const { error } = (await res.json()) as { error: string };
                        throw new Error(error ?? 'Failed to fetch groups');
                    }
                    const groups = (await res.json()) as Group[];
                    set({ groups, isLoading: false });
                } catch (err) {
                    set({
                        isLoading: false,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                }
            },

            createGroup: async (name, description) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await fetch('/api/groups', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, description }),
                    });
                    if (!res.ok) {
                        const { error } = (await res.json()) as { error: string };
                        throw new Error(error ?? 'Failed to create group');
                    }
                    const group = (await res.json()) as Group;
                    set((state) => ({ groups: [group, ...state.groups], isLoading: false }));
                    return group;
                } catch (err) {
                    set({
                        isLoading: false,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                    throw err;
                }
            },

            setActiveGroup: (groupId) => {
                set({ activeGroupId: groupId });
            },

            addMember: async (groupId, email) => {
                set({ isLoading: true, error: null });
                try {
                    const res = await fetch(`/api/groups/${groupId}/members`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email }),
                    });
                    if (!res.ok) {
                        const { error } = (await res.json()) as { error: string };
                        throw new Error(error ?? 'Failed to add member');
                    }
                    // Re-fetch groups to get updated member list
                    await get().fetchGroups();
                } catch (err) {
                    set({
                        isLoading: false,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                    throw err;
                }
            },

            clearError: () => set({ error: null }),

            reset: () => set(initialState),
        }),
        { name: 'GroupStore' }
    )
);

// ── Selectors ─────────────────────────────────────────────────────────────────

/** Returns the currently active group object, or null */
export const selectActiveGroup = (state: GroupState): Group | null =>
    state.groups.find((g) => g.id === state.activeGroupId) ?? null;
