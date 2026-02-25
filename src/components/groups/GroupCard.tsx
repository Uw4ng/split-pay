/**
 * components/groups/GroupCard.tsx
 *
 * Card shown in the dashboard for each group.
 * Displays group name, member avatars, and balance summary.
 */

import Link from 'next/link';
import type { Group } from '@/types';

interface GroupCardProps {
    group: Group;
}

export function GroupCard({ group }: GroupCardProps) {
    const memberPreview = group.members.slice(0, 4);
    const overflow = group.members.length - 4;

    return (
        <Link
            href={`/groups/${group.id}`}
            className="block rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
        >
            <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{group.name}</h3>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                </span>
            </div>

            {group.description && (
                <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{group.description}</p>
            )}

            {/* Member avatars */}
            <div className="flex items-center gap-1">
                {memberPreview.map((member) => (
                    <div
                        key={member.id}
                        title={member.displayName ?? member.email}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary"
                    >
                        {(member.displayName ?? member.email).charAt(0).toUpperCase()}
                    </div>
                ))}
                {overflow > 0 && (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                        +{overflow}
                    </div>
                )}
            </div>
        </Link>
    );
}
