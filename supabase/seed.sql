-- ─────────────────────────────────────────────────────────────
-- Seed minimo per development
-- NOTE: questo viene applicato da `supabase db reset --local`.
-- Per il primo bootstrap in dev: rimpiazza l'UUID di esempio con
-- l'auth.users id del tuo utente reale dopo signup.
-- ─────────────────────────────────────────────────────────────

-- Workspace di Daniele (placeholder owner_user_id verrà aggiornato post-signup)
insert into public.workspace (id, name, plan, monthly_budget_eur)
values (
  '11111111-1111-1111-1111-111111111111',
  'Daniele · Internal',
  'internal',
  250
)
on conflict (id) do nothing;

-- NOTE: workspace_member va inserito MANUALMENTE dopo il primo signup
-- (via Supabase dashboard o supabase auth user create), perché serve
-- un auth.users.id valido. Esempio:
--
--   insert into public.workspace_member (workspace_id, user_id, role)
--   values ('11111111-1111-1111-1111-111111111111', '<your-auth-uid>', 'owner');
--
-- Per ora lo lasciamo manuale; al Blocco 11 (auth) lo automatizziamo.
