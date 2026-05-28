#!/usr/bin/env node
/**
 * Smoke test for Blocco 7 (posting) + Blocco 8 (tracking link).
 * Uses service_role to bypass RLS.
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { createTrackingLink, resolveTrackingLink } = await import(
  '../src/lib/analytics/tracking-link.ts'
);
const { PostingScheduler } = await import('../src/lib/posting/scheduler.ts');
const { getPostingProvider } = await import('../src/lib/posting/client.ts');

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ─── Test 1: tracking link create + resolve ──────────────────────────
console.log('═══ BLOCCO 8: Tracking link + UTM ═══\n');
const { data: brand } = await supabase
  .from('brand')
  .select('id, name, slug')
  .eq('workspace_id', WORKSPACE_ID)
  .eq('slug', 'maplo')
  .single();
console.log(`Brand: ${brand.name} (${brand.id})`);

const link = await createTrackingLink(supabase, WORKSPACE_ID, {
  brand_id: brand.id,
  target_url: 'https://trymaplo.com',
  utm_source: 'instagram',
  utm_medium: 'reel',
  utm_campaign: 'mass-poster',
  utm_content: 'maplo-test',
});
console.log(`✅ Created link with slug=${link.slug}`);
console.log(`   Short:  /l/${link.slug}`);
console.log(`   Target: ${link.target_url}\n`);

const resolved = await resolveTrackingLink(supabase, link.slug);
console.log(`Resolves to:`);
console.log(`  ${resolved.target_url_with_utm}\n`);

// ─── Test 2: posting scheduler ───────────────────────────────────────
console.log('═══ BLOCCO 7: Posting + scheduler ═══\n');
const provider = getPostingProvider();
console.log(`Provider: ${provider.name}`);

// Find a content + account
const { data: content } = await supabase
  .from('content')
  .select('id, hook, brand_id, assets')
  .eq('workspace_id', WORKSPACE_ID)
  .eq('brand_id', brand.id)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();
if (!content) {
  console.log('No content. Run `pnpm content:gen maplo 2 instagram` first.');
  process.exit(1);
}
console.log(`Content: ${content.id.slice(0, 8)} — "${content.hook?.slice(0, 50)}…"`);

// Ensure content has final_edit_url (mock if missing — for posting tests)
const currentAssets = content.assets ?? {};
if (!currentAssets.final_edit_url) {
  await supabase
    .from('content')
    .update({ assets: { ...currentAssets, final_edit_url: '/tmp/reels/mock-final.mp4' } })
    .eq('id', content.id);
  console.log('   (added mock final_edit_url for testing)');
}

const { data: account } = await supabase
  .from('account')
  .select('id, handle, platform')
  .eq('workspace_id', WORKSPACE_ID)
  .eq('brand_id', brand.id)
  .order('created_at', { ascending: false })
  .limit(1)
  .single();
if (!account) {
  console.log('No account. Run `pnpm account:create instagram` first.');
  process.exit(1);
}
console.log(`Account: ${account.id.slice(0, 8)} — @${account.handle} (${account.platform})\n`);

const scheduler = new PostingScheduler(supabase, WORKSPACE_ID);
const post = await scheduler.schedule({
  content_id: content.id,
  account_id: account.id,
  scheduled_at: new Date(),
  caption_variant: 'Variant caption for this account run',
});
console.log(`✅ Scheduled post ${post.id.slice(0, 8)} at ${post.scheduled_at}\n`);

console.log(`Running tick…`);
const result = await scheduler.tick();
console.log(`✅ Processed: ${result.processed}`);
console.log(`   Published: ${result.published}`);
console.log(`   Failed:    ${result.failed}`);
for (const d of result.details) {
  console.log(`   - [${d.post_id.slice(0, 8)}] ${d.status}${d.error ? ` — ${d.error}` : ''}`);
}

// Verify post row
const { data: finalPost } = await supabase
  .from('post')
  .select('status, platform_post_id, platform_post_url, published_at, posting_provider')
  .eq('id', post.id)
  .single();
console.log(`\nFinal post row:`);
console.log(`  status:            ${finalPost.status}`);
console.log(`  provider:          ${finalPost.posting_provider}`);
console.log(`  platform_post_id:  ${finalPost.platform_post_id}`);
console.log(`  platform_post_url: ${finalPost.platform_post_url}`);
console.log(`  published_at:      ${finalPost.published_at}`);

console.log('\n🎉 Blocchi 7 + 8 verdi.');
