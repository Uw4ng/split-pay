/**
 * components/groups/MemberList.tsx
 *
 * Renders the member list with avatar initials and email.
 * Used in the group detail page sidebar / header area.
 */

import type { User } from '@/types';

interface MemberListProps {
    members: User[];
}

export function MemberList({ members }: MemberListProps) {
    return (
        <ul className="space-y-2">
            {members.map((member) => (
                <li key={member.id} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                        {(member.displayName ?? member.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                            {member.displayName ?? member.email}
                        </p>
                        {member.displayName && (
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        )}
                    </div>
                </li>
            ))}
        </ul>
    );
}
