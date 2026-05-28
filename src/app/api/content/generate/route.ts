import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { getTextProvider } from '@/lib/ai/client';
import { ContentPipeline } from '@/lib/ai/pipeline';

const requestSchema = z.object({
  brand_slug: z.string().min(1),
  count: z.number().int().min(1).max(10).default(3),
  platform: z
    .enum(['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'x'])
    .default('instagram'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { brand_slug, count, platform } = requestSchema.parse(body);

    const supabase = getSupabaseAdmin();
    const provider = getTextProvider();
    const pipeline = new ContentPipeline(supabase, provider, CURRENT_WORKSPACE_ID);

    const result = await pipeline.generateForBrand(brand_slug, {
      count,
      platform,
      persist: true,
    });

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      inserted_count: result.inserted_content_ids.length,
      cost_eur: result.cost_eur,
      duration_ms: result.duration_ms,
      cache_read_pct: result.cache_read_pct,
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
