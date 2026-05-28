import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { brandConfigSchema, offerSchema } from '@/lib/brand/schema';

const createSchema = brandConfigSchema.extend({
  offer: offerSchema.optional(),
});

export async function POST(req: Request) {
  await requireSession();
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    const supabase = getSupabaseAdmin();

    // Check slug uniqueness
    const { data: existing } = await supabase
      .from('brand')
      .select('id')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .eq('slug', parsed.slug)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: `Slug "${parsed.slug}" already exists` }, { status: 409 });
    }

    const { data: brand, error } = await supabase
      .from('brand')
      .insert({
        workspace_id: CURRENT_WORKSPACE_ID,
        slug: parsed.slug,
        name: parsed.name,
        niche: parsed.niche,
        voice_config: parsed.voice_config,
        target_personas: parsed.target_personas,
        default_platforms: parsed.default_platforms,
        status: parsed.status,
        target_country: parsed.target_country,
      })
      .select('id')
      .single();
    if (error || !brand) throw new Error(error?.message ?? 'Insert failed');

    if (parsed.offer) {
      const { error: offerErr } = await supabase.from('offer').insert({
        workspace_id: CURRENT_WORKSPACE_ID,
        brand_id: brand.id,
        type: parsed.offer.type,
        name: parsed.offer.name,
        url: parsed.offer.url,
        tracking_base_url: parsed.offer.tracking_base_url,
        pitch_1_sentence: parsed.offer.pitch_1_sentence,
        pitch_3_sentences: parsed.offer.pitch_3_sentences,
        pitch_1_paragraph: parsed.offer.pitch_1_paragraph,
        cta_collection: parsed.offer.cta_collection,
        pricing_info: parsed.offer.pricing_info,
        is_primary: parsed.offer.is_primary,
        active: parsed.offer.active,
      });
      if (offerErr) console.warn('Offer insert failed:', offerErr.message);
    }

    return NextResponse.json({ ok: true, brand_id: brand.id, slug: parsed.slug });
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
