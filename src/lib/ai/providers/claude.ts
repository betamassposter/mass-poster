import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  ideationBatchJSONSchema,
  ideationBatchSchema,
  type AIResponse,
  type IdeationBatch,
  type IdeationRequest,
} from '../types.ts';
import { type TextProvider, ProviderError } from './base.ts';
import { env, requireEnv } from '../../env.ts';

/**
 * Anthropic Claude Sonnet 4.6 provider.
 *
 * Best practices applied:
 *  - Adaptive thinking (`thinking: {type: "adaptive"}`); for caption gen we disable thinking
 *    explicitly since it's a "lookup-style" task — keeps latency low and cost minimal.
 *  - Aggressive prompt caching: system + brand_voice_block + offer_block cached.
 *    Volatile user prompt placed AFTER the last cache_control breakpoint.
 *  - Structured outputs via `output_config.format` (no prefill, deprecated on 4.6).
 *  - Effort: low (caption generation, no deep reasoning needed).
 *  - 1-hour TTL cache → brand+offer prefix stays warm across the day's batch run.
 *
 * Cost target: ~€0.005-0.01 per idea (10 ideas batch ~€0.05-0.10).
 * With caching at 80%+ hit rate after first batch, this drops 70%.
 */

// Pricing per 1M tokens (Claude Sonnet 4.6, USD)
const PRICE_INPUT = 3.0;
const PRICE_OUTPUT = 15.0;
const PRICE_CACHE_WRITE_1H = 6.0; // 2× write premium for 1h TTL
const PRICE_CACHE_READ = 0.3; // ~0.1× input

const USD_TO_EUR = 0.92;

const STABLE_SYSTEM_PROMPT = `You are a senior short-form content strategist with 10+ years of experience writing reels, shorts, and tiktoks for B2B SaaS, e-commerce, digital products, and creator-led brands.

Your job: given a brand voice + offer + target platform, produce viral-worthy content ideas that follow proven copywriting frameworks (PAS, AIDA, hormozi's value equation, hook → context → payoff → CTA).

Hard rules:
1. NEVER use generic marketing buzzwords from the brand's banned_words list.
2. NEVER copy-paste between ideas. Each idea must have a meaningfully different hook angle.
3. Hooks must be specific and concrete. "Stop wasting hours" beats "Be more productive". Numbers > vague.
4. Captions must end with ONE clear CTA, drawn from the offer.cta_collection (or a close variant).
5. Hashtags: 5-10 mix. 60% niche-specific (small audience, high intent), 40% broad (discovery). No spam tags like #fyp #viral.
6. Output STRICT JSON matching the requested schema. No prose outside JSON. No markdown fences.
7. Match the platform's native style: TikTok = casual + hooks in first 1s; LinkedIn = professional but punchy; Instagram = visual + scannable; YT Shorts = title-driven.

Frameworks to rotate between (don't reuse the same one twice in a batch):
- Pain agitation: "You're [problem]. Here's why [insight]. Try [offer]."
- Contrarian: "Everyone says X. They're wrong. Here's what works: [insight]."
- Mistake / fix: "Stop doing X. Do Y instead. [Result]."
- Tutorial: "How to [outcome] in [timeframe]. Step 1... Step 2..."
- Story / case study: "Last week [person] did X. Result: Y. Here's how you can too."
- Listicle: "5 [things] that [outcome]. #1..."
- Comparison: "Tool A vs Tool B. Tool A: ...  Tool B: ... Winner: ..."
- Behind the scenes / build-in-public.

You are NOT a chatbot. Don't add preamble. Output only the JSON object matching the schema.`;

export class ClaudeProvider implements TextProvider {
  readonly name = 'claude';
  readonly model = 'claude-sonnet-4-6';
  private client: Anthropic;

  constructor() {
    requireEnv('ANTHROPIC_API_KEY');
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async generateIdeas(req: IdeationRequest): Promise<AIResponse<IdeationBatch>> {
    const started = Date.now();

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8192,
        // Disable thinking: caption generation is a lookup task, no benefit from extended reasoning.
        thinking: { type: 'disabled' },
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: ideationBatchJSONSchema,
          },
        },
        // 3-block system prompt with cache breakpoints:
        // 1) Stable system (rules + frameworks) → cached, 1h TTL
        // 2) Brand voice block → cached per brand
        // 3) Offer block → cached per offer (last cache_control = caches everything up to here)
        system: [
          {
            type: 'text',
            text: STABLE_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
          {
            type: 'text',
            text: req.brand_voice_block,
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
          {
            type: 'text',
            text: req.offer_block,
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
        // Volatile: per-batch request — placed AFTER the last system cache breakpoint.
        messages: [{ role: 'user', content: req.user_prompt }],
      });

      const duration_ms = Date.now() - started;

      // Parse the JSON output
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new ProviderError(
          'No text block in Claude response',
          this.name,
          true,
        );
      }

      const raw_text = textBlock.text;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw_text);
      } catch (err) {
        throw new ProviderError(
          `Claude returned invalid JSON: ${(err as Error).message}\nRaw: ${raw_text.slice(0, 500)}`,
          this.name,
          true,
        );
      }

      let validated: IdeationBatch;
      try {
        validated = ideationBatchSchema.parse(parsed);
      } catch (err) {
        if (err instanceof z.ZodError) {
          throw new ProviderError(
            `Claude output failed Zod validation:\n${z.prettifyError(err)}`,
            this.name,
            true,
            err,
          );
        }
        throw err;
      }

      // Compute cost
      const u = response.usage;
      const input_tokens = u.input_tokens;
      const output_tokens = u.output_tokens;
      const cache_creation = u.cache_creation_input_tokens ?? 0;
      const cache_read = u.cache_read_input_tokens ?? 0;

      const cost_usd =
        (input_tokens * PRICE_INPUT +
          output_tokens * PRICE_OUTPUT +
          cache_creation * PRICE_CACHE_WRITE_1H +
          cache_read * PRICE_CACHE_READ) /
        1_000_000;
      const cost_eur = cost_usd * USD_TO_EUR;

      return {
        data: validated,
        raw_text,
        provider: this.name,
        model: this.model,
        usage: {
          input_tokens,
          output_tokens,
          cache_creation_input_tokens: cache_creation,
          cache_read_input_tokens: cache_read,
          cost_eur: Number(cost_eur.toFixed(6)),
        },
        duration_ms,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;

      // Map known Anthropic errors
      if (err instanceof Anthropic.RateLimitError) {
        throw new ProviderError(
          `Claude rate limited: ${err.message}`,
          this.name,
          true,
          err,
        );
      }
      if (err instanceof Anthropic.AuthenticationError) {
        throw new ProviderError(
          `Claude auth failed: ${err.message}`,
          this.name,
          false,
          err,
        );
      }
      if (err instanceof Anthropic.APIError) {
        throw new ProviderError(
          `Claude API error (${err.status}): ${err.message}`,
          this.name,
          err.status ? err.status >= 500 : false,
          err,
        );
      }

      throw new ProviderError(
        `Claude unexpected error: ${(err as Error).message}`,
        this.name,
        true,
        err,
      );
    }
  }
}
