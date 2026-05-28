import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { AccountOrchestrator } from '@/lib/accounts/orchestrator';

const schema = z.object({
  brand_id: z.uuid(),
  platform: z.enum(['instagram', 'tiktok', 'youtube_shorts', 'x', 'linkedin', 'facebook']),
  country: z.string().length(2).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);
    const supabase = getSupabaseAdmin();
    const orchestrator = new AccountOrchestrator(supabase, CURRENT_WORKSPACE_ID);
    const result = await orchestrator.createAccount({
      brand_id: parsed.brand_id,
      workspace_id: CURRENT_WORKSPACE_ID,
      platform: parsed.platform,
      country: parsed.country ?? 'IT',
      origin: 'manual',
    });
    return NextResponse.json({ ok: true, ...result });
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
