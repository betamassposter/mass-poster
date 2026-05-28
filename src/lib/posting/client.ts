import { ZernioProvider } from './providers/zernio.ts';
import { MockPostingProvider } from './providers/mock.ts';
import type { PostingProviderInterface } from './types.ts';
import { env } from '../env.ts';

export function getPostingProvider(): PostingProviderInterface {
  const override = process.env.POSTING_PROVIDER as
    | 'zernio'
    | 'mock'
    | undefined;
  if (override === 'mock') return new MockPostingProvider();
  if (override === 'zernio') return new ZernioProvider();

  if (env.ZERNIO_API_KEY) return new ZernioProvider();
  console.warn(
    '⚠️  No ZERNIO_API_KEY set — using MockPostingProvider. Set ZERNIO_API_KEY for real publishing.',
  );
  return new MockPostingProvider();
}
