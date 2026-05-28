-- ─────────────────────────────────────────────────────────────
-- Migration 0002 — Workspaces (tenant root)
-- ─────────────────────────────────────────────────────────────

create table public.workspace (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  plan workspace_plan not null default 'internal',
  monthly_budget_eur numeric(10, 2) not null default 250,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspace_updated_at
  before update on public.workspace
  for each row execute function public.set_updated_at();

-- Members M2M
create table public.workspace_member (
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'editor',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_member_user_idx on public.workspace_member(user_id);

-- Helper function per RLS: ritorna true se l'utente corrente è membro del workspace
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.workspace_member
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

-- Workspace credentials (API keys cifrate per tenant)
create table public.workspace_credential (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  provider text not null,                  -- 'anthropic', 'fal', 'zernio', etc.
  label text not null,                     -- es. 'prod', 'dev-test'
  key_encrypted text not null,             -- usa Supabase Vault o pgsodium
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, label)
);

create trigger workspace_credential_updated_at
  before update on public.workspace_credential
  for each row execute function public.set_updated_at();
