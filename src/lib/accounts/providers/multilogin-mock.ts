import type {
  ActiveBrowser,
  AntidetectProvider,
  BrowserProfile,
  BrowserProfileSpec,
} from '../types.ts';
import { logger } from '../../log.ts';

const log = logger('accounts/multilogin-mock');

/**
 * Offline mock of the Multilogin Cloud Phone provider.
 *
 * Use cases:
 *  - End-to-end orchestrator tests that should not burn Multilogin units
 *  - Local dev when Multilogin Cloud is unreachable / not yet provisioned
 *  - CI runs (no real signin)
 *
 * Behavior:
 *  - `createProfile` returns a deterministic fake `profile_id` (`mock-<hash>`)
 *    and stores the profile in-memory so subsequent `listProfiles` reflects it.
 *  - `startBrowser` returns a fake CDP URL `http://127.0.0.1:0` — DO NOT
 *    actually connect Playwright to it. Tests should mock the browser layer
 *    above this provider, not drive a real browser through the mock.
 *  - `stopBrowser` / `deleteProfile` are no-ops that log.
 *  - Mobile methods throw — same scaffolding as the real provider.
 *
 * Selection: enable via env `MULTILOGIN_PROVIDER=mock` (read in
 * `src/lib/accounts/client.ts::getAntidetectProvider`). When unset and
 * MULTILOGIN_API_TOKEN is missing, callers should fall back to mock in dev.
 */
export class MultiloginMockProvider implements AntidetectProvider {
  readonly name = 'multilogin-mock';
  private profiles = new Map<string, BrowserProfile>();
  private nextPort = 50000;

  async isReady(): Promise<boolean> {
    return true;
  }

  async createProfile(spec: BrowserProfileSpec): Promise<BrowserProfile> {
    // Deterministic id derived from name + proxy host, so the same call
    // returns the same id on repeat — useful for idempotency tests.
    const stamp = `${spec.name}|${spec.proxy?.host ?? 'no-proxy'}`;
    const profile_id = `mock-${hash(stamp)}`;
    const profile: BrowserProfile = {
      profile_id,
      name: spec.name,
      provider: this.name,
      proxy: spec.proxy,
    };
    this.profiles.set(profile_id, profile);
    log.info('createProfile', { profile_id, name: spec.name, proxy: spec.proxy?.host });
    return profile;
  }

  async listProfiles(): Promise<BrowserProfile[]> {
    return Array.from(this.profiles.values());
  }

  async startBrowser(profile_id: string): Promise<ActiveBrowser> {
    if (!this.profiles.has(profile_id)) {
      throw new Error(`mock: profile ${profile_id} not found (createProfile() first)`);
    }
    const port = this.nextPort++;
    const cdp = `http://127.0.0.1:${port}`;
    log.warn('startBrowser returned a FAKE CDP endpoint', { profile_id, cdp });
    return {
      profile_id,
      webdriver_endpoint: cdp,
      ws_endpoint: cdp,
    };
  }

  async stopBrowser(profile_id: string): Promise<void> {
    log.info('stopBrowser (noop)', { profile_id });
  }

  async deleteProfile(profile_id: string): Promise<void> {
    this.profiles.delete(profile_id);
    log.info('deleteProfile', { profile_id });
  }
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
