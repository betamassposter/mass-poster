-- ─────────────────────────────────────────────────────────────
-- Migration 0009 — Row Level Security (multi-tenancy enforcement)
-- ─────────────────────────────────────────────────────────────

-- Abilita RLS su tutte le tabelle tenant
alter table public.workspace                  enable row level security;
alter table public.workspace_member           enable row level security;
alter table public.workspace_credential       enable row level security;
alter table public.brand                      enable row level security;
alter table public.offer                      enable row level security;
alter table public.domain                     enable row level security;
alter table public.email_alias                enable row level security;
alter table public.proxy                      enable row level security;
alter table public.account                    enable row level security;
alter table public.account_event              enable row level security;
alter table public.content                    enable row level security;
alter table public.post                       enable row level security;
alter table public.metric_snapshot            enable row level security;
alter table public.tracking_link              enable row level security;
alter table public.conversion                 enable row level security;
alter table public.job                        enable row level security;
alter table public.audit_log                  enable row level security;

-- ─────────────────────────────────────────────────────────────
-- WORKSPACE
-- ─────────────────────────────────────────────────────────────

create policy ws_select on public.workspace
  for select using (public.is_workspace_member(id));

create policy ws_insert on public.workspace
  for insert with check (owner_user_id = auth.uid());

create policy ws_update on public.workspace
  for update using (
    exists (
      select 1 from public.workspace_member
      where workspace_id = workspace.id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- WORKSPACE_MEMBER: solo membri vedono i membri del proprio workspace
create policy wsm_select on public.workspace_member
  for select using (public.is_workspace_member(workspace_id));

create policy wsm_insert on public.workspace_member
  for insert with check (
    -- solo owner/admin può aggiungere membri
    exists (
      select 1 from public.workspace_member wsm
      where wsm.workspace_id = workspace_member.workspace_id
        and wsm.user_id = auth.uid()
        and wsm.role in ('owner', 'admin')
    )
    -- oppure: il primo membro (owner del workspace neonato)
    or not exists (
      select 1 from public.workspace_member
      where workspace_id = workspace_member.workspace_id
    )
  );

create policy wsm_delete on public.workspace_member
  for delete using (
    exists (
      select 1 from public.workspace_member wsm
      where wsm.workspace_id = workspace_member.workspace_id
        and wsm.user_id = auth.uid()
        and wsm.role in ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- TABELLE TENANT — pattern uniforme
-- ─────────────────────────────────────────────────────────────

-- Helper macro: tutte queste tabelle hanno workspace_id e si appoggiano a is_workspace_member()

-- workspace_credential
create policy wsc_all on public.workspace_credential
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- brand
create policy brand_all on public.brand
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- offer
create policy offer_all on public.offer
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- domain
create policy domain_all on public.domain
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- email_alias
create policy email_alias_all on public.email_alias
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- proxy
create policy proxy_all on public.proxy
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- account
create policy account_all on public.account
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- account_event
create policy account_event_all on public.account_event
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- content
create policy content_all on public.content
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- post
create policy post_all on public.post
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- metric_snapshot (read-only per editor, scrive solo service role)
create policy metric_select on public.metric_snapshot
  for select using (public.is_workspace_member(workspace_id));

-- tracking_link
create policy tracking_link_all on public.tracking_link
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- conversion (read-only via client)
create policy conversion_select on public.conversion
  for select using (public.is_workspace_member(workspace_id));

-- job (read-only via client, scrive worker via service role)
create policy job_select on public.job
  for select using (public.is_workspace_member(workspace_id));

-- audit_log (read-only via client per admin)
create policy audit_select on public.audit_log
  for select using (
    exists (
      select 1 from public.workspace_member
      where workspace_id = audit_log.workspace_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
