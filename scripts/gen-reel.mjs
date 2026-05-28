#!/usr/bin/env node
/**
 * Full reel pipeline end-to-end.
 *
 * Usage: pnpm reel:gen [brand-slug] [count] [platform]
 *        pnpm reel:gen maplo 2 instagram
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { runReelPipeline } = await import('../src/lib/reel-pipeline.ts');

const [, , brand = 'maplo', countStr = '1', platform = 'instagram'] = process.argv;
const count = parseInt(countStr, 10);

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const outputDir = join(__dirname, '..', 'tmp', 'reels', new Date().toISOString().slice(0, 10));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

console.log(`🎬 Reel pipeline\n   brand:    ${brand}\n   count:    ${count}\n   platform: ${platform}\n   out:      ${outputDir}\n`);

const result = await runReelPipeline(supabase, {
  brand_slug: brand,
  count,
  platform,
  output_dir: outputDir,
  workspace_id: WORKSPACE_ID,
});

console.log(`\n══════════════════════════════════════════`);
console.log(`✅ Done in ${(result.total_duration_ms / 1000).toFixed(1)}s`);
console.log(`💰 Total cost: €${result.total_cost_eur.toFixed(4)}`);
console.log(`🎞️  ${result.reels.length} reels generated:\n`);
for (const r of result.reels) {
  console.log(`   • ${r.hook.slice(0, 60)}…`);
  console.log(`     ${r.final_path}`);
  console.log(`     €${r.cost_eur.toFixed(4)} · ${r.duration_s}s\n`);
}
console.log(`👉 Open them: open "${outputDir}"`);
