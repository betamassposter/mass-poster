import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types.ts';
import { env } from '../env.ts';

/**
 * Supabase server client RLS-aware.
 * Da usare in:
 *  - Server Components
 *  - Route Handlers
 *  - Server Actions
 *
 * NON da usare in worker / job processor (usa `getSupabaseAdmin` invece).
 *
 * Tutte le query passano attraverso RLS, quindi vedono solo i dati
 * del workspace di cui l'utente è membro.
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component: ignore set errors (cookies are immutable here)
          }
        },
      },
    },
  );
}
