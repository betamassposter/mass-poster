-- ─────────────────────────────────────────────────────────────
-- Migration 0003 — Brands + Offers (unità creative)
-- ─────────────────────────────────────────────────────────────

create table public.brand (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  slug text not null,
  name text not null,
  niche text,
  voice_config jsonb not null default '{}'::jsonb,
  -- voice_config schema (validated server-side via Zod):
  -- {
  --   tone: 'friendly'|'expert'|'edgy'|...
  --   formality: 1..5
  --   vocab_pref: string[]
  --   banned_words: string[]
  --   signature_phrases: string[]
  --   emoji_policy: 'none'|'sparse'|'heavy'
  --   pov: 'first'|'second'|'third'
  --   answers_12_questions: { q1: '...', ..., q12: '...' }
  -- }
  target_personas jsonb not null default '[]'::jsonb,
  -- target_personas: array of { name, role, painpoints[], desires[], ... }
  default_platforms platform[] not null default array['instagram', 'tiktok']::platform[],
  status brand_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index brand_workspace_idx on public.brand(workspace_id);
create index brand_status_idx on public.brand(status) where status = 'active';

create trigger brand_updated_at
  before update on public.brand
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Offers — cosa promuove il brand (può avere N offer)
-- ─────────────────────────────────────────────────────────────

create table public.offer (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  brand_id uuid not null references public.brand(id) on delete cascade,
  type offer_type not null,
  name text not null,
  url text,                                        -- landing page del prodotto
  tracking_base_url text,                          -- usato per bridge link
  pitch_1_sentence text,
  pitch_3_sentences text,
  pitch_1_paragraph text,
  cta_collection jsonb not null default '[]'::jsonb,  -- ["Try free", "Book demo", ...]
  pricing_info jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index offer_brand_idx on public.offer(brand_id);
create unique index offer_primary_per_brand on public.offer(brand_id) where is_primary = true;

create trigger offer_updated_at
  before update on public.offer
  for each row execute function public.set_updated_at();
