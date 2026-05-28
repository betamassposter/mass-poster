import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

/**
 * API key management.
 *
 * Key format: `mp_<env>_<24 base64url chars>`
 *   - mp_live_aB3xY7zQrL5pMnD9eFg2hJk1
 *   - mp_test_AbCdEfGhIjKlMnOpQrStUv12
 *
 * Storage: we never store the full key. Only:
 *   - key_prefix: first 12 chars (mp_live_xxxxxxxx) — for UI identification
 *   - key_hash: sha256 of full key — for lookup on incoming request
 *
 * Verification: client sends `Authorization: Bearer mp_live_...`. Server
 * hashes incoming token and looks up by hash. O(1) indexed lookup.
 */

export interface ApiKeyRecord {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  enabled: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ApiKeyCreateInput {
  workspace_id: string;
  name: string;
  scopes?: ('read' | 'write' | 'admin')[];
  /** ISO timestamp; null = no expiry. */
  expires_at?: string | null;
  /** 'live' or 'test'. */
  env?: 'live' | 'test';
  created_by_user_id?: string;
}

export interface ApiKeyCreateResult {
  /** The full secret key. Returned ONCE at creation — store it now or lose it. */
  full_key: string;
  record: ApiKeyRecord;
}

/**
 * Generate + persist a new API key.
 * Returns the full key (which we'll never show again) + the DB record.
 */
export async function createApiKey(
  supabase: SupabaseClient,
  input: ApiKeyCreateInput,
): Promise<ApiKeyCreateResult> {
  const env = input.env ?? 'live';
  const random = randomBytes(18).toString('base64url'); // 24 chars
  const full_key = `mp_${env}_${random}`;
  const key_prefix = full_key.slice(0, 12); // mp_live_aB3xY7zQ
  const key_hash = sha256(full_key);

  const { data, error } = await supabase
    .from('api_key')
    .insert({
      workspace_id: input.workspace_id,
      name: input.name,
      key_prefix,
      key_hash,
      scopes: input.scopes ?? ['read'],
      enabled: true,
      expires_at: input.expires_at ?? null,
      created_by_user_id: input.created_by_user_id ?? null,
    })
    .select('id, workspace_id, name, key_prefix, scopes, enabled, last_used_at, expires_at, created_at')
    .single();
  if (error || !data) throw new Error(`Failed to create API key: ${error?.message ?? 'unknown'}`);

  return { full_key, record: data as ApiKeyRecord };
}

/** Verify an incoming bearer token. Returns the matching record or null. */
export async function verifyApiKey(
  supabase: SupabaseClient,
  bearer: string,
): Promise<ApiKeyRecord | null> {
  if (!bearer.startsWith('mp_')) return null;
  const hash = sha256(bearer);

  const { data, error } = await supabase
    .from('api_key')
    .select('id, workspace_id, name, key_prefix, scopes, enabled, last_used_at, expires_at, created_at')
    .eq('key_hash', hash)
    .eq('enabled', true)
    .maybeSingle();
  if (error || !data) return null;

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  // Update last_used_at (best-effort, fire-and-forget)
  void supabase
    .from('api_key')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return data as ApiKeyRecord;
}

export async function revokeApiKey(
  supabase: SupabaseClient,
  api_key_id: string,
): Promise<void> {
  await supabase.from('api_key').update({ enabled: false }).eq('id', api_key_id);
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** Check if a key has a particular scope. */
export function hasScope(record: ApiKeyRecord, scope: string): boolean {
  if (record.scopes.includes('admin')) return true;
  return record.scopes.includes(scope);
}
