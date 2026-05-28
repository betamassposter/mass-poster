-- ─────────────────────────────────────────────────────────────
-- Migration 0008 — Job queue + audit log
-- ─────────────────────────────────────────────────────────────

create table public.job (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  brand_id uuid references public.brand(id) on delete set null,

  type job_type not null,
  status job_status not null default 'queued',

  payload jsonb not null default '{}'::jsonb,
  result jsonb,

  attempts smallint not null default 0,
  max_attempts smallint not null default 3,
  last_error text,

  -- scheduling
  run_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,

  -- linkage al risultato (per re-fetch)
  produced_content_id uuid references public.content(id) on delete set null,
  produced_post_id uuid references public.post(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_queue_idx on public.job(status, run_at) where status in ('queued', 'running');
create index job_workspace_type_idx on public.job(workspace_id, type, created_at desc);

create trigger job_updated_at
  before update on public.job
  for each row execute function public.set_updated_at();

-- Aggiungo FK su content per chiudere il cerchio
alter table public.content
  add constraint content_job_fk
  foreign key (generated_by_job_id) references public.job(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- Audit log (per debug e compliance)
-- ─────────────────────────────────────────────────────────────

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspace(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,

  action text not null,                          -- 'brand.create', 'account.ban', ...
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,

  occurred_at timestamptz not null default now()
);

create index audit_workspace_occurred_idx on public.audit_log(workspace_id, occurred_at desc);
create index audit_actor_idx on public.audit_log(actor_user_id, occurred_at desc);
