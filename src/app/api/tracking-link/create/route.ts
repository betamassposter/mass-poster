import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { createTrackingLink } from '@/lib/analytics/tracking-link';

const schema = z.object({
  brand_id: z.uuid(),
  offer_id: z.uuid().optional(),
  target_url: z.url(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);
    const supabase = getSupabaseAdmin();
    const link = await createTrackingLink(supabase, CURRENT_WORKSPACE_ID, parsed);
    const origin = new URL(req.url).origin;
    return NextResponse.json({
      ok: true,
      link,
      short_url: `${origin}/l/${link.slug}`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request', details: z.prettifyError(err) },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
