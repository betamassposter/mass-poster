import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { incrementClick, resolveTrackingLink } from '@/lib/analytics/tracking-link';

/**
 * Bridge route: GET /l/<slug>
 *
 *  1. Look up the slug in `tracking_link`.
 *  2. Build the target URL with UTM parameters appended.
 *  3. Increment `clicks` (fire-and-forget; we don't block the redirect).
 *  4. 302 redirect to the target.
 *
 * Notes:
 *  - Uses the admin client because this route is unauthenticated.
 *  - When PostHog is wired (Blocco 8 second half), we'll also fire a server-side
 *    `link_click` event with referer + user_agent + utm fields.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const supabase = getSupabaseAdmin();

  const resolved = await resolveTrackingLink(supabase, slug);
  if (!resolved) {
    return new NextResponse('Link not found', { status: 404 });
  }

  // Fire-and-forget; don't block the redirect on the click counter update
  void incrementClick(supabase, resolved.link_id).catch(() => {});

  return NextResponse.redirect(resolved.target_url_with_utm, 302);
}
