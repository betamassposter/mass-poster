#!/usr/bin/env node
/**
 * Smoke test for FAL video gen (or mock if no FAL_KEY).
 * Usage: pnpm video-gen:test ["custom prompt"]
 */

import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { getVideoGenProvider } = await import('../src/lib/video-gen/client.ts');

const prompt = process.argv[2] ?? 'A messy cluttered desk transforming into a clean modern workspace, cinematic, fast cut';
const tmpDir = join(__dirname, '..', 'tmp');
mkdirSync(tmpDir, { recursive: true });
const outPath = join(tmpDir, `gen-${Date.now()}.mp4`);

const provider = getVideoGenProvider();
console.log(`🎬 Provider: ${provider.name} (${provider.default_model})`);
console.log(`📝 Prompt: "${prompt}"`);
console.log(`💾 Output: ${outPath}\n   (this can take 30-90s on FAL)\n`);

const result = await provider.generate(
  { prompt, duration_s: 5, aspect_ratio: '9:16' },
  outPath,
);

const stats = statSync(outPath);
console.log(`✅ Generated in ${(result.generation_ms / 1000).toFixed(1)}s`);
console.log(`💰 Cost: €${result.cost_eur.toFixed(4)}`);
console.log(`📦 Size: ${(stats.size / 1024).toFixed(1)} KB`);
console.log(`🌐 URL:  ${result.video_url}`);
console.log(`\n👉 Watch: open "${outPath}"`);
