import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tracking-link helpers.
 *
 * Flow:
 *  1. createLink(brand_id, offer_id, target_url, utm_fields) → unique slug
 *     stored in `tracking_link` table.
 *  2. Route `/l/[slug]` → resolves the row, appends UTM to target_url, 302
 *     redirect, increments `clicks` counter (best-effort; PostHog will be the
 *     source of truth once integrated).
 *
 * The slug format is base36(random uint64), ~10 chars, collision-resistant.
 */

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // no l/o/0/1 ambiguous
const SLUG_LEN = 10;

function generateSlug(): string {
  let out = '';
  for (let i = 0; i < SLUG_LEN; i++) {
    out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  return out;
}

export interface CreateTrackingLinkInput {
  brand_id: string;
  offer_id?: string | null;
  target_url: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
}

export interface TrackingLink {
  id: string;
  slug: string;
  target_url: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  clicks: number;
  conversions: number;
}

export async function createTrackingLink(
  supabase: SupabaseClient,
  workspace_id: string,
  input: CreateTrackingLinkInput,
): Promise<TrackingLink> {
  // Retry once on slug collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug();
    const { data, error } = await supabase
      .from('tracking_link')
      .insert({
        workspace_id,
        brand_id: input.brand_id,
        offer_id: input.offer_id ?? null,
        slug,
        target_url: input.target_url,
        utm_source: input.utm_source ?? null,
        utm_medium: input.utm_medium ?? null,
        utm_campaign: input.utm_campaign ?? null,
        utm_content: input.utm_content ?? null,
        clicks: 0,
        conversions: 0,
      })
      .select('id, slug, target_url, utm_source, utm_medium, utm_campaign, utm_content, clicks, conversions')
      .single();
    if (!error && data) return data as TrackingLink;
    // 23505 = unique violation in Postgres
    if (error?.code === '23505') continue;
    throw new Error(`Failed to create tracking link: ${error?.message ?? 'unknown'}`);
  }
  throw new Error('Failed to generate unique slug after 5 attempts');
}

export async function resolveTrackingLink(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ target_url_with_utm: string; link_id: string } | null> {
  const { data: link, error } = await supabase
    .from('tracking_link')
    .select('id, target_url, utm_source, utm_medium, utm_campaign, utm_content')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !link) return null;

  const url = new URL(link.target_url);
  if (link.utm_source) url.searchParams.set('utm_source', link.utm_source);
  if (link.utm_medium) url.searchParams.set('utm_medium', link.utm_medium);
  if (link.utm_campaign) url.searchParams.set('utm_campaign', link.utm_campaign);
  if (link.utm_content) url.searchParams.set('utm_content', link.utm_content);

  return {
    target_url_with_utm: url.toString(),
    link_id: link.id,
  };
}

/** Increment the click counter (best-effort; non-blocking). */
export async function incrementClick(
  supabase: SupabaseClient,
  link_id: string,
): Promise<void> {
  // Read then write — slight race-condition risk under heavy concurrent traffic,
  // but for our scale (hundreds of clicks/day) it's fine. For high traffic
  // switch to a Postgres function `increment_clicks(p_link_id uuid)`.
  const { data } = await supabase
    .from('tracking_link')
    .select('clicks')
    .eq('id', link_id)
    .single();
  if (data) {
    await supabase
      .from('tracking_link')
      .update({ clicks: data.clicks + 1 })
      .eq('id', link_id);
  }
}
