/**
 * src/lib/db/groups.ts
 *
 * Database helpers for `groups` and `group_members` tables.
 *
 * All functions return { data, error } — errors are never thrown.
 * Dates are ISO 8601 strings throughout.
 */

import { getSupabaseAdmin } from '@/lib/supabase';
import type { GroupRow, GroupMemberRow, UserRow } from './database.types';
import type { DbResult } from './users';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A group row joined with its member user records */
export interface GroupWithMembers extends GroupRow {
    members: UserRow[];
}

// ── createGroup ───────────────────────────────────────────────────────────────

/**
 * Creates a new group and automatically adds the creator as the first member.
 *
 * @param name        - Group display name (1–100 chars)
 * @param createdById - UUID of the creating user
 * @param description - Optional group description (max 300 chars)
 */
export async function createGroup(
    name: string,
    createdById: string,
    description?: string
): DbResult<GroupWithMembers> {
    const db = getSupabaseAdmin();

    const trimmedName = name.trim();
    if (!trimmedName) return { data: null, error: 'Group name cannot be empty' };
    if (trimmedName.length > 100) return { data: null, error: 'Group name must be ≤ 100 characters' };

    // 1. Insert group
    const { data: group, error: groupError } = await db
        .from('groups')
        .insert({
            name: trimmedName,
            description: description?.trim() ?? null,
            created_by: createdById,
        })
        .select()
        .single();

    if (groupError) return { data: null, error: groupError.message };

    // 2. Add creator as first member
    const { error: memberError } = await db
        .from('group_members')
        .insert({ group_id: (group as GroupRow).id, user_id: createdById });

    if (memberError) return { data: null, error: memberError.message };

    // 3. Fetch the creator's user record to return a complete GroupWithMembers
    const { data: creator, error: userError } = await db
        .from('users')
        .select('*')
        .eq('id', createdById)
        .single();

    if (userError) return { data: null, error: userError.message };

    return {
        data: { ...(group as GroupRow), members: [creator as UserRow] },
        error: null,
    };
}

// ── getGroup ──────────────────────────────────────────────────────────────────

/**
 * Fetches a single group by ID, including all member user records.
 */
export async function getGroup(groupId: string): DbResult<GroupWithMembers> {
    const db = getSupabaseAdmin();

    const { data: group, error: groupError } = await db
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

    if (groupError) return { data: null, error: groupError.message };

    // Fetch member user_ids
    const { data: memberRows, error: memberError } = await db
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    if (memberError) return { data: null, error: memberError.message };

    const memberIds = (memberRows as Pick<GroupMemberRow, 'user_id'>[]).map((r) => r.user_id);

    if (memberIds.length === 0) {
        return { data: { ...(group as GroupRow), members: [] }, error: null };
    }

    // Fetch user records
    const { data: users, error: usersError } = await db
        .from('users')
        .select('*')
        .in('id', memberIds);

    if (usersError) return { data: null, error: usersError.message };

    return {
        data: { ...(group as GroupRow), members: (users ?? []) as UserRow[] },
        error: null,
    };
}

// ── getUserGroups ─────────────────────────────────────────────────────────────

/**
 * Returns all groups the given user is a member of, each with their member lists.
 * Ordered by created_at descending (newest first).
 */
export async function getUserGroups(userId: string): DbResult<GroupWithMembers[]> {
    const db = getSupabaseAdmin();

    // Get all group_ids for this user
    const { data: memberships, error: membershipError } = await db
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId);

    if (membershipError) return { data: null, error: membershipError.message };
    if (!memberships?.length) return { data: [], error: null };

    const groupIds = (memberships as Pick<GroupMemberRow, 'group_id'>[]).map((m) => m.group_id);

    // Fetch all those groups
    const { data: groups, error: groupsError } = await db
        .from('groups')
        .select('*')
        .in('id', groupIds)
        .order('created_at', { ascending: false });

    if (groupsError) return { data: null, error: groupsError.message };

    // For each group, fetch members (parallel)
    const results = await Promise.all(
        (groups as GroupRow[]).map(async (group): Promise<GroupWithMembers> => {
            const { data: mRows } = await db
                .from('group_members')
                .select('user_id')
                .eq('group_id', group.id);

            const ids = (mRows ?? []).map((r: { user_id: string }) => r.user_id);
            if (!ids.length) return { ...group, members: [] };

            const { data: users } = await db
                .from('users')
                .select('*')
                .in('id', ids);

            return { ...group, members: (users ?? []) as UserRow[] };
        })
    );

    return { data: results, error: null };
}

// ── addMember ─────────────────────────────────────────────────────────────────

/**
 * Adds a user to a group by their email address.
 *
 * Returns the added user's record, or an error if:
 *  - No user with that email exists
 *  - The user is already a member of the group
 *
 * @param groupId    - Target group UUID
 * @param email      - Email of the user to add
 */
export async function addMember(
    groupId: string,
    email: string
): DbResult<UserRow> {
    const db = getSupabaseAdmin();

    // 1. Look up user by email
    const { data: user, error: userError } = await db
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

    if (userError) return { data: null, error: userError.message };
    if (!user) return { data: null, error: `No user found with email: ${email}` };

    const typedUser = user as UserRow;

    // 2. Check for duplicate membership
    const { data: existing, error: dupError } = await db
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', typedUser.id)
        .maybeSingle();

    if (dupError) return { data: null, error: dupError.message };
    if (existing) return { data: null, error: `${email} is already a member of this group` };

    // 3. Insert membership
    const { error: insertError } = await db
        .from('group_members')
        .insert({ group_id: groupId, user_id: typedUser.id });

    if (insertError) return { data: null, error: insertError.message };

    return { data: typedUser, error: null };
}

// ── removeMember ──────────────────────────────────────────────────────────────

/**
 * Removes a user from a group.
 * The group creator cannot be removed (enforced at application layer).
 */
export async function removeMember(
    groupId: string,
    userId: string,
    requestingUserId: string
): DbResult<{ removed: true }> {
    const db = getSupabaseAdmin();

    // Guard: cannot remove the group creator
    const { data: group, error: groupError } = await db
        .from('groups')
        .select('created_by')
        .eq('id', groupId)
        .single();

    if (groupError) return { data: null, error: groupError.message };
    if ((group as Pick<GroupRow, 'created_by'>).created_by === userId) {
        return { data: null, error: 'The group creator cannot be removed' };
    }

    // Allow only the member removing themselves, or the group creator doing the removing
    const isCreator = (group as Pick<GroupRow, 'created_by'>).created_by === requestingUserId;
    const isSelf = userId === requestingUserId;

    if (!isCreator && !isSelf) {
        return { data: null, error: 'Only the group creator or the member themselves can remove a member' };
    }

    const { error } = await db
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

    if (error) return { data: null, error: error.message };
    return { data: { removed: true }, error: null };
}
