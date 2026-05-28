import type {
  ActiveBrowser,
  AntidetectProvider,
  BrowserProfile,
  BrowserProfileSpec,
} from '../types.ts';

/**
 * Mock antidetect provider — in-memory profile store. Useful for dev
 * without AdsPower installed. All "browsers" are virtual (no actual launch).
 *
 * Pattern: same shape as the real AdsPower provider, so flipping
 * ADSPOWER_API_BASE / installing AdsPower swaps it in transparently.
 */
export class MockAntidetectProvider implements AntidetectProvider {
  readonly name = 'mock-antidetect';
  private profiles = new Map<string, BrowserProfile>();
  private counter = 0;

  async isReady(): Promise<boolean> {
    return true;
  }

  async createProfile(spec: BrowserProfileSpec): Promise<BrowserProfile> {
    const profile_id = `mock-${(++this.counter).toString().padStart(4, '0')}`;
    const profile: BrowserProfile = {
      profile_id,
      name: spec.name,
      provider: this.name,
      proxy: spec.proxy,
    };
    this.profiles.set(profile_id, profile);
    return profile;
  }

  async listProfiles(): Promise<BrowserProfile[]> {
    return Array.from(this.profiles.values());
  }

  async startBrowser(profile_id: string): Promise<ActiveBrowser> {
    if (!this.profiles.has(profile_id)) {
      throw new Error(`Mock profile ${profile_id} not found`);
    }
    return {
      profile_id,
      webdriver_endpoint: `mock://webdriver/${profile_id}`,
      ws_endpoint: `ws://mock/${profile_id}`,
      pid: 0,
    };
  }

  async stopBrowser(_profile_id: string): Promise<void> {
    // no-op
  }

  async deleteProfile(profile_id: string): Promise<void> {
    this.profiles.delete(profile_id);
  }
}
