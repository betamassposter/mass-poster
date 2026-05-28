#!/usr/bin/env node
/**
 * Posting CLI.
 *
 * Usage:
 *   pnpm post:schedule <content_id> <account_id> [minutes_from_now]
 *   pnpm post:tick                  # process all due posts
 *   pnpm post:list                  # list scheduled/published
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { PostingScheduler } = await import('../src/lib/posting/scheduler.ts');
const { getPostingProvider } = await import('../src/lib/posting/client.ts');

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const scheduler = new PostingScheduler(supabase, WORKSPACE_ID);

const [, , command, ...args] = process.argv;

switch (command) {
  case 'schedule': {
    const [content_id, account_id, minutesStr = '0'] = args;
    if (!content_id || !account_id) {
      console.error('Usage: pnpm post:schedule <content_id> <account_id> [minutes_from_now]');
      process.exit(1);
    }
    const when = new Date(Date.now() + parseInt(minutesStr, 10) * 60_000);
    console.log(`📅 Scheduling content=${content_id.slice(0, 8)} on account=${account_id.slice(0, 8)} at ${when.toISOString()}…`);
    const post = await scheduler.schedule({
      content_id,
      account_id,
      scheduled_at: when,
    });
    console.log(`✅ Scheduled post ${post.id}`);
    break;
  }

  case 'tick': {
    const provider = getPostingProvider();
    console.log(`🔄 Provider: ${provider.name}`);
    console.log(`🕐 Processing due posts…\n`);
    const result = await scheduler.tick();
    console.log(`Processed: ${result.processed}`);
    console.log(`Published: ${result.published}`);
    console.log(`Failed:    ${result.failed}`);
    if (result.details.length > 0) {
      console.log(`\nDetails:`);
      for (const d of result.details) {
        const tag = d.post_id.slice(0, 8);
        console.log(`  • [${tag}] ${d.status}${d.error ? ` — ${d.error}` : ''}`);
      }
    }
    break;
  }

  case 'list': {
    const { data, error } = await supabase
      .from('post')
      .select('id, scheduled_at, published_at, status, posting_provider, platform_post_url, account_id, content_id')
      .eq('workspace_id', WORKSPACE_ID)
      .order('scheduled_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    if (!data || data.length === 0) {
      console.log('No posts. Schedule one with `pnpm post:schedule <content_id> <account_id>`.');
      break;
    }
    console.log(`Found ${data.length} posts:\n`);
    for (const p of data) {
      const tag = p.id.slice(0, 8);
      const when = p.published_at ?? p.scheduled_at;
      console.log(
        `  [${tag}] ${when.slice(0, 19)} ${p.status.padEnd(11)} ${p.posting_provider.padEnd(10)} url=${p.platform_post_url ?? '-'}`,
      );
    }
    break;
  }

  default:
    console.log(`Usage:
  pnpm post:schedule <content_id> <account_id> [minutes_from_now]
  pnpm post:tick
  pnpm post:list
`);
    process.exit(command ? 1 : 0);
}
