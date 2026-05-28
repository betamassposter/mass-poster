-- ─────────────────────────────────────────────────────────────
-- Migration 0006 — Content (idee/asset) + Post (istanze pubblicate)
-- ─────────────────────────────────────────────────────────────

create table public.content (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  brand_id uuid not null references public.brand(id) on delete cascade,
  offer_id uuid references public.offer(id) on delete set null,

  type content_type not null,
  status content_status not null default 'draft',

  hook text,
  script text,
  caption text,
  hashtags text[] not null default array[]::text[],

  -- assets: {video_url, voice_url, image_urls[], final_edit_url, thumbnail_url}
  assets jsonb not null default '{}'::jsonb,

  -- generation_meta: {claude_model, claude_tokens_in, claude_tokens_out,
  --                   fal_model, fal_cost, elevenlabs_voice_id, elevenlabs_cost,
  --                   ffmpeg_duration_s, total_cost_eur, generated_at}
  generation_meta jsonb not null default '{}'::jsonb,

  cost_eur numeric(10, 4) not null default 0,
  generated_by_job_id uuid,    -- FK soft, niente cascade

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_brand_status_idx on public.content(brand_id, status, created_at desc);
create index content_workspace_idx on public.content(workspace_id);

create trigger content_updated_at
  before update on public.content
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Post — istanza di un content pubblicata su uno specifico account
-- ─────────────────────────────────────────────────────────────

create table public.post (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  content_id uuid not null references public.content(id) on delete cascade,
  account_id uuid not null references public.account(id) on delete cascade,

  scheduled_at timestamptz not null,
  published_at timestamptz,

  platform_post_id text,
  platform_post_url text,

  status post_status not null default 'scheduled',
  posting_provider posting_provider not null default 'zernio',

  -- variante caption/hashtag specifica per quest'account (anti-duplicate)
  caption_variant text,
  hashtags_variant text[],

  error_log jsonb,
  retries smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_scheduled_idx on public.post(scheduled_at, status) where status in ('scheduled', 'publishing');
create index post_account_idx on public.post(account_id, published_at desc);
create index post_content_idx on public.post(content_id);
create index post_workspace_idx on public.post(workspace_id);

create trigger post_updated_at
  before update on public.post
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Metric snapshots — polled ogni X ore via job
-- ─────────────────────────────────────────────────────────────

create table public.metric_snapshot (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace(id) on delete cascade,
  post_id uuid not null references public.post(id) on delete cascade,

  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  follows_gained integer not null default 0,

  pulled_at timestamptz not null default now()
);

create index metric_post_pulled_idx on public.metric_snapshot(post_id, pulled_at desc);
create index metric_workspace_idx on public.metric_snapshot(workspace_id, pulled_at desc);
