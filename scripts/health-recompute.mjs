#!/usr/bin/env node
/**
 * Recompute health_score for all accounts in the workspace.
 * Usage: pnpm account:rescore
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { recomputeAllHealth } = await import('../src/lib/accounts/health.ts');

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

console.log('🩺 Recomputing health for all accounts…\n');
const results = await recomputeAllHealth(supabase, WORKSPACE_ID);
if (results.length === 0) {
  console.log('No accounts.');
  process.exit(0);
}

console.log(`Updated ${results.length} accounts:\n`);
for (const r of results) {
  const trend = r.new > r.old ? '↑' : r.new < r.old ? '↓' : '=';
  console.log(`  [${r.account_id.slice(0, 8)}] ${r.old} ${trend} ${r.new}  ${r.signals.join(' · ')}`);
}
