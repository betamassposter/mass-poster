import { getSupabaseAdmin } from '../db/admin.ts';
import { logger } from '../log.ts';
import type { IpReputationResult } from './types.ts';

const log = logger('accounts/ip-reputation-cache');

/**
 * IP reputation cache — workspace-scoped, per-provider, TTL-bounded.
 *
 * Backed by the `ip_reputation_cache` table (migration 0013). Provider
 * implementations call `readCached()` before hitting the vendor API and
 * `writeCached()` on a fresh result.
 *
 * TTL default 24h is conservative: AbuseIPDB scores rarely flip in a day
 * for a stable IP. If the user toggles `IP_REPUTATION_STRICT` or a proxy
 * is marked as suspect, callers can pass a shorter TTL.
 *
 * On any DB error the cache is treated as a miss (no-throw). Burning an
 * extra free-tier credit is always preferable to blocking validation.
 */

const DEFAULT_TTL_SEC = 24 * 60 * 60;

export interface CacheKey {
  workspace_id: string;
  provider: string;
  ip: string;
}

export async function readCached(
  key: CacheKey,
): Promise<IpReputationResult | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('ip_reputation_cache')
      .select('clean,score,signals,raw,checked_at,expires_at')
      .eq('workspace_id', key.workspace_id)
      .eq('provider', key.provider)
      .eq('ip_address', key.ip)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      log.warn('cache read failed', { error: error.message, ...key });
      return null;
    }
    if (!data) return null;

    return {
      provider: key.provider,
      ip: key.ip,
      clean: data.clean as boolean,
      score: (data.score as number | null) ?? undefined,
      signals: (data.signals as IpReputationResult['signals']) ?? {},
      raw: data.raw ?? undefined,
      checked_at: data.checked_at as string,
    };
  } catch (err) {
    log.warn('cache read threw', { error: (err as Error).message, ...key });
    return null;
  }
}

export async function writeCached(
  key: CacheKey,
  result: IpReputationResult,
  ttlSec: number = DEFAULT_TTL_SEC,
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

    const { error } = await admin.from('ip_reputation_cache').upsert(
      {
        workspace_id: key.workspace_id,
        provider: key.provider,
        ip_address: key.ip,
        clean: result.clean,
        score: result.score ?? null,
        signals: result.signals ?? {},
        raw: result.raw ?? null,
        checked_at: result.checked_at,
        expires_at: expiresAt,
      },
      { onConflict: 'workspace_id,provider,ip_address' },
    );

    if (error) log.warn('cache write failed', { error: error.message, ...key });
  } catch (err) {
    log.warn('cache write threw', { error: (err as Error).message, ...key });
  }
}
