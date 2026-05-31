-- ─────────────────────────────────────────────────────────────
-- Migration 0013 — IP reputation cache.
--
-- AbuseIPDB free tier is 1000 checks/day. Every revalidation of
-- the same proxy IP would burn a credit. This cache stores the
-- last result per (ip, provider) tuple with a configurable TTL
-- (default 24h). Callers SHOULD check the cache before hitting
-- the vendor API.
--
-- Workspace-scoped: distinct workspaces don't share cache entries
-- because their proxies and their definition of "clean" may diverge.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.ip_reputation_cache (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  -- Provider name matches IpReputationProvider.name (e.g. 'abuseipdb').
  provider text not null,
  ip_address inet not null,
  clean boolean not null,
  score smallint,                       -- 0-100, higher = better
  signals jsonb not null default '{}'::jsonb,
  raw jsonb,                            -- vendor response for debugging
  checked_at timestamptz not null default now(),
  -- expires_at is denormalized so a single index scan finds fresh rows.
  expires_at timestamptz not null
);

-- One row per (workspace, provider, ip) — newer writes replace older.
create unique index if not exists ip_reputation_cache_unique_idx
  on public.ip_reputation_cache(workspace_id, provider, ip_address);

-- Fast lookups for "do we have a fresh result for this ip?"
create index if not exists ip_reputation_cache_lookup_idx
  on public.ip_reputation_cache(workspace_id, provider, ip_address, expires_at desc);

-- Housekeeping: a background job (or simple cron) prunes expired rows.
-- Plain index on expires_at — partial index with `where expires_at < now()`
-- isn't allowed because now() is not IMMUTABLE.
create index if not exists ip_reputation_cache_expires_at_idx
  on public.ip_reputation_cache(expires_at);

-- RLS: workspace-scoped read for members; writes only via service_role.
alter table public.ip_reputation_cache enable row level security;

create policy "ip_reputation_cache_select_member"
  on public.ip_reputation_cache for select
  using (
    workspace_id in (
      select workspace_id from public.workspace_member where user_id = auth.uid()
    )
  );
