import { ElevenLabsProvider } from './providers/elevenlabs.ts';
import { MockVoiceProvider } from './providers/mock.ts';
import type { VoiceProvider } from './providers/base.ts';
import { env } from '../env.ts';

export function getVoiceProvider(): VoiceProvider {
  const override = process.env.VOICE_PROVIDER as 'elevenlabs' | 'mock' | undefined;
  if (override === 'mock') return new MockVoiceProvider();
  if (override === 'elevenlabs') return new ElevenLabsProvider();

  if (env.ELEVENLABS_API_KEY) return new ElevenLabsProvider();
  console.warn(
    '⚠️  No ELEVENLABS_API_KEY — falling back to MockVoiceProvider (sine tone). Set ELEVENLABS_API_KEY in .env.local.',
  );
  return new MockVoiceProvider();
}

export { ELEVENLABS_DEFAULT_VOICES } from './providers/elevenlabs.ts';
