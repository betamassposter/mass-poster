import { AdsPowerProvider } from './providers/adspower.ts';
import { MockAntidetectProvider } from './providers/mock-antidetect.ts';
import { MockProxyProvider } from './providers/mock-proxy.ts';
import type { AntidetectProvider, ProxyProvider } from './types.ts';

/**
 * Factory for the antidetect provider.
 * Auto-detects AdsPower app reachability; falls back to mock.
 */
export async function getAntidetectProvider(): Promise<AntidetectProvider> {
  const override = process.env.ANTIDETECT_PROVIDER as
    | 'adspower'
    | 'mock'
    | undefined;
  if (override === 'mock') return new MockAntidetectProvider();
  if (override === 'adspower') return new AdsPowerProvider();

  // Auto-detect: ping AdsPower
  const ads = new AdsPowerProvider();
  if (await ads.isReady()) return ads;

  console.warn(
    '⚠️  AdsPower app not reachable at ' +
      (process.env.ADSPOWER_API_BASE ?? 'http://local.adspower.net:50325') +
      ' — falling back to MockAntidetectProvider. Install + launch AdsPower for real profiles.',
  );
  return new MockAntidetectProvider();
}

/** Synchronous variant for cases where we know it's mock (e.g. CLI bootstrap). */
export function getAntidetectProviderSync(): AntidetectProvider {
  const override = process.env.ANTIDETECT_PROVIDER as
    | 'adspower'
    | 'mock'
    | undefined;
  if (override === 'adspower') return new AdsPowerProvider();
  // Default to AdsPower; isReady will be called by orchestrator before use.
  return new AdsPowerProvider();
}

export function getProxyProvider(): ProxyProvider {
  const override = process.env.PROXY_PROVIDER as
    | 'iproyal'
    | 'soax'
    | 'mock'
    | undefined;
  // Real providers come later when keys arrive. Default = mock.
  if (override === 'iproyal' || override === 'soax') {
    throw new Error(`${override} provider not yet implemented. Use mock.`);
  }
  return new MockProxyProvider();
}
