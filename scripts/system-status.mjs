#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// System status — one-shot diagnostic.
//
// Prints, in order:
//   1. Env validation pass/fail
//   2. Supabase connectivity + key table counts
//   3. Provider readiness (Anthropic, FAL, ElevenLabs, Multilogin,
//      AbuseIPDB) — each ping is real, non-blocking on failure.
//   4. Quick activity snapshot (accounts, scheduled posts, last 24h).
//
// Exit code = 0 if everything ready, 1 if at least one P0 check failed.
// Use this before invoking expensive flows (multilogin:bootstrap, reel:gen).
// ─────────────────────────────────────────────────────────────

import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const C = {
  ok: '\x1b[32m✓\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
  warn: '\x1b[33m⚠\x1b[0m',
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let exitCode = 0;
const fails = [];

function section(title) {
  console.log('');
  console.log(C.bold(`━━━ ${title} ━━━`));
}

function row(label, status, detail = '') {
  const sym = status === 'ok' ? C.ok : status === 'warn' ? C.warn : C.fail;
  console.log(`  ${sym} ${label}${detail ? ' ' + C.dim(detail) : ''}`);
  if (status === 'fail') {
    fails.push(label);
    exitCode = 1;
  }
}

async function ping(name, fn) {
  try {
    const detail = await fn();
    row(name, 'ok', detail ?? '');
  } catch (err) {
    row(name, 'fail', err.message);
  }
}

// ─── 1. Env ────────────────────────────────────────────────
section('1/4 — Env validation');
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
for (const key of required) {
  if (process.env[key]) row(key, 'ok');
  else row(key, 'fail', 'missing');
}
const optional = {
  ANTHROPIC_API_KEY: 'Claude',
  FAL_KEY: 'FAL video',
  ELEVENLABS_API_KEY: 'ElevenLabs voice',
  MULTILOGIN_API_TOKEN: 'Multilogin Cloud',
  ABUSEIPDB_API_KEY: 'AbuseIPDB IP reputation',
  ZEROBOUNCE_API_KEY: 'ZeroBounce (email warmup)',
  ZERNIO_API_KEY: 'Zernio posting',
};
for (const [key, label] of Object.entries(optional)) {
  if (process.env[key]) row(`${label} key`, 'ok');
  else row(`${label} key`, 'warn', 'not set');
}

// ─── 2. Supabase ──────────────────────────────────────────
section('2/4 — Supabase');
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  row('Supabase', 'fail', 'URL or service role key missing');
} else {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  await ping('Supabase reachable', async () => {
    const { error } = await sb.from('workspace').select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return '';
  });
  const counts = [
    ['workspace', 'workspaces'],
    ['brand', 'brands'],
    ['account', 'accounts'],
    ['proxy', 'proxies'],
    ['post', 'posts'],
  ];
  for (const [table, label] of counts) {
    try {
      const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true });
      if (error) throw error;
      row(label, 'ok', `${count ?? 0}`);
    } catch (err) {
      row(label, 'warn', err.message);
    }
  }
}

// ─── 3. Provider readiness ────────────────────────────────
section('3/4 — Provider readiness');

if (process.env.ABUSEIPDB_API_KEY) {
  await ping('AbuseIPDB', async () => {
    const res = await fetch('https://api.abuseipdb.com/api/v2/check?ipAddress=8.8.8.8', {
      headers: { Key: process.env.ABUSEIPDB_API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return 'live (consumed 1 free credit)';
  });
} else {
  row('AbuseIPDB', 'warn', 'no key');
}

if (process.env.ZEROBOUNCE_API_KEY) {
  await ping('ZeroBounce email credits', async () => {
    const url = `https://api.zerobounce.net/v2/getcredits?api_key=${encodeURIComponent(
      process.env.ZEROBOUNCE_API_KEY,
    )}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return `${json.Credits ?? 'unknown'} credits left`;
  });
}

if (process.env.MULTILOGIN_API_TOKEN) {
  await ping('Multilogin Cloud API', async () => {
    // Use /workspace/folders — /workspace (list) is 403 on Pro plan,
    // /workspace/folders is 200 with a valid token.
    const res = await fetch('https://api.multilogin.com/workspace/folders', {
      headers: {
        Authorization: `Bearer ${process.env.MULTILOGIN_API_TOKEN}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const count = json?.data?.folders?.length ?? 0;
    return `auth ok, ${count} folder(s)`;
  });
} else {
  row('Multilogin Cloud API', 'warn', 'no token (run pnpm multilogin:bootstrap)');
}

if (process.env.ANTHROPIC_API_KEY) {
  await ping('Anthropic API key shape', async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key.startsWith('sk-ant-')) throw new Error('unexpected prefix');
    return 'shape valid (not pinged to avoid burning credits)';
  });
}

if (process.env.FAL_KEY) row('FAL key present', 'ok', '(not pinged)');
if (process.env.ELEVENLABS_API_KEY) row('ElevenLabs key present', 'ok', '(not pinged)');

// ─── 4. Activity snapshot ────────────────────────────────
section('4/4 — Activity snapshot (last 24h)');
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const items = [
    ['account', 'accounts created'],
    ['post', 'posts created'],
    ['proxy_validation_check', 'proxy checks run'],
  ];
  for (const [table, label] of items) {
    try {
      const { count, error } = await sb
        .from(table)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since);
      if (error) {
        // proxy_validation_check uses checked_at
        if (table === 'proxy_validation_check') {
          const retry = await sb
            .from(table)
            .select('id', { count: 'exact', head: true })
            .gte('checked_at', since);
          if (retry.error) throw retry.error;
          row(label, 'ok', `${retry.count ?? 0}`);
          continue;
        }
        throw error;
      }
      row(label, 'ok', `${count ?? 0}`);
    } catch (err) {
      row(label, 'warn', err.message);
    }
  }
} else {
  row('snapshot', 'warn', 'supabase not configured');
}

// ─── Summary ─────────────────────────────────────────────
console.log('');
if (exitCode === 0) {
  console.log(`${C.ok} ${C.bold('System ready.')}`);
} else {
  console.log(`${C.fail} ${C.bold(`${fails.length} P0 check(s) failed:`)} ${fails.join(', ')}`);
}
process.exit(exitCode);
