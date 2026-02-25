-- ─────────────────────────────────────────────────────────────────────────────
-- SplitPay — Initial Schema Migration
-- 001_initial.sql
--
-- Run via: supabase db push  OR  supabase migration up
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- users
-- Mirrors Circle user data. wallet_id / wallet_address are populated after PIN setup.
CREATE TABLE IF NOT EXISTS public.users (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT        NOT NULL UNIQUE,
    display_name   TEXT,
    wallet_id      TEXT        NOT NULL DEFAULT '',   -- Circle wallet UUID
    wallet_address TEXT        NOT NULL DEFAULT '',   -- 0x... EVM address
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- groups
CREATE TABLE IF NOT EXISTS public.groups (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    description TEXT        CHECK (char_length(description) <= 300),
    created_by  UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- group_members  (many-to-many: users ↔ groups)
CREATE TABLE IF NOT EXISTS public.group_members (
    group_id   UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

-- expenses
-- amount is stored as numeric(18,6) — enough for USDC (6 decimals) up to $1 trillion.
CREATE TABLE IF NOT EXISTS public.expenses (
    id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID           NOT NULL REFERENCES public.groups(id)  ON DELETE CASCADE,
    paid_by     UUID           NOT NULL REFERENCES public.users(id)   ON DELETE RESTRICT,
    amount      NUMERIC(18, 6) NOT NULL CHECK (amount > 0),
    description TEXT           NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
    category    TEXT           CHECK (category IN ('food','transport','accommodation','entertainment','utilities','other')),
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- expense_splits
-- One row per (expense, user) pair. settled=true once the on-chain transfer confirms.
CREATE TABLE IF NOT EXISTS public.expense_splits (
    id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id  UUID           NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
    user_id     UUID           NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
    amount      NUMERIC(18, 6) NOT NULL CHECK (amount >= 0),
    settled     BOOLEAN        NOT NULL DEFAULT false,
    settled_at  TIMESTAMPTZ,                                           -- set when settled=true
    tx_hash     TEXT,                                                  -- Arc transaction hash
    UNIQUE (expense_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_group_members_user_id  ON public.group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group_id      ON public.expenses (group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by       ON public.expenses (paid_by);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user_id ON public.expense_splits (user_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_settled ON public.expense_splits (expense_id) WHERE NOT settled;

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON public.groups
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- ── users ────────────────────────────────────────────────────────────────────
-- A user can only see and update their own record.

CREATE POLICY "users_select_own" ON public.users
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_insert_own" ON public.users
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ── groups ───────────────────────────────────────────────────────────────────
-- A user can see/modify a group only if they are a member.

CREATE POLICY "groups_select_member" ON public.groups
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = groups.id
              AND group_members.user_id  = auth.uid()
        )
    );

CREATE POLICY "groups_insert_authenticated" ON public.groups
    FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "groups_update_member" ON public.groups
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = groups.id
              AND group_members.user_id  = auth.uid()
        )
    );

-- ── group_members ─────────────────────────────────────────────────────────────
-- Visible to members of the same group.

CREATE POLICY "group_members_select" ON public.group_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.group_members AS gm2
            WHERE gm2.group_id = group_members.group_id
              AND gm2.user_id  = auth.uid()
        )
    );

CREATE POLICY "group_members_insert_member" ON public.group_members
    FOR INSERT WITH CHECK (
        -- Only existing members can add new members
        EXISTS (
            SELECT 1 FROM public.group_members AS gm2
            WHERE gm2.group_id = group_members.group_id
              AND gm2.user_id  = auth.uid()
        )
        OR
        -- Or the group creator is adding themselves as the first member
        EXISTS (
            SELECT 1 FROM public.groups
            WHERE groups.id         = group_members.group_id
              AND groups.created_by = auth.uid()
        )
    );

-- ── expenses ──────────────────────────────────────────────────────────────────
-- Visible only to members of the expense's group.

CREATE POLICY "expenses_select_group_member" ON public.expenses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = expenses.group_id
              AND group_members.user_id  = auth.uid()
        )
    );

CREATE POLICY "expenses_insert_group_member" ON public.expenses
    FOR INSERT WITH CHECK (
        paid_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_members.group_id = expenses.group_id
              AND group_members.user_id  = auth.uid()
        )
    );

-- ── expense_splits ────────────────────────────────────────────────────────────
-- Visible to members of the split's expense's group.

CREATE POLICY "expense_splits_select_group_member" ON public.expense_splits
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.expenses
            JOIN public.group_members
              ON group_members.group_id = expenses.group_id
             AND group_members.user_id  = auth.uid()
            WHERE expenses.id = expense_splits.expense_id
        )
    );

CREATE POLICY "expense_splits_insert_group_member" ON public.expense_splits
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.expenses
            JOIN public.group_members
              ON group_members.group_id = expenses.group_id
             AND group_members.user_id  = auth.uid()
            WHERE expenses.id = expense_splits.expense_id
        )
    );

-- Only the debtor themselves (or group members) can mark their split settled
CREATE POLICY "expense_splits_update_settled" ON public.expense_splits
    FOR UPDATE USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.expenses
            JOIN public.group_members
              ON group_members.group_id = expenses.group_id
             AND group_members.user_id  = auth.uid()
            WHERE expenses.id = expense_splits.expense_id
        )
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: helpful for local dev (Supabase Studio)
-- Remove or gate with IF NOT EXISTS checks before production
-- ─────────────────────────────────────────────────────────────────────────────

-- (no seed data in migration — use supabase/seed.sql for that)
