#!/usr/bin/env node
/**
 * Apply Supabase migrations to the remote project via direct Postgres connection.
 *
 * Why this script vs `supabase db push`?
 *  - `supabase db push` richiede `supabase login` (OAuth via browser), che da
 *    extension VSCode è difficile da orchestrare.
 *  - Questo script usa la direct connection Postgres con la db password,
 *    iniettata via env var, MAI salvata su disco.
 *
 * Uso:
 *   SUPABASE_DB_PASSWORD='your-password' pnpm db:apply
 *
 * Idempotente: skipa i file già applicati (basandosi su una tabella
 * `_mp_migrations` che creiamo come tracker).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config as loadEnv } from 'dotenv';

// Carica .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
loadEnv({ path: join(repoRoot, '.env.local') });

const password = process.env.SUPABASE_DB_PASSWORD;
const projectRef = process.env.SUPABASE_PROJECT_REF;

if (!password) {
  console.error('❌ SUPABASE_DB_PASSWORD non impostata.');
  console.error('   Esegui:');
  console.error("   SUPABASE_DB_PASSWORD='your-pwd' pnpm db:apply");
  process.exit(1);
}
if (!projectRef) {
  console.error('❌ SUPABASE_PROJECT_REF non in .env.local');
  process.exit(1);
}

// Supabase ha deprecato il direct IPv4. Usiamo il session pooler (porta 5432, DDL-safe).
// Region default eu-central-1 (Frankfurt). Override via SUPABASE_DB_REGION se necessario.
const region = process.env.SUPABASE_DB_REGION || 'eu-central-1';
const host =
  process.env.SUPABASE_DB_HOST || `aws-0-${region}.pooler.supabase.com`;
const port = Number(process.env.SUPABASE_DB_PORT || 5432);
const user =
  process.env.SUPABASE_DB_USER || `postgres.${projectRef}`;

console.log(`🔗 Connecting to ${host}:${port} as ${user} …`);

const client = new pg.Client({
  host,
  port,
  database: 'postgres',
  user,
  password,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  console.log('✅ Connected.\n');

  // Tracker table
  await client.query(`
    create table if not exists public._mp_migrations (
      file text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const migrationsDir = join(repoRoot, 'supabase', 'migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows: alreadyApplied } = await client.query(
    'select file from public._mp_migrations',
  );
  const applied = new Set(alreadyApplied.map((r) => r.file));

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭️  skip   ${file}`);
      skippedCount++;
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`▶️  apply  ${file}`);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into public._mp_migrations (file) values ($1)',
        [file],
      );
      await client.query('commit');
      console.log(`   ✅ ok`);
      appliedCount++;
    } catch (err) {
      await client.query('rollback');
      console.error(`   ❌ FAILED:`, err.message);
      throw err;
    }
  }

  // Seed (idempotente per design)
  const seedPath = join(repoRoot, 'supabase', 'seed.sql');
  try {
    const seed = readFileSync(seedPath, 'utf8');
    console.log(`\n🌱 Applying seed.sql …`);
    await client.query(seed);
    console.log('   ✅ ok');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`   ⚠️  seed.sql warning:`, err.message);
    }
  }

  console.log(
    `\n🎉 Done — applied ${appliedCount}, skipped ${skippedCount}, total ${files.length}.`,
  );

  // Verify
  const { rows: tables } = await client.query(`
    select tablename from pg_tables
    where schemaname = 'public'
    order by tablename;
  `);
  console.log(`\n📊 Tables in public schema:`);
  for (const { tablename } of tables) console.log(`   • ${tablename}`);
} catch (err) {
  console.error('\n💥 Migration failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
