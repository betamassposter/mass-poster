import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  brandConfigSchema,
  brandWithOffersSchema,
  offerSchema,
  type BrandConfig,
  type BrandWithOffers,
  type Offer,
} from './schema.ts';

/**
 * Brand repository — CRUD scoped a 1 workspace.
 *
 * Tutti i metodi richiedono un Supabase client + workspace_id esplicito.
 * Multi-tenancy enforcement: passa sempre workspace_id, RLS farà il resto
 * se il client è RLS-aware; se è service_role, il filtro è manuale e qui
 * lo applichiamo per sicurezza.
 */

export class BrandRepository {
  private supabase: SupabaseClient;
  private workspaceId: string;

  constructor(supabase: SupabaseClient, workspaceId: string) {
    this.supabase = supabase;
    this.workspaceId = workspaceId;
  }

  // ── READ ────────────────────────────────────────────────────────────

  async list(opts: { status?: BrandConfig['status'] } = {}) {
    let q = this.supabase
      .from('brand')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('created_at', { ascending: false });
    if (opts.status) q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) throw new Error(`list brands: ${error.message}`);
    return data ?? [];
  }

  async getBySlug(slug: string) {
    const { data, error } = await this.supabase
      .from('brand')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(`getBySlug: ${error.message}`);
    return data;
  }

  async getById(id: string) {
    const { data, error } = await this.supabase
      .from('brand')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`getById: ${error.message}`);
    return data;
  }

  async getWithOffers(id: string): Promise<BrandWithOffers | null> {
    const brand = await this.getById(id);
    if (!brand) return null;
    const offers = await this.listOffers(id);
    return brandWithOffersSchema.parse({
      slug: brand.slug,
      name: brand.name,
      niche: brand.niche ?? undefined,
      voice_config: brand.voice_config,
      target_personas: brand.target_personas,
      default_platforms: brand.default_platforms,
      status: brand.status,
      offers,
    });
  }

  // ── WRITE: brand ────────────────────────────────────────────────────

  async create(input: BrandConfig) {
    const parsed = brandConfigSchema.parse(input);
    const { data, error } = await this.supabase
      .from('brand')
      .insert({
        workspace_id: this.workspaceId,
        slug: parsed.slug,
        name: parsed.name,
        niche: parsed.niche,
        voice_config: parsed.voice_config,
        target_personas: parsed.target_personas,
        default_platforms: parsed.default_platforms,
        status: parsed.status,
      })
      .select()
      .single();
    if (error) throw new Error(`create brand: ${error.message}`);
    return data;
  }

  async update(id: string, patch: Partial<BrandConfig>) {
    // valida il patch parziale: ri-usiamo lo schema con `.partial()`
    const parsed = brandConfigSchema.partial().parse(patch);
    const { data, error } = await this.supabase
      .from('brand')
      .update(parsed)
      .eq('id', id)
      .eq('workspace_id', this.workspaceId)
      .select()
      .single();
    if (error) throw new Error(`update brand: ${error.message}`);
    return data;
  }

  async upsertBySlug(input: BrandConfig) {
    const existing = await this.getBySlug(input.slug);
    if (existing) return this.update(existing.id, input);
    return this.create(input);
  }

  async archive(id: string) {
    return this.update(id, { status: 'archived' });
  }

  // ── WRITE: offers ───────────────────────────────────────────────────

  async listOffers(brandId: string): Promise<Offer[]> {
    const { data, error } = await this.supabase
      .from('offer')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('brand_id', brandId)
      .order('is_primary', { ascending: false });
    if (error) throw new Error(`listOffers: ${error.message}`);
    return z.array(offerSchema).parse(
      (data ?? []).map((o) => ({
        type: o.type,
        name: o.name,
        url: o.url ?? undefined,
        tracking_base_url: o.tracking_base_url ?? undefined,
        pitch_1_sentence: o.pitch_1_sentence ?? undefined,
        pitch_3_sentences: o.pitch_3_sentences ?? undefined,
        pitch_1_paragraph: o.pitch_1_paragraph ?? undefined,
        cta_collection: o.cta_collection ?? [],
        pricing_info: o.pricing_info ?? {},
        is_primary: o.is_primary,
        active: o.active,
      })),
    );
  }

  async upsertOffer(brandId: string, input: Offer & { id?: string }) {
    const parsed = offerSchema.parse(input);
    const row = {
      workspace_id: this.workspaceId,
      brand_id: brandId,
      type: parsed.type,
      name: parsed.name,
      url: parsed.url,
      tracking_base_url: parsed.tracking_base_url,
      pitch_1_sentence: parsed.pitch_1_sentence,
      pitch_3_sentences: parsed.pitch_3_sentences,
      pitch_1_paragraph: parsed.pitch_1_paragraph,
      cta_collection: parsed.cta_collection,
      pricing_info: parsed.pricing_info,
      is_primary: parsed.is_primary,
      active: parsed.active,
    };
    if (input.id) {
      const { data, error } = await this.supabase
        .from('offer')
        .update(row)
        .eq('id', input.id)
        .eq('workspace_id', this.workspaceId)
        .select()
        .single();
      if (error) throw new Error(`upsertOffer (update): ${error.message}`);
      return data;
    }
    const { data, error } = await this.supabase
      .from('offer')
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(`upsertOffer (insert): ${error.message}`);
    return data;
  }
}
