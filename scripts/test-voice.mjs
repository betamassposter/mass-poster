#!/usr/bin/env node
/**
 * Smoke test for ElevenLabs TTS (or mock if no key).
 * Usage:
 *   pnpm voice:test                              # default text + default voice
 *   pnpm voice:test "text to speak"
 *   pnpm voice:test "text" rachel|adam|antoni|brian
 *   pnpm voice:test "text" <voice_id>
 */

import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { getVoiceProvider, ELEVENLABS_DEFAULT_VOICES } = await import(
  '../src/lib/voice/client.ts'
);

const text =
  process.argv[2] ??
  "Stop wasting hours scraping Google Maps. Try Maplo. Find 1000 leads in 60 seconds.";
const voiceArg = process.argv[3] ?? 'brian';
const voice_id = ELEVENLABS_DEFAULT_VOICES[voiceArg] ?? voiceArg;

const tmpDir = join(__dirname, '..', 'tmp');
mkdirSync(tmpDir, { recursive: true });
const outPath = join(tmpDir, `voice-${Date.now()}.mp3`);

const provider = getVoiceProvider();
console.log(`🎙️  Provider: ${provider.name} (${provider.default_model})`);
console.log(`👤 Voice:    ${voice_id}`);
console.log(`📝 Text:     "${text}"`);
console.log(`💾 Output:   ${outPath}\n`);

const result = await provider.synthesize({ text, voice_id }, outPath);

const stats = statSync(outPath);
console.log(`✅ Synthesized in ${result.generation_ms}ms`);
console.log(`💰 Cost: €${result.cost_eur.toFixed(6)} (${result.characters} chars)`);
console.log(`📦 Size: ${(stats.size / 1024).toFixed(1)} KB`);
console.log(`\n👉 Listen: open "${outPath}"`);
