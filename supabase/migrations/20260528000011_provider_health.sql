-- ─────────────────────────────────────────────────────────────
-- Migration 0011 — Provider health monitoring + Webhooks + API keys
-- ─────────────────────────────────────────────────────────────

-- Provider health (Layer 13 — SLA + failover)
create table public.provider_health (
  provider text primary key,
  category text not null,
  status text not null check (status in ('healthy', 'degraded', 'down')),
  latency_ms int not null default 0,
  consecutive_failures int not null default 0,
  last_check_at timestamptz not null default now(),
  circuit_state text not null default 'CLOSED',
  last_error text
);

create index provider_health_status_idx on public.provider_health(status);

-- Webhook subscriptions (Layer 15)
create table public.webhook_subscription (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  url text not null,
  event_types text[] not null default array[]::text[],
  -- ['post.published', 'post.failed', 'account.banned', 'content.generated', 'viral.detected', ...]
  secret text not null,  -- HMAC-SHA256 signing secret (32 random chars)
  enabled boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_delivery_at timestamptz,
  last_delivery_status text,  -- 'ok' | 'failed' | null
  consecutive_failures int not null default 0
);

create index webhook_workspace_idx on public.webhook_subscription(workspace_id, enabled);

create trigger webhook_subscription_updated_at
  before update on public.webhook_subscription
  for each row execute function public.set_updated_at();

-- Webhook delivery log (audit + replay)
create table public.webhook_delivery (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.webhook_subscription(id) on delete cascade,
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  http_status int,
  response_body text,
  delivered_at timestamptz not null default now(),
  ok boolean not null default false,
  attempts int not null default 1
);

create index webhook_delivery_webhook_idx on public.webhook_delivery(webhook_id, delivered_at desc);
create index webhook_delivery_event_idx on public.webhook_delivery(event_type, delivered_at desc);

-- API keys (Layer 15 — public API auth)
create table public.api_key (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  name text not null,                        -- "production", "test", "n8n-integration"
  key_prefix text not null,                  -- first 8 chars for identification "mp_live_xxxxxxxx"
  key_hash text not null,                    -- sha256(full key) — we store hash, not key
  scopes text[] not null default array['read']::text[],
  -- ['read', 'write', 'admin']
  enabled boolean not null default true,
  last_used_at timestamptz,
  expires_at timestamptz,                    -- null = no expiry
  created_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null
);

create unique index api_key_hash_idx on public.api_key(key_hash);
create index api_key_workspace_idx on public.api_key(workspace_id);
create index api_key_prefix_idx on public.api_key(key_prefix);

-- RLS
alter table public.provider_health enable row level security;
alter table public.webhook_subscription enable row level security;
alter table public.webhook_delivery enable row level security;
alter table public.api_key enable row level security;

-- provider_health: readable by any authenticated user (it's not workspace-scoped — global infra)
create policy provider_health_select on public.provider_health
  for select using (auth.uid() is not null);

-- webhook_subscription: workspace-scoped
create policy webhook_sub_all on public.webhook_subscription
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy webhook_delivery_select on public.webhook_delivery
  for select using (public.is_workspace_member(workspace_id));

-- api_key: workspace owners/admins only
create policy api_key_select on public.api_key
  for select using (
    exists (
      select 1 from public.workspace_member
      where workspace_id = api_key.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
create policy api_key_insert on public.api_key
  for insert with check (
    exists (
      select 1 from public.workspace_member
      where workspace_id = api_key.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
create policy api_key_update on public.api_key
  for update using (
    exists (
      select 1 from public.workspace_member
      where workspace_id = api_key.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
create policy api_key_delete on public.api_key
  for delete using (
    exists (
      select 1 from public.workspace_member
      where workspace_id = api_key.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
