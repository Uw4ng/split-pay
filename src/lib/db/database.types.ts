/**
 * src/lib/db/database.types.ts
 *
 * Hand-written TypeScript types mirroring the Supabase schema in 001_initial.sql.
 *
 * Tip: replace this file by running:
 *   supabase gen types typescript --local > src/lib/db/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ── Row types ─────────────────────────────────────────────────────────────────

export interface UserRow {
    id: string;
    email: string;
    display_name: string | null;
    wallet_id: string;
    wallet_address: string;
    created_at: string;
}

export interface GroupRow {
    id: string;
    name: string;
    description: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
}

export interface GroupMemberRow {
    group_id: string;
    user_id: string;
    joined_at: string;
}

export interface ExpenseRow {
    id: string;
    group_id: string;
    paid_by: string;
    amount: string;           // NUMERIC returned as string from PostgREST
    description: string;
    category: string | null;
    created_at: string;
}

export interface ExpenseSplitRow {
    id: string;
    expense_id: string;
    user_id: string;
    amount: string;           // NUMERIC returned as string
    settled: boolean;
    settled_at: string | null;
    tx_hash: string | null;
}

// ── Database map ──────────────────────────────────────────────────────────────

export interface Database {
    public: {
        Tables: {
            users: {
                Row: UserRow;
                Insert: {
                    id: string;
                    email: string;
                    display_name?: string | null;
                    wallet_id?: string;
                    wallet_address?: string;
                };
                Update: {
                    email?: string;
                    display_name?: string | null;
                    wallet_id?: string;
                    wallet_address?: string;
                };
            };
            groups: {
                Row: GroupRow;
                Insert: {
                    name: string;
                    created_by: string;
                    description?: string | null;
                };
                Update: {
                    name?: string;
                    description?: string | null;
                    updated_at?: string;
                };
            };
            group_members: {
                Row: GroupMemberRow;
                Insert: {
                    group_id: string;
                    user_id: string;
                };
                Update: Record<string, never>;
            };
            expenses: {
                Row: ExpenseRow;
                Insert: {
                    group_id: string;
                    paid_by: string;
                    amount: string;
                    description: string;
                    category?: string | null;
                };
                Update: Record<string, never>;
            };
            expense_splits: {
                Row: ExpenseSplitRow;
                Insert: {
                    expense_id: string;
                    user_id: string;
                    amount: string;
                };
                Update: {
                    settled?: boolean;
                    settled_at?: string | null;
                    tx_hash?: string | null;
                };
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
    };
}
