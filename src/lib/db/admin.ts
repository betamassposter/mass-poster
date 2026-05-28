import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types.ts';
import { env, requireEnv } from '../env.ts';

// We keep `Database` for IDE hints downstream where Tables are typed,
// but the client is typed as the untyped union to avoid the "never row"
// problem caused by simplified hand-written Database types interacting
// with @supabase/supabase-js select-type inference.
let _admin: SupabaseClient | null = null;

// Re-export Database type so it stays referenced.
export type { Database };

/**
 * Supabase admin client (service_role) — BYPASS RLS.
 *
 * Da usare SOLO in:
 *  - Worker / job processor
 *  - Webhook handlers che scrivono dati senza utente loggato
 *  - Script CLI (scripts/)
 *
 * MAI dal browser o da Server Components/Actions con user context.
 *
 * Quando lo usi, DEVI manualmente filtrare per workspace_id nelle query.
 */
export function getSupabaseAdmin() {
  if (_admin) return _admin;

  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  _admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _admin;
}
