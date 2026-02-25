/**
 * API Route: GET/POST /api/groups
 *
 * GET  → list all groups for the current user
 * POST → create a new group
 *
 * Body (POST): { name: string; description?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, TABLES } from '@/lib/supabase';
import type { DbGroup, DbGroupMember, DbUser, Group } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function dbGroupToGroup(dbGroup: DbGroup, members: DbUser[]): Group {
    return {
        id: dbGroup.id,
        name: dbGroup.name,
        description: dbGroup.description ?? undefined,
        members: members.map((u) => ({
            id: u.id,
            email: u.email,
            walletId: u.wallet_id,
            walletAddress: u.wallet_address,
            displayName: u.display_name ?? undefined,
            createdAt: u.created_at,
        })),
        createdBy: dbGroup.created_by,
        createdAt: dbGroup.created_at,
        updatedAt: dbGroup.updated_at,
    };
}

// ── GET /api/groups ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        // TODO: replace with real auth — extract userId from session/cookie
        const userId = req.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = getSupabaseAdmin();

        // Get groups the user is a member of
        const { data: memberships, error: memberError } = await db
            .from(TABLES.groupMembers)
            .select('group_id')
            .eq('user_id', userId);

        if (memberError) throw memberError;
        if (!memberships?.length) return NextResponse.json([], { status: 200 });

        const groupIds = memberships.map((m: { group_id: string }) => m.group_id);

        // Fetch those groups
        const { data: groups, error: groupError } = await db
            .from(TABLES.groups)
            .select('*')
            .in('id', groupIds)
            .order('created_at', { ascending: false });

        if (groupError) throw groupError;

        // Fetch members for each group
        const result: Group[] = await Promise.all(
            (groups as DbGroup[]).map(async (group) => {
                const { data: memberRows } = await db
                    .from(TABLES.groupMembers)
                    .select('user_id')
                    .eq('group_id', group.id);

                const memberIds = (memberRows ?? []).map((r: { user_id: string }) => r.user_id);

                const { data: users } = await db
                    .from(TABLES.users)
                    .select('*')
                    .in('id', memberIds);

                return dbGroupToGroup(group, (users ?? []) as DbUser[]);
            })
        );

        return NextResponse.json(result, { status: 200 });
    } catch (err) {
        console.error('[GET /api/groups]', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

// ── POST /api/groups ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const userId = req.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = (await req.json()) as { name?: string; description?: string };
        if (!body.name?.trim()) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const db = getSupabaseAdmin();

        // Create the group
        const { data: group, error: groupError } = await db
            .from(TABLES.groups)
            .insert({
                name: body.name.trim(),
                description: body.description?.trim() ?? null,
                created_by: userId,
            })
            .select()
            .single();

        if (groupError) throw groupError;

        // Add creator as first member
        const { error: memberError } = await db.from(TABLES.groupMembers).insert({
            group_id: (group as DbGroup).id,
            user_id: userId,
        });

        if (memberError) throw memberError;

        // Fetch creator user record
        const { data: creatorUser } = await db
            .from(TABLES.users)
            .select('*')
            .eq('id', userId)
            .single();

        const result = dbGroupToGroup(group as DbGroup, creatorUser ? [creatorUser as DbUser] : []);

        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        console.error('[POST /api/groups]', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
