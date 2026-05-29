#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Multilogin bootstrap.
//
// One-shot: signin → generate automation token → fetch workspaces +
// folders → print the env vars you need to paste into .env.local.
//
// Usage:
//   pnpm multilogin:bootstrap <email> <password>            # interactive
//   MULTILOGIN_EMAIL=... MULTILOGIN_PASSWORD=... pnpm multilogin:bootstrap
//
// After this runs, paste the three printed lines into .env.local and
// you're set: every subsequent operation reads them from the env schema.
// ─────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '..', '.env.local') });

const CLOUD_BASE = process.env.MULTILOGIN_API_BASE ?? 'https://api.multilogin.com';

const email = process.argv[2] ?? process.env.MULTILOGIN_EMAIL;
const password = process.argv[3] ?? process.env.MULTILOGIN_PASSWORD;
const expirationPeriod = process.argv[4] ?? '8760h'; // ~1 year

if (!email || !password) {
  console.error('Usage: pnpm multilogin:bootstrap <email> <password> [expiration_period]');
  console.error('Or set MULTILOGIN_EMAIL + MULTILOGIN_PASSWORD in env.');
  process.exit(1);
}

async function call(method, path, body, token) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const url = path.startsWith('http') ? path : `${CLOUD_BASE}${path}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    console.error(`✗ ${method} ${path} → HTTP ${res.status}`);
    console.error('  Response:', JSON.stringify(json, null, 2));
    throw new Error(`HTTP ${res.status}`);
  }
  // Multilogin uses { status: {...}, data: T } envelope.
  return json?.data ?? json;
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Multilogin bootstrap');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Cloud API base:', CLOUD_BASE);
console.log('Email:', email);
console.log('');

// Step 1: signin
console.log('1/4  Signin (MD5-hashing password) …');
const passwordHash = createHash('md5').update(password).digest('hex');
const signinData = await call('POST', '/user/signin', { email, password: passwordHash });
const shortToken = signinData?.token;
if (!shortToken) {
  console.error('✗ signin returned no token. Response:', signinData);
  process.exit(1);
}
console.log('    short-lived token:', shortToken.slice(0, 20) + '…');
console.log('');

// Step 2: generate automation token (long-lived)
console.log(`2/4  Generate automation token (expires in ${expirationPeriod}) …`);
const autoData = await call(
  'POST',
  `/workspace/automation_token?expiration_period=${encodeURIComponent(expirationPeriod)}`,
  undefined,
  shortToken,
);
const autoToken = autoData?.token ?? autoData;
if (typeof autoToken !== 'string' || autoToken.length < 20) {
  console.error('✗ automation_token returned unexpected shape. Full response:', autoData);
  process.exit(1);
}
console.log('    automation token:', autoToken.slice(0, 20) + '…');
console.log('');

// Step 3: list workspaces
console.log('3/4  List workspaces …');
const workspaces = await call('GET', '/workspace', undefined, autoToken);
const wsArray = Array.isArray(workspaces) ? workspaces : (workspaces?.workspaces ?? []);
if (wsArray.length === 0) {
  console.error('✗ No workspaces returned. Response:', workspaces);
  process.exit(1);
}
const ws = wsArray[0];
const wsId = ws.id ?? ws.uuid ?? ws.workspace_id;
console.log(`    found ${wsArray.length} workspace(s); using first: ${ws.name ?? '(unnamed)'} (${wsId})`);
console.log('');

// Step 4: list folders for that workspace
console.log('4/4  List folders …');
// Try a couple of likely paths — Multilogin's exact folder endpoint isn't
// quoted verbatim in the public help articles. Probe both shapes.
let folders = [];
const tryPaths = [
  `/workspace/${encodeURIComponent(wsId)}/folders`,
  `/workspace/folders?workspace_id=${encodeURIComponent(wsId)}`,
  `/workspace/folder?workspace_id=${encodeURIComponent(wsId)}`,
  `/folder`,
];
for (const p of tryPaths) {
  try {
    const r = await call('GET', p, undefined, autoToken);
    folders = Array.isArray(r) ? r : (r?.folders ?? r?.data ?? []);
    if (folders.length > 0) {
      console.log(`    found ${folders.length} folder(s) via ${p}`);
      break;
    }
  } catch {
    // try next
  }
}
if (folders.length === 0) {
  console.warn('    ⚠ No folders discovered. You may need to create one in the Multilogin UI first');
  console.warn('      and then re-run this script, or fill MULTILOGIN_FOLDER_ID manually.');
}
const folder = folders[0];
const folderId = folder?.id ?? folder?.uuid ?? folder?.folder_id;

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✓ Paste these into .env.local:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log(`MULTILOGIN_API_TOKEN=${autoToken}`);
console.log(`MULTILOGIN_WORKSPACE_ID=${wsId}`);
if (folderId) console.log(`MULTILOGIN_FOLDER_ID=${folderId}`);
console.log('');
if (folders.length > 1) {
  console.log('Other folders in this workspace:');
  for (const f of folders) {
    console.log(`  · ${f.name ?? '(unnamed)'} → ${f.id ?? f.uuid ?? f.folder_id}`);
  }
}
console.log('');
console.log('Then restart any running dev/script process so it picks up the new env.');
