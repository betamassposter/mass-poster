import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { authenticateRequest } from '../auth';
import { ContentPipeline } from '@/lib/ai/pipeline';
import { getTextProvider } from '@/lib/ai/client';

/**
 * Public API: list + create content.
 *
 * GET  /api/v1/content?brand=<slug>&limit=20
 * POST /api/v1/content        body: { brand_slug, count, platform }
 *
 * Auth: Bearer <mp_live_...>. Scope: read for GET, write for POST.
 */

export async function GET(req: Request) {
  const auth = await authenticateRequest(req, 'read');
  if (auth instanceof NextResponse) return auth;
  const { record } = auth;

  const url = new URL(req.url);
  const brand = url.searchParams.get('brand');
  const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '20', 10));

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('content')
    .select('id, brand_id, hook, caption, hashtags, status, created_at, generation_meta, cost_eur')
    .eq('workspace_id', record.workspace_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (brand) {
    const { data: brandRow } = await supabase
      .from('brand')
      .select('id')
      .eq('workspace_id', record.workspace_id)
      .eq('slug', brand)
      .maybeSingle();
    if (!brandRow) {
      return NextResponse.json({ error: `Brand "${brand}" not found` }, { status: 404 });
    }
    query = query.eq('brand_id', brandRow.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

const postSchema = z.object({
  brand_slug: z.string().min(1),
  count: z.number().int().min(1).max(10).default(3),
  platform: z.enum(['instagram', 'tiktok', 'youtube_shorts', 'x', 'linkedin']).default('instagram'),
});

export async function POST(req: Request) {
  const auth = await authenticateRequest(req, 'write');
  if (auth instanceof NextResponse) return auth;
  const { record } = auth;

  try {
    const body = await req.json();
    const parsed = postSchema.parse(body);
    const supabase = getSupabaseAdmin();
    const provider = getTextProvider();
    const pipeline = new ContentPipeline(supabase, provider, record.workspace_id);

    const result = await pipeline.generateForBrand(parsed.brand_slug, {
      count: parsed.count,
      platform: parsed.platform,
      persist: true,
    });

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      inserted_count: result.inserted_content_ids.length,
      quality_summary: result.quality_summary,
      cost_eur: result.cost_eur,
      duration_ms: result.duration_ms,
      cache_read_pct: result.cache_read_pct,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: z.prettifyError(err) },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
