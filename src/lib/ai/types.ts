import { z } from 'zod';

/**
 * Common types for AI providers.
 * Provider abstraction → swap Claude ↔ OpenAI ↔ mock with zero refactor.
 */

export type ProviderName = 'claude' | 'openai' | 'mock';

export interface AIUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_eur: number;
}

export interface AIResponse<T = unknown> {
  data: T;
  raw_text: string;
  provider: ProviderName;
  model: string;
  usage: AIUsage;
  duration_ms: number;
}

// ─────────────────────────────────────────────────────────────
// Content generation schema (output we ask Claude to produce)
// ─────────────────────────────────────────────────────────────

export const generatedIdeaSchema = z.object({
  hook: z
    .string()
    .min(10)
    .max(180)
    .describe('Opening 1-2 lines that stop the scroll. Specific, concrete, agitating.'),
  caption: z
    .string()
    .min(20)
    .max(2200)
    .describe(
      'Full caption: hook on line 1, then body with 2-4 short lines, then CTA. Plain text, no markdown.',
    ),
  hashtags: z
    .array(z.string().regex(/^#[A-Za-z0-9_]+$/))
    .min(3)
    .max(15)
    .describe('Mix of niche-specific and broad hashtags. No spam, no emoji in tags.'),
  cta_used: z
    .string()
    .min(2)
    .describe('Which CTA from the offer.cta_collection was used (verbatim or close).'),
  thumbnail_concept: z
    .string()
    .min(10)
    .max(200)
    .describe('1-sentence visual concept for the reel thumbnail (no AI image gen yet).'),
});
export type GeneratedIdea = z.infer<typeof generatedIdeaSchema>;

export const ideationBatchSchema = z.object({
  ideas: z.array(generatedIdeaSchema).min(1).max(20),
});
export type IdeationBatch = z.infer<typeof ideationBatchSchema>;

// JSON schema (for Anthropic `output_config.format`)
// Hand-written so it stays compatible with Anthropic structured outputs constraints
// (no minimum/maximum/minLength/maxLength/multipleOf — those are validated client-side via Zod).
export const ideationBatchJSONSchema = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hook: { type: 'string' },
          caption: { type: 'string' },
          hashtags: { type: 'array', items: { type: 'string' } },
          cta_used: { type: 'string' },
          thumbnail_concept: { type: 'string' },
        },
        required: ['hook', 'caption', 'hashtags', 'cta_used', 'thumbnail_concept'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
} as const;

// ─────────────────────────────────────────────────────────────
// Request shape
// ─────────────────────────────────────────────────────────────

export interface IdeationRequest {
  /** Cacheable: brand voice config (stable per brand). */
  brand_voice_block: string;
  /** Cacheable: offer info (stable per offer). */
  offer_block: string;
  /** Volatile: number of ideas, platform, time-of-day, recent winners. */
  user_prompt: string;
  /** Target platform for the ideas. */
  platform: 'instagram' | 'tiktok' | 'youtube_shorts' | 'linkedin' | 'x';
  /** How many ideas to generate in this batch. */
  count: number;
}
