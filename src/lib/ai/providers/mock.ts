import type { AIResponse, IdeationBatch, IdeationRequest } from '../types.ts';
import { ideationBatchSchema } from '../types.ts';
import type { TextProvider } from './base.ts';

/**
 * Mock provider for dev without API keys.
 * Returns deterministic dummy data so the pipeline can be wired E2E.
 */
export class MockProvider implements TextProvider {
  readonly name = 'mock';
  readonly model = 'mock-text-1';

  async generateIdeas(req: IdeationRequest): Promise<AIResponse<IdeationBatch>> {
    const started = Date.now();

    const ideas = Array.from({ length: req.count }, (_, i) => ({
      hook: `[MOCK ${i + 1}] Stop wasting hours on Maps. Here's the 60-second fix.`,
      caption: `[MOCK ${i + 1}] Hook line.\n\nBody line 1.\nBody line 2.\n\nCTA: Try Maplo free.`,
      hashtags: ['#leadgen', '#b2b', '#sales', '#automation', '#growth'],
      cta_used: 'Try Maplo free',
      thumbnail_concept: `[MOCK ${i + 1}] Split screen: messy spreadsheet vs clean Maplo dashboard.`,
    }));

    const data = ideationBatchSchema.parse({ ideas });

    return {
      data,
      raw_text: JSON.stringify({ ideas }),
      provider: this.name,
      model: this.model,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cost_eur: 0,
      },
      duration_ms: Date.now() - started,
    };
  }
}
