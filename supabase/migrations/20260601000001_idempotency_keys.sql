-- ─────────────────────────────────────────────────────────────
-- Migration 0014 — Idempotency keys for create-account + schedule-post.
--
-- Pattern: caller passes a client-generated UUID (idempotency_key). If the
-- orchestrator already produced a row with that key, it returns the existing
-- row instead of inserting a duplicate. Critical for the scheduler's tick
-- retry loop and for any UI flow that may double-fire on bad network.
--
-- Why not a dedicated idempotency_keys table: with one row to look up per
-- entity, a partial unique index on the entity itself is simpler + faster
-- and avoids a 2-phase write.
-- ─────────────────────────────────────────────────────────────

-- Account creation idempotency
alter table public.account
  add column if not exists idempotency_key uuid;

create unique index if not exists account_idempotency_key_unique_idx
  on public.account(workspace_id, idempotency_key)
  where idempotency_key is not null;

-- Post scheduling idempotency
alter table public.post
  add column if not exists idempotency_key uuid;

create unique index if not exists post_idempotency_key_unique_idx
  on public.post(workspace_id, idempotency_key)
  where idempotency_key is not null;
