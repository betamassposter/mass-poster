import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '../env.ts';

/**
 * Server-side session helpers.
 *
 * - `getSession()` returns the current user or null (no throw).
 * - `requireSession()` redirects to /login if no session — use in protected pages.
 * - `getSupabaseRouteClient()` returns a Supabase client wired with the cookie
 *   store, RLS-aware via the user's JWT.
 *
 * NOTE: keep the service_role client (`getSupabaseAdmin`) separate — it
 * BYPASSES RLS and is only for workers / scheduler. RLS-aware client is the
 * default for user-driven routes.
 */

export async function getSupabaseRouteClient() {
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component context — cookies are immutable here.
          }
        },
      },
    },
  );
}

export interface AuthSession {
  user_id: string;
  email: string;
  workspace_ids: string[];
}

/**
 * DEV BYPASS: when DISABLE_AUTH=true is set, getSession + requireSession both
 * return a fake session anchored to the default workspace. Used to skip
 * Supabase magic-link email rate limits during early dogfood. Never set on
 * a production deploy with real user data.
 */
const FAKE_SESSION: AuthSession = {
  user_id: '00000000-0000-0000-0000-000000000001',
  email: 'dev@local',
  workspace_ids: ['11111111-1111-1111-1111-111111111111'],
};

export async function getSession(): Promise<AuthSession | null> {
  if (process.env.DISABLE_AUTH === 'true') return FAKE_SESSION;

  const supabase = await getSupabaseRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch workspaces this user belongs to (via RLS-aware client →
  // returns only workspace_member rows for this auth.uid())
  const { data: memberships } = await supabase
    .from('workspace_member')
    .select('workspace_id');

  return {
    user_id: user.id,
    email: user.email ?? '',
    workspace_ids: (memberships ?? []).map((m) => m.workspace_id),
  };
}

export async function requireSession(returnTo?: string): Promise<AuthSession> {
  if (process.env.DISABLE_AUTH === 'true') return FAKE_SESSION;
  const session = await getSession();
  if (!session) {
    const qs = returnTo
      ? `?return_to=${encodeURIComponent(returnTo)}`
      : '';
    redirect(`/login${qs}`);
  }
  return session;
}
