#!/usr/bin/env node
/**
 * Smart-schedule N content posts across all healthy accounts.
 *
 * Usage:
 *   pnpm schedule:auto [count] [hours_ahead]
 *     count: number of recent unscheduled content to schedule (default 5)
 *     hours_ahead: planning window in hours (default 24)
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { planSchedule, fetchExistingPostsByAccount } = await import(
  '../src/lib/posting/smart-scheduler.ts'
);
const { PostingScheduler } = await import('../src/lib/posting/scheduler.ts');

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const [, , countStr = '5', hoursStr = '24'] = process.argv;
const count = parseInt(countStr, 10);
const hoursAhead = parseInt(hoursStr, 10);

// 1. Pick N unscheduled content with final_edit_url (or any asset)
const { data: contents } = await supabase
  .from('content')
  .select('id, brand_id, hook, assets')
  .eq('workspace_id', WORKSPACE_ID)
  .in('status', ['generated', 'approved'])
  .order('created_at', { ascending: false })
  .limit(count);

if (!contents || contents.length === 0) {
  console.log('No content available. Run `pnpm content:gen maplo 5 instagram` first.');
  process.exit(0);
}
console.log(`📦 ${contents.length} content items selected for scheduling`);

// 2. Healthy accounts
const { data: accounts } = await supabase
  .from('account')
  .select('id, brand_id, platform, daily_post_cap, health_score, status')
  .eq('workspace_id', WORKSPACE_ID)
  .eq('status', 'active');
console.log(`👥 ${accounts?.length ?? 0} active accounts`);

if (!accounts || accounts.length === 0) {
  console.log('⚠️ No active accounts — promoting all to active for test…');
  await supabase
    .from('account')
    .update({ status: 'active', activated_at: new Date().toISOString() })
    .eq('workspace_id', WORKSPACE_ID)
    .in('status', ['creating', 'warmup']);
  const { data: refreshed } = await supabase
    .from('account')
    .select('id, brand_id, platform, daily_post_cap, health_score, status')
    .eq('workspace_id', WORKSPACE_ID)
    .eq('status', 'active');
  if (!refreshed || refreshed.length === 0) {
    console.error('Still no accounts. Create some with `pnpm account:create instagram`.');
    process.exit(1);
  }
  accounts.push(...refreshed);
}

const start = new Date();
const end = new Date(start.getTime() + hoursAhead * 60 * 60 * 1000);

// 3. Load existing posts for these accounts (avoid double-booking)
const existing = await fetchExistingPostsByAccount(
  supabase,
  WORKSPACE_ID,
  accounts.map((a) => a.id),
  start,
  end,
);

// 4. Plan
const plan = planSchedule(
  accounts.map((a) => ({
    id: a.id,
    platform: a.platform,
    daily_post_cap: a.daily_post_cap,
    health_score: a.health_score,
    status: a.status,
    brand_id: a.brand_id,
  })),
  { content_count: contents.length, start, end, seed: 42 },
  existing,
);

console.log(`\n📅 Planned ${plan.slots.length}/${contents.length} slots:`);
for (const slot of plan.slots) {
  const acct = accounts.find((a) => a.id === slot.account_id);
  const content = contents[slot.content_index];
  console.log(
    `   ${slot.scheduled_at.toISOString().slice(0, 16).replace('T', ' ')}  ${acct?.platform.padEnd(15)}  @${(acct?.id ?? '').slice(0, 8)}  ${content?.hook?.slice(0, 50)}…  [${slot.rationale}]`,
  );
}
if (plan.unscheduled_content.length > 0) {
  console.log(`\n⚠️ Unscheduled: ${plan.unscheduled_content.length} items`);
}
if (plan.warnings.length > 0) {
  console.log(`\nWarnings:`);
  for (const w of plan.warnings) console.log(`   ⚠️ ${w}`);
}

// 5. Persist as actual scheduled posts
const scheduler = new PostingScheduler(supabase, WORKSPACE_ID);
let inserted = 0;
for (const slot of plan.slots) {
  const content = contents[slot.content_index];
  try {
    await scheduler.schedule({
      content_id: content.id,
      account_id: slot.account_id,
      scheduled_at: slot.scheduled_at,
    });
    inserted++;
  } catch (err) {
    console.error(`  ❌ Failed to schedule slot ${slot.content_index}: ${(err).message}`);
  }
}
console.log(`\n✅ Inserted ${inserted} scheduled posts. Run \`pnpm post:tick\` to publish due ones.`);
