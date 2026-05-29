#!/usr/bin/env node
/**
 * Generate N content ideas for a brand and persist to DB.
 *
 * Usage:
 *   pnpm content:gen <brand-slug> [count] [platform]
 *   pnpm content:gen maplo 5 instagram
 *
 * If ANTHROPIC_API_KEY is not set, falls back to MockProvider (no real gen).
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enable on-the-fly TS loading for .ts imports from this .mjs script
// (Node 22+ has native support; on older versions we'd need tsx).
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

// Dynamic imports of TS modules (Node 26 strip-types friendly)
const { ContentPipeline } = await import('../src/lib/ai/pipeline.ts');
const { getTextProvider } = await import('../src/lib/ai/client.ts');

const [, , brandSlug = 'maplo', countStr = '3', platform = 'instagram'] = process.argv;
const count = parseInt(countStr, 10);

if (!brandSlug) {
  console.error('Usage: pnpm content:gen <brand-slug> [count] [platform]');
  process.exit(1);
}
if (Number.isNaN(count) || count < 1 || count > 20) {
  console.error('Count must be an integer 1-20');
  process.exit(1);
}
if (!['instagram', 'tiktok', 'youtube_shorts', 'linkedin', 'x'].includes(platform)) {
  console.error(`Invalid platform: ${platform}`);
  process.exit(1);
}

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const provider = getTextProvider();
console.log(`🤖 Provider: ${provider.name} (${provider.model})`);
console.log(`🎯 Brand: ${brandSlug}  |  Platform: ${platform}  |  Count: ${count}\n`);

const pipeline = new ContentPipeline(supabase, provider, WORKSPACE_ID);

const result = await pipeline.generateForBrand(brandSlug, {
  count,
  platform,
  persist: true,
});

console.log(`✅ Generated ${result.batch.ideas.length} ideas in ${result.duration_ms}ms`);
console.log(`💰 Cost: €${result.cost_eur.toFixed(6)}  |  Cache read: ${result.cache_read_pct}%`);
console.log(`💾 Inserted content IDs: ${result.inserted_content_ids.length}\n`);

result.batch.ideas.forEach((idea, i) => {
  console.log(`────── Idea ${i + 1} ──────`);
  console.log(`Hook:     ${idea.hook}`);
  console.log(`CTA:      ${idea.cta_used}`);
  console.log(`Caption:  ${idea.caption.slice(0, 140)}${idea.caption.length > 140 ? '…' : ''}`);
  console.log(`Hashtags: ${idea.hashtags.join(' ')}`);
  console.log(`Thumb:    ${idea.thumbnail_concept}`);
  console.log();
});

console.log(`🎉 Done. Run \`pnpm db:verify\` to see content rows in DB.`);
