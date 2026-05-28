import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { brandConfigSchema, offerSchema, type BrandConfig } from '../brand/schema.ts';
import {
  buildBrandVoiceBlock,
  buildIdeationUserPrompt,
  buildOfferBlock,
  type IdeationPromptOpts,
} from './prompts/blocks.ts';
import type { TextProvider } from './providers/base.ts';
import type { GeneratedIdea, IdeationBatch } from './types.ts';
import { checkQuality, type QualityReport } from './quality-gates.ts';
import { checkBudget } from './cost-optimizer.ts';

/**
 * Content pipeline (text-only, Blocco 5a).
 *
 * Input: brand_id + N + platform + options.
 * Output: N rows inserted into `content` table with hook/caption/hashtags filled,
 *         status="generated", assets={} (video/voice come in Blocchi 5b/5c).
 *
 * Multi-tenant: takes a Supabase admin client (service_role) + workspace_id,
 * filters everything by workspace_id manually. Costs are persisted on
 * content.generation_meta for visibility.
 */

export interface GeneratePipelineOptions extends Omit<IdeationPromptOpts, 'count'> {
  count: number;
  /** Persist results to DB. If false, returns ideas without inserting. */
  persist?: boolean;
}

export interface PipelineResult {
  batch: IdeationBatch;
  inserted_content_ids: string[];
  provider: string;
  model: string;
  cost_eur: number;
  duration_ms: number;
  cache_read_pct: number;
  /** Quality reports per idea (same order as batch.ideas). */
  quality_reports: QualityReport[];
  /** Counts of ideas that passed/warned/rejected. */
  quality_summary: { passed: number; warned: number; rejected: number };
  /** Budget guards. */
  budget?: {
    spent_this_month_eur: number;
    remaining_eur: number;
    warnings: string[];
  };
}

export class ContentPipeline {
  private supabase: SupabaseClient;
  private provider: TextProvider;
  private workspaceId: string;

  constructor(supabase: SupabaseClient, provider: TextProvider, workspaceId: string) {
    this.supabase = supabase;
    this.provider = provider;
    this.workspaceId = workspaceId;
  }

