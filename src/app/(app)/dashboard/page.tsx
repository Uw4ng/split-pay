'use client';

/**
 * (app)/dashboard/page.tsx
 *
 * Main dashboard — shows the user's groups, total balances,
 * and quick-action buttons.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { useGroupStore } from '@/store/groupStore';
import { GroupCard } from '@/components/groups/GroupCard';

export default function DashboardPage() {
    const { groups, isLoading, error, fetchGroups } = useGroupStore();

    useEffect(() => {
        fetchGroups();
    }, [fetchGroups]);

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-border bg-card px-6 py-4">
                <div className="mx-auto flex max-w-4xl items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
                            S
                        </span>
                        <span className="font-bold text-foreground">SplitPay</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/groups/new"
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            + New Group
                        </Link>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="mx-auto max-w-4xl px-6 py-8">
                <h1 className="mb-6 text-2xl font-bold text-foreground">Your Groups</h1>

                {isLoading && (
                    <div className="flex items-center justify-center py-16">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                )}

                {error && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                {!isLoading && !error && groups.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                        <div className="mb-3 text-4xl">👥</div>
                        <h2 className="mb-1 font-semibold text-foreground">No groups yet</h2>
                        <p className="mb-4 text-sm text-muted-foreground">
                            Create a group to start splitting expenses with friends.
                        </p>
                        <Link
                            href="/groups/new"
                            className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            Create your first group
                        </Link>
                    </div>
                )}

                {!isLoading && groups.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {groups.map((group) => (
                            <GroupCard key={group.id} group={group} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
