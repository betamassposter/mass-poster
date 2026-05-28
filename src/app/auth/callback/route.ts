import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseRouteClient } from '@/lib/auth/session';

/**
 * Magic-link callback: Supabase redirects here after the user clicks the
 * link in their inbox. The URL contains either:
 *  - a `code` query param (PKCE flow) → exchange for session
 *  - or fragment-based tokens (implicit flow) → handled by Supabase JS lib
 *
 * After session is set we redirect to `return_to` (default `/`).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const returnTo = url.searchParams.get('return_to') ?? '/';

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent('Missing auth code')}`, req.url),
    );
  }

  const supabase = await getSupabaseRouteClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, req.url),
    );
  }

  return NextResponse.redirect(new URL(returnTo, req.url));
}
