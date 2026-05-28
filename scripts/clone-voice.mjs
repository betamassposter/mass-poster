#!/usr/bin/env node
/**
 * Clone a voice on ElevenLabs from one or more audio samples.
 * Usage: pnpm voice:clone <name> <sample1.mp3> [sample2.mp3 ...]
 *
 * Recommended: 1+ minute of clean speech, ideally in target language(s).
 */

import { config as loadEnv } from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const [, , name, ...samples] = process.argv;
if (!name || samples.length === 0) {
  console.error('Usage: pnpm voice:clone <name> <sample1.mp3> [sample2.mp3 ...]');
  process.exit(1);
}
const sample_paths = samples.map((p) => resolve(p));
for (const p of sample_paths) {
  if (!existsSync(p)) {
    console.error(`❌ Sample not found: ${p}`);
    process.exit(1);
  }
}

const { getVoiceProvider } = await import('../src/lib/voice/client.ts');
const provider = getVoiceProvider();

console.log(`🎙️  Cloning voice "${name}" on ${provider.name}…`);
console.log(`   Samples: ${sample_paths.map((p) => p.split('/').pop()).join(', ')}\n`);

const result = await provider.cloneVoice({
  name,
  sample_paths,
  description: 'Cloned via Mass Poster',
});

console.log(`✅ Cloned. voice_id = ${result.voice_id}`);
console.log(`\nUse it:`);
console.log(`   pnpm voice:test "Some text to read" ${result.voice_id}`);
