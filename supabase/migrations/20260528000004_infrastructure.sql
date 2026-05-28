-- ─────────────────────────────────────────────────────────────
-- Migration 0004 — Infrastructure (domini, email aliases, proxy)
-- ─────────────────────────────────────────────────────────────

create table public.domain (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  domain text not null,
  cloudflare_zone_id text,
  forward_email_configured boolean not null default false,
  dns_records jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, domain)
);

create index domain_workspace_idx on public.domain(workspace_id);

create trigger domain_updated_at
  before update on public.domain
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Email aliases generati on-demand
-- ─────────────────────────────────────────────────────────────

create table public.email_alias (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  domain_id uuid not null references public.domain(id) on delete cascade,
  local_part text not null,
  -- forwards_to = mailbox centrale (Gmail dedicata)
  forwards_to text not null,
  -- assigned_account_id si popola quando l'alias viene usato per un signup
  assigned_account_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain_id, local_part)
);

create index email_alias_domain_idx on public.email_alias(domain_id);
create index email_alias_account_idx on public.email_alias(assigned_account_id) where assigned_account_id is not null;

create trigger email_alias_updated_at
  before update on public.email_alias
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Proxy pool (residenziali 1:1 con account)
-- ─────────────────────────────────────────────────────────────

create table public.proxy (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  provider text not null,                          -- 'iproyal', 'soax', 'brightdata'
  host text not null,
  port integer not null,
  username text,
  password_encrypted text,                         -- usare pgsodium per cifrare
  country text,
  city text,
  status proxy_status not null default 'available',
  assigned_account_id uuid,                        -- FK soft, niente cascade
  last_health_check timestamptz,
  health_score smallint not null default 100,     -- 0-100
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proxy_workspace_status_idx on public.proxy(workspace_id, status);
create unique index proxy_assigned_unique on public.proxy(assigned_account_id) where assigned_account_id is not null;

create trigger proxy_updated_at
  before update on public.proxy
  for each row execute function public.set_updated_at();
