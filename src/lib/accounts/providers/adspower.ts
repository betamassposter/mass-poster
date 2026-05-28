import { env } from '../../env.ts';
import type {
  ActiveBrowser,
  AntidetectProvider,
  BrowserProfile,
  BrowserProfileSpec,
  DeviceProfile,
} from '../types.ts';

/**
 * AdsPower local API wrapper.
 *
 * AdsPower runs as a desktop app and exposes a local REST API at
 * `http://local.adspower.net:50325` (default) or `http://127.0.0.1:50325`.
 *
 * Docs (verified May 2026):
 *   https://help.adspower.com/docs/B-vfFm
 *
 * Endpoints used:
 *   GET  /status                                  → ping (returns {code:0, msg:"success"} if up)
 *   POST /api/v1/user/create                      → create profile
 *   POST /api/v1/user/update                      → edit profile
 *   GET  /api/v1/user/list                        → list profiles
 *   GET  /api/v1/user/delete                      → delete profile
 *   GET  /api/v1/browser/start?user_id=…          → launch, returns Selenium + ws endpoints
 *   GET  /api/v1/browser/stop?user_id=…           → close
 *   GET  /api/v1/browser/active                   → list running browsers
 *
 * Rate limit: 1 req/sec on free tier — we respect with a 1.1s spacing.
 */

const DEFAULT_BASE = 'http://local.adspower.net:50325';
const MIN_REQUEST_SPACING_MS = 1100;

interface AdsPowerEnvelope<T> {
  code: number;
  msg: string;
  data?: T;
}

interface AdsPowerCreateResponse {
  id: string; // = profile_id (user_id in AdsPower terminology)
}

interface AdsPowerListItem {
  user_id: string;
  name?: string;
  group_name?: string;
  user_proxy_config?: {
    proxy_type?: string;
    proxy_host?: string;
    proxy_port?: string;
    proxy_user?: string;
    proxy_password?: string;
  };
}

interface AdsPowerStartResponse {
  selenium_ws?: string;
  webdriver: string;
  debug_port?: string;
  ws?: { selenium?: string; puppeteer?: string };
  pid?: number;
}

export class AdsPowerProvider implements AntidetectProvider {
  readonly name = 'adspower';
  private baseUrl: string;
  private lastRequestAt = 0;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? env.ADSPOWER_API_BASE ?? DEFAULT_BASE;
  }

  async isReady(): Promise<boolean> {
    try {
      const res = await this.request<{ code: number; msg: string }>('GET', '/status');
      return res.code === 0;
    } catch {
      return false;
    }
  }

  async createProfile(spec: BrowserProfileSpec): Promise<BrowserProfile> {
    const body: Record<string, unknown> = {
      name: spec.name,
      group_id: '0',
      open_urls: spec.open_url ? [spec.open_url] : [],
      fingerprint_config: this.fingerprintConfig(spec.device, spec.user_agent),
    };
    if (spec.proxy) {
      body.user_proxy_config = {
        proxy_soft: 'other',
        proxy_type: spec.proxy.type,
        proxy_host: spec.proxy.host,
        proxy_port: String(spec.proxy.port),
        proxy_user: spec.proxy.username ?? '',
        proxy_password: spec.proxy.password ?? '',
      };
    } else {
      body.user_proxy_config = { proxy_soft: 'no_proxy' };
    }
    const data = await this.request<AdsPowerCreateResponse>(
      'POST',
      '/api/v1/user/create',
      body,
    );
    return {
      profile_id: data.id,
      name: spec.name,
      provider: this.name,
      proxy: spec.proxy,
    };
  }

  async listProfiles(): Promise<BrowserProfile[]> {
    const data = await this.request<{ list: AdsPowerListItem[] }>(
      'GET',
      '/api/v1/user/list?page=1&page_size=100',
    );
    return (data.list ?? []).map((p) => ({
      profile_id: p.user_id,
      name: p.name ?? '(unnamed)',
      provider: this.name,
      proxy: p.user_proxy_config?.proxy_host
        ? {
            host: p.user_proxy_config.proxy_host,
            port: Number(p.user_proxy_config.proxy_port ?? 0),
            username: p.user_proxy_config.proxy_user,
            password: p.user_proxy_config.proxy_password,
            type: (p.user_proxy_config.proxy_type as 'http' | 'https' | 'socks5') ?? 'http',
          }
        : undefined,
    }));
  }

  async startBrowser(profile_id: string): Promise<ActiveBrowser> {
    const data = await this.request<AdsPowerStartResponse>(
      'GET',
      `/api/v1/browser/start?user_id=${encodeURIComponent(profile_id)}`,
    );
    return {
      profile_id,
      webdriver_endpoint: data.webdriver,
      ws_endpoint: data.ws?.puppeteer ?? data.ws?.selenium ?? data.selenium_ws,
      pid: data.pid,
    };
  }

  async stopBrowser(profile_id: string): Promise<void> {
    await this.request<unknown>(
      'GET',
      `/api/v1/browser/stop?user_id=${encodeURIComponent(profile_id)}`,
    );
  }

  async deleteProfile(profile_id: string): Promise<void> {
    await this.request<unknown>('POST', '/api/v1/user/delete', { user_ids: [profile_id] });
  }

  /**
   * Fingerprint config — AdsPower auto-randomizes most fields if left null.
   * We pin device family (browser_kernel, os, ua) for mobile vs desktop.
   *
   * Mobile = essenziale per IG/TT: shadowban rates ~3-4× lower per account che
   * vivono coerentemente come "iPhone" rispetto a desktop UA.
   */
  private fingerprintConfig(device: DeviceProfile, ua?: string): Record<string, unknown> {
    const base: Record<string, unknown> = {
      automatic_timezone: '1',
      language: ['en-US', 'en'],
      webrtc: 'proxy',
      timezone: '',
      flash: 'allow',
      fonts: ['all'],
      canvas: 'noise',
      webgl_image: 'noise',
      webgl: 'noise',
      audio: 'noise',
    };
    if (device === 'mobile_ios') {
      Object.assign(base, {
        browser_kernel_config: { version: 'ua_auto', type: 'chrome' },
        ua: ua ?? '',
        os: 'ios',
        device_memory: '4',
        hardware_concurrency: '6',
      });
    } else if (device === 'mobile_android') {
      Object.assign(base, {
        browser_kernel_config: { version: 'ua_auto', type: 'chrome' },
        ua: ua ?? '',
        os: 'android',
        device_memory: '6',
        hardware_concurrency: '8',
      });
    } else {
      Object.assign(base, {
        browser_kernel_config: { version: 'ua_auto', type: 'chrome' },
        ua: ua ?? '',
        os: 'macos',
        device_memory: '8',
        hardware_concurrency: '10',
      });
    }
    return base;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    // Throttle to AdsPower's 1 req/sec limit.
    const wait = MIN_REQUEST_SPACING_MS - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();

    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new Error(
        `AdsPower unreachable at ${this.baseUrl}. Is the AdsPower app running? (${(err as Error).message})`,
      );
    }
    if (!res.ok) throw new Error(`AdsPower HTTP ${res.status} ${res.statusText}`);
    const env = (await res.json()) as AdsPowerEnvelope<T>;
    if (env.code !== 0) {
      throw new Error(`AdsPower error: ${env.msg} (code ${env.code})`);
    }
    return env.data as T;
  }
}
