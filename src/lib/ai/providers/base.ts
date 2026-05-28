import type { AIResponse, IdeationBatch, IdeationRequest } from '../types.ts';

/**
 * Provider-agnostic interface for text generation.
 *
 * Implementations:
 *  - claude.ts → Anthropic Claude Sonnet 4.6 (primary)
 *  - openai.ts → OpenAI GPT-5 / 4.1 (fallback, future)
 *  - mock.ts   → deterministic mock (dev without keys)
 */
export interface TextProvider {
  readonly name: string;
  readonly model: string;

  /**
   * Generate N content ideas for a brand + offer + platform combo.
   * Returns validated batch (Zod-parsed).
   */
  generateIdeas(req: IdeationRequest): Promise<AIResponse<IdeationBatch>>;
}

/**
 * Error class for provider failures. Carries `transient` flag → if true,
 * the fallback wrapper will retry with the secondary provider.
 */
export class ProviderError extends Error {
  readonly provider: string;
  readonly transient: boolean;
  readonly cause?: unknown;

  constructor(message: string, provider: string, transient: boolean, cause?: unknown) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.transient = transient;
    this.cause = cause;
  }
}
