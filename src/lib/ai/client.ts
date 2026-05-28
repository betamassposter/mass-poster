import { ClaudeProvider } from './providers/claude.ts';
import { MockProvider } from './providers/mock.ts';
import { ProviderError, type TextProvider } from './providers/base.ts';
import { env } from '../env.ts';
import type { AIResponse, IdeationBatch, IdeationRequest } from './types.ts';

/**
 * Factory: choose the primary text provider based on env.
 * Falls back to mock if no provider key is configured (dev-friendly).
 *
 * Override via env var TEXT_PROVIDER=claude | openai | mock.
 */
export function getTextProvider(): TextProvider {
  const override = process.env.TEXT_PROVIDER as
    | 'claude'
    | 'openai'
    | 'mock'
    | undefined;

  if (override === 'mock') return new MockProvider();
  if (override === 'openai') {
    // OpenAI adapter not implemented yet (Blocco 5 fallback)
    throw new Error('OpenAI provider not yet implemented. Use claude or mock.');
  }
  if (override === 'claude') return new ClaudeProvider();

  // Auto-detect
  if (env.ANTHROPIC_API_KEY) return new ClaudeProvider();
  console.warn(
    '⚠️  No ANTHROPIC_API_KEY set — falling back to MockProvider. Set TEXT_PROVIDER=claude after adding the key.',
  );
  return new MockProvider();
}

/**
 * Fallback wrapper: try primary, fall through to secondary on transient errors.
 * Currently only Claude → Mock (since OpenAI adapter pending). Easy to extend.
 */
export class TextProviderWithFallback {
  private primary: TextProvider;
  private secondary: TextProvider | null;

  constructor(primary: TextProvider, secondary: TextProvider | null = null) {
    this.primary = primary;
    this.secondary = secondary;
  }

  async generateIdeas(req: IdeationRequest): Promise<AIResponse<IdeationBatch>> {
    try {
      return await this.primary.generateIdeas(req);
    } catch (err) {
      if (
        err instanceof ProviderError &&
        err.transient &&
        this.secondary
      ) {
        console.warn(
          `⚠️  Primary provider (${this.primary.name}) failed transiently: ${err.message}. Falling back to ${this.secondary.name}.`,
        );
        return this.secondary.generateIdeas(req);
      }
      throw err;
    }
  }
}
