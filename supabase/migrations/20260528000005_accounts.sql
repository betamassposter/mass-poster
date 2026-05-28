-- ─────────────────────────────────────────────────────────────
-- Migration 0005 — Social accounts + event log
-- ─────────────────────────────────────────────────────────────

create table public.account (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  brand_id uuid not null references public.brand(id) on delete cascade,
  platform platform not null,
  handle text not null,
  display_name text,
  bio text,
  email_alias_id uuid references public.email_alias(id) on delete set null,
  proxy_id uuid references public.proxy(id) on delete set null,
  adspower_profile_id text,
  zernio_account_id text,
  status account_status not null default 'creating',
  origin account_origin not null default 'manual',
  warmup_started_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  health_score smallint not null default 100,    -- 0-100
  daily_post_cap smallint not null default 5,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, handle)
);

create index account_brand_status_idx on public.account(brand_id, status);
create index account_workspace_idx on public.account(workspace_id);
create index account_status_active_idx on public.account(status) where status = 'active';
create index account_warmup_idx on public.account(warmup_started_at) where status = 'warmup';

create trigger account_updated_at
  before update on public.account
  for each row execute function public.set_updated_at();

-- Backfill: ora che account esiste possiamo aggiungere il FK su email_alias
alter table public.email_alias
  add constraint email_alias_account_fk
  foreign key (assigned_account_id) references public.account(id) on delete set null;

-- Stesso per proxy
alter table public.proxy
  add constraint proxy_account_fk
  foreign key (assigned_account_id) references public.account(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- Event log per account (per debug + ban analysis)
-- ─────────────────────────────────────────────────────────────

create table public.account_event (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.account(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  event_type text not null,
  -- 'login', 'post', 'warmup_action', 'rate_limit', 'ban_detected',
  -- 'shadowban_suspected', 'otp_received', 'profile_update', 'health_check'
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index account_event_account_idx on public.account_event(account_id, occurred_at desc);
create index account_event_type_idx on public.account_event(event_type, occurred_at desc);
