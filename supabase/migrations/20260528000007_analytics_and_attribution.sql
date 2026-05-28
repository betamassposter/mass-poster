-- ─────────────────────────────────────────────────────────────
-- Migration 0007 — Tracking links + Conversions (attribution)
-- ─────────────────────────────────────────────────────────────

create table public.tracking_link (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  brand_id uuid not null references public.brand(id) on delete cascade,
  offer_id uuid references public.offer(id) on delete set null,

  slug text not null unique,                       -- es. 'abc123' → mp.link/abc123
  target_url text not null,                        -- destinazione finale (incl. UTM)
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,                                -- spesso = account_handle o post_id

  clicks integer not null default 0,               -- denormalizzato (verità su PostHog)
  conversions integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tracking_link_brand_idx on public.tracking_link(brand_id);
create index tracking_link_offer_idx on public.tracking_link(offer_id);

create trigger tracking_link_updated_at
  before update on public.tracking_link
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Conversions
-- ─────────────────────────────────────────────────────────────

create table public.conversion (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  tracking_link_id uuid references public.tracking_link(id) on delete set null,
  offer_id uuid references public.offer(id) on delete set null,
  account_id uuid references public.account(id) on delete set null,    -- chi ha attratto

  event_type conversion_event not null,
  value_eur numeric(10, 2) not null default 0,
  posthog_event_id text,
  metadata jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now()
);

create index conversion_workspace_occurred_idx on public.conversion(workspace_id, occurred_at desc);
create index conversion_offer_idx on public.conversion(offer_id, occurred_at desc);
create index conversion_link_idx on public.conversion(tracking_link_id);
