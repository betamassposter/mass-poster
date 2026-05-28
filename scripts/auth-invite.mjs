#!/usr/bin/env node
/**
 * Attach an email to the seed workspace.
 *
 * Usage: pnpm auth:invite <email>
 *
 * What it does:
 *   1. Looks up the user in auth.users by email (service_role).
 *      If absent, creates the user as confirmed (no email verification).
 *   2. Inserts a `workspace_member` row (workspace_id seed, role='owner')
 *      if missing.
 *   3. Prints the user_id + magic-link instruction.
 *
 * Use this before someone signs in for the first time so their auth.users
 * row is already attached to the workspace (otherwise getSession() returns
 * 0 workspaces and they'd be stranded).
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const email = process.argv[2];
if (!email) {
  console.error('Usage: pnpm auth:invite <email>');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// 1. Find or create the user
let userId;
const { data: listed, error: listErr } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (listErr) {
  console.error(`Failed to list users: ${listErr.message}`);
  process.exit(1);
}
const existing = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (existing) {
  userId = existing.id;
  console.log(`✅ Found existing user: ${userId}`);
} else {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    console.error(`Failed to create user: ${createErr?.message}`);
    process.exit(1);
  }
  userId = created.user.id;
  console.log(`✅ Created user: ${userId}`);
}

// 2. Attach to workspace
const { data: existingMember } = await supabase
  .from('workspace_member')
  .select('workspace_id, role')
  .eq('workspace_id', WORKSPACE_ID)
  .eq('user_id', userId)
  .maybeSingle();

if (existingMember) {
  console.log(`ℹ️  Already member of workspace ${WORKSPACE_ID} (role: ${existingMember.role})`);
} else {
  const { error: insErr } = await supabase
    .from('workspace_member')
    .insert({ workspace_id: WORKSPACE_ID, user_id: userId, role: 'owner' });
  if (insErr) {
    console.error(`Failed to insert workspace_member: ${insErr.message}`);
    process.exit(1);
  }
  console.log(`✅ Attached as owner of workspace ${WORKSPACE_ID}`);
}

// 3. Update workspace owner if not set
await supabase
  .from('workspace')
  .update({ owner_user_id: userId })
  .eq('id', WORKSPACE_ID)
  .is('owner_user_id', null);

console.log(`\n👉 Now sign in:`);
console.log(`   1. pnpm dev`);
console.log(`   2. Open http://localhost:3000/login`);
console.log(`   3. Enter ${email} and click the magic link in your inbox.`);
