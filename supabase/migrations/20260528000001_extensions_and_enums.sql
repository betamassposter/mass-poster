-- ─────────────────────────────────────────────────────────────
-- Mass Poster — Migration 0001
-- Extensions + Enums (foundation)
-- ─────────────────────────────────────────────────────────────

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";    -- per full-text future

-- ─────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────

create type workspace_plan as enum ('internal', 'starter', 'pro', 'scale');

create type member_role as enum ('owner', 'admin', 'editor', 'viewer');

create type brand_status as enum ('draft', 'active', 'paused', 'archived');

create type offer_type as enum ('saas', 'ecommerce', 'digital_product', 'community', 'other');

create type platform as enum ('instagram', 'tiktok', 'youtube_shorts', 'x', 'linkedin', 'facebook');

create type account_status as enum ('creating', 'warmup', 'active', 'shadowbanned', 'banned', 'retired');

create type account_origin as enum ('manual', 'browser_use_auto');

create type proxy_status as enum ('available', 'in_use', 'dead');

create type content_type as enum ('reel', 'short', 'carousel', 'image', 'text_only');

create type content_status as enum ('draft', 'generated', 'approved', 'published', 'archived', 'rejected');

create type post_status as enum ('scheduled', 'publishing', 'published', 'failed', 'retracted');

create type posting_provider as enum ('zernio', 'browser_use', 'manual');

create type job_status as enum ('queued', 'running', 'success', 'failed');

create type job_type as enum (
  'generate_content',
  'edit_video',
  'publish_post',
  'warmup_action',
  'metrics_pull',
  'health_check',
  'email_alias_create',
  'account_create'
);

create type conversion_event as enum ('signup', 'trial', 'purchase', 'demo_booked');

-- ─────────────────────────────────────────────────────────────
-- HELPER FUNCTION: updated_at trigger
-- ─────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
