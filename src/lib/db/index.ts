/**
 * src/lib/db/index.ts
 *
 * Barrel export for the db layer.
 * Import from '@/lib/db' instead of individual files.
 */

export * from './users';
export * from './groups';
export * from './expenses';
export type { Database, UserRow, GroupRow, GroupMemberRow, ExpenseRow, ExpenseSplitRow } from './database.types';