  async generateForBrand(
    brandSlug: string,
    opts: GeneratePipelineOptions,
  ): Promise<PipelineResult> {
    // 1. Load brand
    const { data: brandRow, error: brandErr } = await this.supabase
      .from('brand')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('slug', brandSlug)
      .single();
    if (brandErr || !brandRow) {
      throw new Error(
        `Brand "${brandSlug}" not found in workspace ${this.workspaceId}: ${brandErr?.message ?? 'no row'}`,
      );
    }
    const brand = brandConfigSchema.parse({
      slug: brandRow.slug,
      name: brandRow.name,
      niche: brandRow.niche ?? undefined,
      voice_config: brandRow.voice_config,
      target_personas: brandRow.target_personas,
      default_platforms: brandRow.default_platforms,
      status: brandRow.status,
    });

    // 2. Load primary offer
    const { data: offerRow, error: offerErr } = await this.supabase
      .from('offer')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('brand_id', brandRow.id)
      .eq('is_primary', true)
      .single();
    if (offerErr || !offerRow) {
      throw new Error(
        `No primary offer for brand "${brandSlug}": ${offerErr?.message ?? 'no row'}`,
      );
    }
    const offer = offerSchema.parse({
      type: offerRow.type,
      name: offerRow.name,
      url: offerRow.url ?? undefined,
      tracking_base_url: offerRow.tracking_base_url ?? undefined,
      pitch_1_sentence: offerRow.pitch_1_sentence ?? undefined,
      pitch_3_sentences: offerRow.pitch_3_sentences ?? undefined,
      pitch_1_paragraph: offerRow.pitch_1_paragraph ?? undefined,
      cta_collection: offerRow.cta_collection ?? [],
      pricing_info: offerRow.pricing_info ?? {},
      is_primary: offerRow.is_primary,
      active: offerRow.active,
    });

    // 3. Build prompt blocks
    const brand_voice_block = buildBrandVoiceBlock(brand);
    const offer_block = buildOfferBlock(offer);
    const user_prompt = buildIdeationUserPrompt({
      count: opts.count,
      platform: opts.platform,
      recent_winners: opts.recent_winners,
      avoid_hooks: opts.avoid_hooks,
      extra_context: opts.extra_context,
    });

    // 4. Budget pre-flight check
    const budget = await checkBudget(this.supabase, this.workspaceId);
    if (!budget.budget_ok) {
      throw new Error(
        `Monthly budget exhausted (€${budget.spent_this_month_eur.toFixed(2)} / €${budget.monthly_budget_eur.toFixed(2)}). Increase workspace.monthly_budget_eur to continue.`,
      );
    }

    // 5. Call provider
    const result = await this.provider.generateIdeas({
      brand_voice_block,
      offer_block,
      user_prompt,
      platform: opts.platform,
      count: opts.count,
    });

    // 6. Quality gates — score every idea
    const quality_reports = result.data.ideas.map((idea) =>
      checkQuality(idea, brand, { siblings: result.data.ideas }),
    );
    const quality_summary = {
      passed: quality_reports.filter((r) => r.score >= 70).length,
      warned: quality_reports.filter((r) => r.score >= 50 && r.score < 70).length,
      rejected: quality_reports.filter((r) => r.score < 50).length,
    };

    const cache_total =
      result.usage.cache_read_input_tokens +
      result.usage.cache_creation_input_tokens +
      result.usage.input_tokens;
    const cache_read_pct =
      cache_total === 0
        ? 0
        : Math.round((result.usage.cache_read_input_tokens / cache_total) * 100);

    // 7. Optionally persist to content table — reject low-score ideas, mark warned ones
    const inserted_content_ids: string[] = [];
    if (opts.persist !== false) {
      const rows = result.data.ideas
        .map((idea: GeneratedIdea, i: number) => ({ idea, quality: quality_reports[i]! }))
        .filter(({ quality }) => quality.score >= 50) // drop hard rejects
        .map(({ idea, quality }) => ({
          workspace_id: this.workspaceId,
          brand_id: brandRow.id,
          offer_id: offerRow.id,
          type: 'reel' as const,
          status: (quality.score >= 70 ? 'generated' : 'draft') as 'generated' | 'draft',
          hook: idea.hook,
          script: null,
          caption: idea.caption,
          hashtags: idea.hashtags,
          assets: { thumbnail_concept: idea.thumbnail_concept },
          generation_meta: {
            provider: result.provider,
            model: result.model,
            platform: opts.platform,
            cta_used: idea.cta_used,
            tokens_in: result.usage.input_tokens,
            tokens_out: result.usage.output_tokens,
            cache_read: result.usage.cache_read_input_tokens,
            cache_create: result.usage.cache_creation_input_tokens,
            duration_ms: result.duration_ms,
            quality_score: quality.score,
            quality_issues_count: quality.issues.length,
            quality_brand_voice_alignment: quality.stats.brand_voice_alignment,
          },
          cost_eur: Number((result.usage.cost_eur / opts.count).toFixed(6)),
        }));

      const { data: inserted, error: insertErr } = await this.supabase
        .from('content')
        .insert(rows)
        .select('id');
      if (insertErr) {
        throw new Error(`Failed to persist content: ${insertErr.message}`);
      }
      inserted_content_ids.push(...(inserted ?? []).map((r) => r.id));
    }

    return {
      batch: result.data,
      inserted_content_ids,
      provider: result.provider,
      model: result.model,
      cost_eur: result.usage.cost_eur,
      duration_ms: result.duration_ms,
      cache_read_pct,
      quality_reports,
      quality_summary,
      budget: {
        spent_this_month_eur: budget.spent_this_month_eur,
        remaining_eur: budget.remaining_eur,
        warnings: budget.warnings,
      },
    };
  }
}

// Re-export for downstream so callers can import from a single module if desired.
export type { BrandConfig };
