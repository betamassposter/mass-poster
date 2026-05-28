import { FalVideoProvider } from './providers/fal.ts';
import { MockVideoProvider } from './providers/mock.ts';
import type { VideoGenProvider } from './providers/base.ts';
import { env } from '../env.ts';

export function getVideoGenProvider(): VideoGenProvider {
  const override = process.env.VIDEO_PROVIDER as 'fal' | 'mock' | undefined;
  if (override === 'mock') return new MockVideoProvider();
  if (override === 'fal') return new FalVideoProvider();

  if (env.FAL_KEY) return new FalVideoProvider();
  console.warn(
    '⚠️  No FAL_KEY set — falling back to MockVideoProvider (color clip). Set FAL_KEY in .env.local for real video gen.',
  );
  return new MockVideoProvider();
}
