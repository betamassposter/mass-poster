import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth middleware.
 *
 * Public routes (no auth): /login, /auth/*, /l/* (tracking link redirect)
 * All others: must have a valid Supabase session, otherwise → /login.
 *
 * Also refreshes the session cookie on every request (standard SSR pattern).
 */

const PUBLIC_PREFIXES = ['/login', '/auth', '/l/', '/_next', '/favicon'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // DEV BYPASS: skip auth entirely when DISABLE_AUTH=true (used to bypass
  // Supabase magic-link email rate limits during early dogfood).
  if (process.env.DISABLE_AUTH === 'true') {
    return NextResponse.next();
  }

  // Public routes (and static / framework paths) skip auth check.
  if (PUBLIC_PREFIXES.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Always start a response we can mutate to set refreshed cookies.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: refreshes the session cookie if expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = `?return_to=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Match all routes except static assets/images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)'],
};
