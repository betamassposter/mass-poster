-- ─────────────────────────────────────────────────────────────
-- Migration 0012 — Multilogin Cloud Phones + Mobile Proxies +
-- IP reputation gate (zerobounce + browserleaks-equivalent).
--
-- Pivot: AdsPower → Multilogin Cloud Phones. The adspower_profile_id
-- column is kept as legacy field; new accounts use multilogin_profile_id
-- and cloud_phone_id.
--
-- Every proxy must pass a 2-source IP reputation check before being
-- bound to an account. Validation history is logged per-run.
-- ─────────────────────────────────────────────────────────────

-- New enum for proxy validation status (composite of zerobounce + browserleaks)
create type proxy_validation_status as enum (
  'pending',     -- never validated
  'validating',  -- check in progress
  'clean',       -- 100% clean on both providers
  'dirty',       -- failed at least one signal
  'error'        -- check provider unreachable
);

-- New enum for the warmup stage (drives the warmup playbook)
create type account_warmup_stage as enum (
  'idle',             -- day 0 — account exists, no actions
  'passive_view',     -- day 1-2 — view niche content only
  'light_engagement', -- day 3-4 — sparse likes + comments
  'profile_setup',    -- day 4-5 — bio + profile pic
  'posting_pilot',    -- day 5-7 — small, infrequent posts
  'active'            -- day 7+ — full content automation
);

-- ─────────────────────────────────────────────────────────────
-- Extend `proxy` table with mobile-proxy + reputation fields
-- ─────────────────────────────────────────────────────────────
alter table public.proxy
  add column if not exists multilogin_proxy_id text,           -- vendor proxy id
  add column if not exists proxy_type text default 'mobile',   -- mobile | residential | datacenter
  add column if not exists ip_address inet,                    -- last-observed egress IP
  add column if not exists asn integer,                        -- autonomous system number
  add column if not exists asn_org text,                       -- ASN organization name
  add column if not exists is_residential boolean,             -- residential / mobile vs datacenter
  add column if not exists validation_status proxy_validation_status not null default 'pending',
  add column if not exists last_validated_at timestamptz,
  add column if not exists last_validation_summary jsonb,      -- {clean: bool, signals: {...}}
  add column if not exists rotation_count integer not null default 0;

create index if not exists proxy_validation_status_idx on public.proxy(workspace_id, validation_status);
create index if not exists proxy_country_idx on public.proxy(workspace_id, country, status) where status = 'available';

-- ─────────────────────────────────────────────────────────────
-- Extend `account` table with Multilogin + warmup fields
-- ─────────────────────────────────────────────────────────────
alter table public.account
  add column if not exists multilogin_profile_id text,         -- Multilogin profile id
  add column if not exists cloud_phone_id text,                -- Multilogin Cloud Phone instance id
  add column if not exists warmup_stage account_warmup_stage not null default 'idle',
  add column if not exists warmup_stage_started_at timestamptz default now();

create index if not exists account_warmup_stage_idx on public.account(workspace_id, warmup_stage);

-- ─────────────────────────────────────────────────────────────
-- Validation log — every reputation check is appended here.
-- Used to debug dirty IPs and to compute trend (e.g. proxy degrading).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.proxy_validation_check (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  proxy_id uuid not null references public.proxy(id) on delete cascade,
  -- Aggregate verdict from THIS run.
  verdict proxy_validation_status not null,
  -- Snapshot of the egress IP during this check.
  ip_address inet,
  -- Each row from each provider — array of {provider, clean, score, signals, raw}.
  results jsonb not null default '[]'::jsonb,
  -- Why we ran this check: 'initial_allocation', 'scheduled_recheck', 'manual', 'pre_assignment'.
  reason text not null,
  -- ms taken across all providers.
  duration_ms integer,
  checked_at timestamptz not null default now()
);

create index proxy_validation_check_proxy_idx on public.proxy_validation_check(proxy_id, checked_at desc);
create index proxy_validation_check_workspace_idx on public.proxy_validation_check(workspace_id, checked_at desc);

-- ─────────────────────────────────────────────────────────────
-- Brand-level country preference: which country the proxy pool
-- should target for accounts under this brand.
-- ─────────────────────────────────────────────────────────────
alter table public.brand
  add column if not exists target_country text default 'IT',     -- ISO 3166-1 alpha-2
  add column if not exists proxy_country_override text;          -- optional override, else target_country
