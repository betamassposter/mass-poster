#!/usr/bin/env node
/**
 * Print today's warmup checklist for an account.
 *
 * Usage: pnpm account:warmup <account_id>
 *
 * Lists the actions to perform (manually or via Browser-Use later).
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { WARMUP_RECIPES, getDailyWarmup, currentWarmupDay } = await import(
  '../src/lib/accounts/warmup-recipes.ts'
);

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const accountId = process.argv[2];
if (!accountId) {
  console.error('Usage: pnpm account:warmup <account_id>');
  process.exit(1);
}

const { data: account } = await supabase
  .from('account')
  .select('id, handle, platform, status, warmup_started_at')
  .eq('id', accountId)
  .eq('workspace_id', WORKSPACE_ID)
  .single();

if (!account) {
  console.error(`Account ${accountId} not found`);
  process.exit(1);
}

const recipe = WARMUP_RECIPES[account.platform];
const day = currentWarmupDay(account.warmup_started_at, recipe.total_days);

console.log(`\n🩺 Warmup status — @${account.handle} (${account.platform})`);
console.log(`   Status: ${account.status}`);
console.log(`   Warmup started: ${account.warmup_started_at ?? '(not yet)'}`);
console.log(`   Current day: ${day === 0 ? 'not started' : day === -1 ? '✅ complete' : `${day}/${recipe.total_days}`}\n`);

if (day === 0) {
  console.log(`👉 Start warmup with: \`pnpm account:promote-warmup ${accountId}\``);
  console.log(`   Then re-run this command tomorrow.\n`);
  process.exit(0);
}
if (day === -1) {
  console.log(`✅ Warmup is complete. Account is ready for posting.\n`);
  process.exit(0);
}

const todays = getDailyWarmup(account.platform, day);
if (!todays) {
  console.log(`No recipe for day ${day}.`);
  process.exit(0);
}

console.log(`📋 Day ${day} checklist (${todays.total_session_min} min):\n`);
for (const action of todays.actions) {
  const desc = formatAction(action);
  console.log(`  □  ${desc}`);
}
if (todays.notes) {
  console.log(`\n   📝 ${todays.notes}`);
}

console.log(`\n   Full recipe: ${recipe.description}`);
console.log(`   Tomorrow: re-run this command for day ${day + 1}/${recipe.total_days}.\n`);

function formatAction(a) {
  switch (a.type) {
    case 'profile_setup':
      return `Profile setup: complete ${a.fields.join(', ')}`;
    case 'scroll':
      return `Scroll ${Math.round(a.duration_sec / 60)} min on ${a.topic}`;
    case 'like':
      return `Like ${a.count} ${a.topic}`;
    case 'save':
      return `Save ${a.count} posts`;
    case 'follow':
      return `Follow ${a.count} accounts — ${a.criteria}`;
    case 'comment':
      return `Comment ${a.count} — ${a.style}`;
    case 'watch_video':
      return `Watch ${a.count} videos (≥${a.min_dwell_sec}s dwell each)`;
    case 'react':
      return `React (${a.reaction}) ${a.count} times`;
    case 'connect':
      return `Send ${a.count} connection requests — ${a.criteria}`;
    case 'idle':
      return `Idle — ${a.rationale}`;
  }
}
