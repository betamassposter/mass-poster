#!/usr/bin/env node
/**
 * List voices available on the ElevenLabs account.
 * Usage: pnpm voice:list
 */

import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { getVoiceProvider } = await import('../src/lib/voice/client.ts');

const provider = getVoiceProvider();
console.log(`🎙️  Listing voices on ${provider.name}…\n`);

const voices = await provider.listVoices();
console.log(`Found ${voices.length}:`);
for (const v of voices) {
  console.log(`  [${v.category}]  ${v.name.padEnd(28)} ${v.voice_id}`);
}
