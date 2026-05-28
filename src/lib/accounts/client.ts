import { env } from '../env.ts';
import { AdsPowerProvider } from './providers/adspower.ts';
import { MockAntidetectProvider } from './providers/mock-antidetect.ts';
import { MockProxyProvider } from './providers/mock-proxy.ts';
import { MultiloginCloudPhoneProvider } from './providers/multilogin.ts';
import { MultiloginMobileProxyProvider } from './providers/multilogin-proxy.ts';
import type { AntidetectProvider, ProxyProvider } from './types.ts';

/**
 * Factory for the antidetect provider.
 *
 * Preference order (auto):
 *   1. Multilogin Cloud Phones if MULTILOGIN_API_TOKEN + MULTILOGIN_WORKSPACE_ID set.
 *      (Pivot 2026-05-28 — this is the preferred substrate going forward.)
 *   2. AdsPower local app if reachable on default port (legacy, kept until accounts
 *      using it are migrated).
 *   3. MockAntidetectProvider — dev-only fallback.
 *
 * Explicit override: ANTIDETECT_PROVIDER=multilogin|adspower|mock
 */
export async function getAntidetectProvider(): Promise<AntidetectProvider> {
  const override = process.env.ANTIDETECT_PROVIDER as
    | 'multilogin'
    | 'adspower'
    | 'mock'
    | undefined;
  if (override === 'mock') return new MockAntidetectProvider();
  if (override === 'multilogin') return new MultiloginCloudPhoneProvider();
  if (override === 'adspower') return new AdsPowerProvider();

  // Auto-detect: prefer Multilogin if credentials present and reachable.
  if (env.MULTILOGIN_API_TOKEN && env.MULTILOGIN_WORKSPACE_ID) {
    const ml = new MultiloginCloudPhoneProvider();
    if (await ml.isReady()) return ml;
  }

  // Fallback to AdsPower local.
  const ads = new AdsPowerProvider();
  if (await ads.isReady()) return ads;

  console.warn(
    '⚠️  No antidetect provider reachable (tried Multilogin + AdsPower) — falling back to MockAntidetectProvider.',
  );
  return new MockAntidetectProvider();
}

/** Synchronous variant for cases where we know it's mock (e.g. CLI bootstrap). */
export function getAntidetectProviderSync(): AntidetectProvider {
  const override = process.env.ANTIDETECT_PROVIDER as
    | 'multilogin'
    | 'adspower'
    | 'mock'
    | undefined;
  if (override === 'multilogin') return new MultiloginCloudPhoneProvider();
  if (override === 'adspower') return new AdsPowerProvider();
  // Default to Multilogin if creds present; otherwise AdsPower; isReady is
  // called by the orchestrator before any real use.
  if (env.MULTILOGIN_API_TOKEN && env.MULTILOGIN_WORKSPACE_ID) {
    return new MultiloginCloudPhoneProvider();
  }
  return new AdsPowerProvider();
}

/**
 * Factory for the proxy provider.
 *
 * Preference order:
 *   1. Multilogin Mobile Proxies if MULTILOGIN_API_TOKEN set (pivot).
 *   2. MockProxyProvider — dev-only.
 *
 * Explicit override: PROXY_PROVIDER=multilogin|iproyal|soax|mock
 */
export function getProxyProvider(): ProxyProvider {
  const override = process.env.PROXY_PROVIDER as
    | 'multilogin'
    | 'iproyal'
    | 'soax'
    | 'mock'
    | undefined;
  if (override === 'mock') return new MockProxyProvider();
  if (override === 'multilogin') return new MultiloginMobileProxyProvider();
  if (override === 'iproyal' || override === 'soax') {
    throw new Error(`${override} provider not yet implemented. Use 'multilogin' or 'mock'.`);
  }
  // Auto: prefer Multilogin Mobile Proxies if creds.
  if (env.MULTILOGIN_API_TOKEN && env.MULTILOGIN_WORKSPACE_ID) {
    return new MultiloginMobileProxyProvider();
  }
  return new MockProxyProvider();
}

// ─────────────────────────────────────────────────────────────
// IP reputation — re-export the validator for ergonomics.
// ─────────────────────────────────────────────────────────────
export { ProxyValidator } from './proxy-validator.ts';
