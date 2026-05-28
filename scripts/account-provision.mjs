#!/usr/bin/env node
/**
 * CLI: provision proxy pool and/or create accounts for the seeded brand.
 *
 * Usage:
 *   pnpm account:proxies <count>            # rent N mock proxies
 *   pnpm account:create <platform>          # create 1 account for current brand
 *   pnpm account:list                       # list accounts in DB
 *   pnpm account:start <account_id>         # open browser for an account
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const { AccountOrchestrator } = await import('../src/lib/accounts/orchestrator.ts');
const { getAntidetectProvider } = await import('../src/lib/accounts/client.ts');

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const orchestrator = new AccountOrchestrator(supabase, WORKSPACE_ID);

const [, , command, ...args] = process.argv;

switch (command) {
  case 'proxies': {
    const count = parseInt(args[0] ?? '5', 10);
    console.log(`🌐 Renting ${count} proxies (mock unless PROXY_PROVIDER set)…`);
    const proxies = await orchestrator.provisionProxyPool(count, 'IT');
    console.log(`✅ Inserted ${proxies.length} proxies:`);
    for (const p of proxies) {
      console.log(`   • ${p.host}:${p.port} (${p.country}) [${p.status}]`);
    }
    break;
  }

  case 'create': {
    const platform = args[0] ?? 'instagram';
    if (!['instagram', 'tiktok', 'youtube_shorts', 'x', 'linkedin', 'facebook'].includes(platform)) {
      console.error(`Invalid platform: ${platform}`);
      process.exit(1);
    }

    // Find the maplo brand for the test
    const { data: brand } = await supabase
      .from('brand')
      .select('id, name, slug')
      .eq('workspace_id', WORKSPACE_ID)
      .eq('slug', 'maplo')
      .single();
    if (!brand) {
      console.error('Brand "maplo" not found. Run `pnpm brand:seed` first.');
      process.exit(1);
    }

    const antidetect = await getAntidetectProvider();
    console.log(`🤖 Antidetect provider: ${antidetect.name}`);
    console.log(`🏷️  Brand: ${brand.name} (${brand.slug})`);
    console.log(`📱 Platform: ${platform}\n`);

    const result = await orchestrator.createAccount({
      brand_id: brand.id,
      workspace_id: WORKSPACE_ID,
      platform,
      origin: 'manual',
      country: 'IT',
    });

    console.log(`✅ Account created`);
    console.log(`   account_id:          ${result.account_id}`);
    console.log(`   adspower_profile_id: ${result.adspower_profile_id}`);
    console.log(`   proxy_id:            ${result.proxy_id ?? '(none)'}`);
    console.log(`   handle:              @${result.handle}`);
    console.log(`   status:              ${result.status}`);
    console.log(`\nNext steps:`);
    console.log(`   • Start browser: pnpm account:start ${result.account_id}`);
    console.log(`   • After signup:  orchestrator.markWarmup('${result.account_id}')`);
    break;
  }

  case 'list': {
    const { data, error } = await supabase
      .from('account')
      .select('id, handle, platform, status, health_score, adspower_profile_id, created_at')
      .eq('workspace_id', WORKSPACE_ID)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) {
      console.log('No accounts yet. Create one with `pnpm account:create <platform>`.');
      break;
    }
    console.log(`Found ${data.length} accounts:\n`);
    for (const a of data) {
      const tag = a.id.slice(0, 8);
      console.log(
        `  [${tag}] ${a.platform.padEnd(15)} @${a.handle.padEnd(20)} ${a.status.padEnd(13)} health=${a.health_score} ads_id=${a.adspower_profile_id ?? '-'}`,
      );
    }
    break;
  }

  case 'start': {
    const account_id = args[0];
    if (!account_id) {
      console.error('Usage: pnpm account:start <account_id>');
      process.exit(1);
    }
    console.log(`🚀 Starting browser for ${account_id}…`);
    const browser = await orchestrator.startBrowser(account_id);
    console.log(`✅ Browser started`);
    console.log(`   webdriver: ${browser.webdriver_endpoint}`);
    console.log(`   ws:        ${browser.ws_endpoint ?? '(none)'}`);
    console.log(`   pid:       ${browser.pid ?? '(unknown)'}`);
    break;
  }

  case 'health': {
    const antidetect = await getAntidetectProvider();
    const ok = await antidetect.isReady();
    console.log(`Antidetect provider: ${antidetect.name}`);
    console.log(`Ready: ${ok ? '✅ yes' : '❌ no'}`);
    break;
  }

  default:
    console.log(`Usage:
  pnpm account:health              # check AdsPower app is running
  pnpm account:proxies <count>     # rent N proxies (mock)
  pnpm account:create <platform>   # create 1 account for brand "maplo"
  pnpm account:list                # list all accounts
  pnpm account:start <account_id>  # open browser for an account

Platforms: instagram tiktok youtube_shorts x linkedin facebook
`);
    process.exit(command ? 1 : 0);
}
