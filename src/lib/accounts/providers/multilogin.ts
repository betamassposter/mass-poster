import { env } from '../../env.ts';
import type {
  ActiveBrowser,
  AntidetectProvider,
  BrowserProfile,
  BrowserProfileSpec,
} from '../types.ts';

/**
 * Multilogin Cloud Phones provider.
 *
 * Replaces AdsPower as the antidetect substrate. Multilogin hosts the
 * device in their cloud (real Android instances), exposes lifecycle via
 * REST API, and stamps the proxy/geo coherently with the device fingerprint.
 *
 * API base: https://api.multilogin.com (configurable via MULTILOGIN_API_BASE)
 *
 * Endpoint shape (verified against the Multilogin API docs as of pivot date):
 *   POST /user/signin                                  → returns bearer token
 *   GET  /workspace/profile                            → list profiles
 *   POST /profile/create                               → create profile (Cloud Phone)
 *   POST /profile/{id}/start                           → boot Cloud Phone, returns wsEndpoint
 *   POST /profile/{id}/stop                            → release Cloud Phone
 *   DELETE /profile/{id}                               → delete profile
 *
 * NOTE: This is a SCAFFOLD. The credential pair (MULTILOGIN_API_TOKEN +
 * MULTILOGIN_WORKSPACE_ID) is not yet provisioned. All write methods
 * throw with a helpful message if the token is missing. The shape of
 * requests/responses follows Multilogin's public documentation; minor
 * tweaks may be needed when real credentials are wired and we observe
 * the actual response payloads.
 */

const DEFAULT_BASE = 'https://api.multilogin.com';

interface MultiloginProfileResponse {
  uuid: string;
  name: string;
  status?: string;
  cloud_phone?: {
    instance_id?: string;
    region?: string;
  };
}

interface MultiloginStartResponse {
  uuid: string;
  ws_endpoint?: string;
  cdp_endpoint?: string;
  cloud_phone_instance_id?: string;
}

export class MultiloginCloudPhoneProvider implements AntidetectProvider {
  readonly name = 'multilogin';
  private baseUrl: string;
  private token: string | undefined;
  private workspaceId: string | undefined;

  constructor(opts?: { baseUrl?: string; token?: string; workspaceId?: string }) {
    this.baseUrl = opts?.baseUrl ?? env.MULTILOGIN_API_BASE ?? DEFAULT_BASE;
    this.token = opts?.token ?? env.MULTILOGIN_API_TOKEN;
    this.workspaceId = opts?.workspaceId ?? env.MULTILOGIN_WORKSPACE_ID;
  }

  async isReady(): Promise<boolean> {
    if (!this.token || !this.workspaceId) return false;
    try {
      const res = await this.request<{ workspace_id: string }>('GET', '/workspace/profile?limit=1');
      return Boolean(res);
    } catch {
      return false;
    }
  }

  async createProfile(spec: BrowserProfileSpec): Promise<BrowserProfile> {
    this.requireCreds();
    const body: Record<string, unknown> = {
      workspace_id: this.workspaceId,
      name: spec.name,
      // Cloud Phone profile — mobile Android instance hosted by Multilogin.
      browser_type: 'cloud_phone_android',
      device_type: spec.device === 'mobile_ios' ? 'ios' : 'android',
      os: spec.device === 'mobile_ios' ? 'ios' : 'android',
      group: spec.group ?? 'default',
      fingerprint: {
        timezone: 'auto',
        language: 'auto',
        canvas: 'noise',
        webgl: 'noise',
        audio: 'noise',
        webrtc: 'proxied',
      },
    };
    if (spec.proxy) {
      body.proxy = {
        type: spec.proxy.type,
        host: spec.proxy.host,
        port: spec.proxy.port,
        username: spec.proxy.username,
        password: spec.proxy.password,
        country: spec.proxy.country,
      };
    }
    if (spec.user_agent) {
      (body.fingerprint as Record<string, unknown>).user_agent = spec.user_agent;
    }
    if (spec.open_url) {
      body.start_url = spec.open_url;
    }

    const data = await this.request<MultiloginProfileResponse>(
      'POST',
      '/profile/create',
      body,
    );
    return {
      profile_id: data.uuid,
      name: spec.name,
      provider: this.name,
      proxy: spec.proxy,
    };
  }

  async listProfiles(): Promise<BrowserProfile[]> {
    this.requireCreds();
    const data = await this.request<{ profiles: MultiloginProfileResponse[] }>(
      'GET',
      `/workspace/profile?workspace_id=${encodeURIComponent(this.workspaceId!)}&limit=100`,
    );
    return (data.profiles ?? []).map((p) => ({
      profile_id: p.uuid,
      name: p.name,
      provider: this.name,
    }));
  }

  async startBrowser(profile_id: string): Promise<ActiveBrowser> {
    this.requireCreds();
    const data = await this.request<MultiloginStartResponse>(
      'POST',
      `/profile/${encodeURIComponent(profile_id)}/start`,
    );
    return {
      profile_id,
      webdriver_endpoint: data.cdp_endpoint ?? data.ws_endpoint ?? '',
      ws_endpoint: data.ws_endpoint,
    };
  }

  async stopBrowser(profile_id: string): Promise<void> {
    this.requireCreds();
    await this.request<unknown>(
      'POST',
      `/profile/${encodeURIComponent(profile_id)}/stop`,
    );
  }

  async deleteProfile(profile_id: string): Promise<void> {
    this.requireCreds();
    await this.request<unknown>(
      'DELETE',
      `/profile/${encodeURIComponent(profile_id)}`,
    );
  }

  private requireCreds(): void {
    if (!this.token) {
      throw new Error(
        'MULTILOGIN_API_TOKEN missing. Set it in .env.local — see https://multilogin.com/docs/api',
      );
    }
    if (!this.workspaceId) {
      throw new Error(
        'MULTILOGIN_WORKSPACE_ID missing. Set it in .env.local (from your Multilogin dashboard).',
      );
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new Error(
        `Multilogin API unreachable at ${this.baseUrl}: ${(err as Error).message}`,
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Multilogin HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}
