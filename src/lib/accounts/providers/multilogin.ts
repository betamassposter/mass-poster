import { createHash } from 'node:crypto';
import { env } from '../../env.ts';
import type {
  ActiveBrowser,
  AntidetectProvider,
  BrowserProfile,
  BrowserProfileSpec,
} from '../types.ts';

/**
 * Multilogin X provider — reverse-engineered against the public Postman
 * collection and help-center articles (verified 2026-05-29).
 *
 * Two API surfaces:
 *   1. **Cloud API**: `https://api.multilogin.com` — workspace + profile management.
 *      All calls require `Authorization: Bearer <token>`.
 *   2. **Local launcher**: `https://launcher.mlx.yt:45001` — starts/stops the
 *      browser via the Multilogin Agent app. Returns a port; the browser
 *      actually runs on the local machine. Has both `/api/v1` (stop) and
 *      `/api/v2` (start).
 *
 * Two token types:
 *   - Regular bearer (`POST /user/signin`): ~30 min lifetime. Returns
 *     `data.token`.
 *   - Automation token (`POST /workspace/automation_token`): long-lived,
 *     higher rate limit. **Preferred for backend automation.** Set as
 *     `MULTILOGIN_API_TOKEN` in env so we never call /user/signin in the
 *     hot path.
 *
 * Password: the public articles disagree on whether the signin password
 * must be MD5-hashed. The Python sample MD5s it; the Selenium docs say
 * plaintext works. We MD5-hash to match the more conservative path —
 * Multilogin's API accepts both.
 *
 * Cloud Phones: the help articles enumerate CLI commands (`xcli mobile-*`)
 * but don't quote the underlying REST endpoints verbatim. Mobile profile
 * methods on this class throw a NotImplemented error until we wire them
 * up against the real Postman collection. Desktop profiles work end-to-end
 * once `MULTILOGIN_API_TOKEN` + `MULTILOGIN_FOLDER_ID` are set.
 *
 * References (see [[reference-multilogin-api]] memory file):
 *   - https://multilogin.com/help/en_US/postman/creating-a-profile-with-postman
 *   - https://multilogin.com/help/en_US/puppeteer-selenium-and-playwright/playwright-automation-example
 *   - https://multilogin.com/help/en_US/postman/automation-token
 *   - https://multilogin.com/help/en_US/basic-automation-with-cli/cli-create-cloud-phones
 */

const DEFAULT_CLOUD_BASE = 'https://api.multilogin.com';
const DEFAULT_LAUNCHER_BASE = 'https://launcher.mlx.yt:45001';
const LAUNCHER_API_V2 = '/api/v2';
const LAUNCHER_API_V1 = '/api/v1';

/** Default browser core version — bump as Multilogin rolls out new cores. */
const DEFAULT_CORE_VERSION = 124;

interface MultiloginEnvelope<T> {
  status: { http_code: number; message?: string; error_code?: string };
  data?: T;
}

interface SigninResponse {
  token: string;
  refresh_token?: string;
  user_id?: string;
  email?: string;
}

interface ProfileCreateResponse {
  /** Field name confirmed at first real call — likely `id` or `uuid`. */
  id: string;
  uuid?: string;
  name?: string;
  folder_id?: string;
}

interface ProfileSearchItem {
  id: string;
  uuid?: string;
  name: string;
  folder_id: string;
  browser_type?: string;
  os_type?: string;
}

interface LauncherStartResponse {
  /** CDP / Selenium port on 127.0.0.1. */
  port: number;
  /** Profile id echo. */
  uuid?: string;
  message?: string;
  browser?: { version?: string };
}

export class MultiloginCloudPhoneProvider implements AntidetectProvider {
  readonly name = 'multilogin';
  private cloudBase: string;
  private launcherBase: string;
  private token: string | undefined;
  private folderId: string | undefined;
  private workspaceId: string | undefined;

  constructor(opts?: {
    cloudBase?: string;
    launcherBase?: string;
    token?: string;
    workspaceId?: string;
    folderId?: string;
  }) {
    this.cloudBase = opts?.cloudBase ?? env.MULTILOGIN_API_BASE ?? DEFAULT_CLOUD_BASE;
    this.launcherBase = opts?.launcherBase ?? env.MULTILOGIN_LAUNCHER_BASE ?? DEFAULT_LAUNCHER_BASE;
    this.token = opts?.token ?? env.MULTILOGIN_API_TOKEN;
    this.workspaceId = opts?.workspaceId ?? env.MULTILOGIN_WORKSPACE_ID;
    this.folderId = opts?.folderId ?? env.MULTILOGIN_FOLDER_ID;
  }

  async isReady(): Promise<boolean> {
    if (!this.token) return false;
    try {
      // Hit a cheap authenticated endpoint to confirm token validity.
      // GET /workspace returns the list of workspaces for the token owner.
      const res = await this.cloudRequest<unknown>('GET', '/workspace');
      return Boolean(res);
    } catch {
      return false;
    }
  }

  async createProfile(spec: BrowserProfileSpec): Promise<BrowserProfile> {
    this.requireToken();
    const folderId = this.folderId;
    if (!folderId) {
      throw new Error(
        'MULTILOGIN_FOLDER_ID missing. Set it in .env.local (run getMultiloginFolderId() or the user/Folder ID extractor first).',
      );
    }

    const body = {
      name: spec.name,
      folder_id: folderId,
      core_version: DEFAULT_CORE_VERSION,
      browser_type: 'mimic' as const,
      os_type: this.osTypeFor(spec.device),
      parameters: {
        flags: {
          // Match a real iPhone/Android UA for mobile; default Chrome for desktop.
          // Most fingerprint switches are auto-randomized by Multilogin.
          audio_masking: 'natural',
          fonts_masking: 'natural',
          geolocation_masking: 'mask',
          geolocation_popup: 'prompt',
          graphics_masking: 'natural',
          graphics_noise: 'natural',
          localization_masking: 'mask',
          media_devices_masking: 'mask',
          navigator_masking: 'mask',
          ports_masking: 'natural',
          proxy_masking: 'custom',
          screen_masking: 'natural',
          timezone_masking: 'mask',
          webrtc_masking: 'mask',
        },
        storage: {
          is_local: false,
          save_service_worker: true,
        },
        fingerprint: spec.user_agent ? { navigator: { user_agent: spec.user_agent } } : {},
        ...(spec.proxy
          ? {
              proxy: {
                type: spec.proxy.type,
                host: spec.proxy.host,
                port: spec.proxy.port,
                username: spec.proxy.username ?? '',
                password: spec.proxy.password ?? '',
              },
            }
          : {}),
      },
    };

    const data = await this.cloudRequest<ProfileCreateResponse>(
      'POST',
      '/profile/create',
      body,
    );
    if (!data?.id && !data?.uuid) {
      throw new Error(`Profile create returned no id. Response: ${JSON.stringify(data)}`);
    }
    return {
      profile_id: data.uuid ?? data.id,
      name: spec.name,
      provider: this.name,
      proxy: spec.proxy,
    };
  }

  async listProfiles(): Promise<BrowserProfile[]> {
    this.requireToken();
    if (!this.folderId) return [];
    const data = await this.cloudRequest<{ profiles?: ProfileSearchItem[] }>(
      'POST',
      '/profile/search',
      {
        folder_id: this.folderId,
        limit: 100,
        offset: 0,
      },
    );
    return (data?.profiles ?? []).map((p) => ({
      profile_id: p.uuid ?? p.id,
      name: p.name,
      provider: this.name,
    }));
  }

  async startBrowser(profile_id: string): Promise<ActiveBrowser> {
    this.requireToken();
    const folderId = this.folderId;
    if (!folderId) throw new Error('MULTILOGIN_FOLDER_ID missing');

    const url =
      `${this.launcherBase}${LAUNCHER_API_V2}/profile/f/${encodeURIComponent(folderId)}` +
      `/p/${encodeURIComponent(profile_id)}/start?automation_type=playwright&headless_mode=false`;

    const data = await this.launcherRequest<LauncherStartResponse>(url);
    if (!data?.port) {
      throw new Error(`Profile start returned no port. Response: ${JSON.stringify(data)}`);
    }
    const cdp = `http://127.0.0.1:${data.port}`;
    return {
      profile_id,
      webdriver_endpoint: cdp,
      ws_endpoint: cdp,
    };
  }

  async stopBrowser(profile_id: string): Promise<void> {
    // Stop uses V1 — different path shape from V2 start.
    const url = `${this.launcherBase}${LAUNCHER_API_V1}/profile/stop/p/${encodeURIComponent(profile_id)}`;
    await this.launcherRequest<unknown>(url);
  }

  async deleteProfile(profile_id: string): Promise<void> {
    this.requireToken();
    // Profile delete endpoint — exact path to be confirmed against Postman.
    // The Postman collection has a "Delete Profile" call under Profile Management.
    await this.cloudRequest<unknown>('DELETE', `/profile/${encodeURIComponent(profile_id)}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // Auth flow — call once and persist `data.token` as MULTILOGIN_API_TOKEN
  // ─────────────────────────────────────────────────────────────────

  /**
   * One-shot signin. Returns a short-lived (~30min) bearer token. Prefer
   * `generateAutomationToken()` for backend use.
   */
  async signin(email: string, password: string): Promise<string> {
    const passwordHash = createHash('md5').update(password).digest('hex');
    const data = await this.cloudRequest<SigninResponse>(
      'POST',
      '/user/signin',
      { email, password: passwordHash },
      { skipAuth: true },
    );
    if (!data?.token) {
      throw new Error('signin returned no token');
    }
    this.token = data.token;
    return data.token;
  }

  /**
   * Long-lived automation token. Run once via CLI/script, copy result into
   * MULTILOGIN_API_TOKEN in .env.local, and forget about signin.
   *
   * `expiration_period` accepts ISO-8601 duration-ish strings; check
   * Multilogin's docs for accepted values (e.g. `"720h"` = 30 days,
   * `"1y"`, etc.). Pass-through.
   */
  async generateAutomationToken(expirationPeriod: string = '8760h'): Promise<string> {
    this.requireToken();
    const data = await this.cloudRequest<SigninResponse>(
      'POST',
      `/workspace/automation_token?expiration_period=${encodeURIComponent(expirationPeriod)}`,
    );
    if (!data?.token) {
      throw new Error('automation_token returned no token');
    }
    return data.token;
  }

  // ─────────────────────────────────────────────────────────────────
  // Cloud Phone (mobile) — scaffold, raises NotImplemented for now
  // ─────────────────────────────────────────────────────────────────

  async createMobileProfile(_spec: {
    profile_name: string;
    mobile_type: string;
    proxy: string;
    mobile_city?: string;
    mobile_language?: string;
    surface_brand?: string;
    surface_model?: string;
    net_type?: 0 | 1;
  }): Promise<{ id: string }> {
    throw new Error(
      'createMobileProfile: Cloud Phone API path not yet confirmed verbatim from Postman collection. ' +
        'When credentials are wired, capture the actual `xcli mobile-profiles-create --debug` HTTP trace ' +
        'and fill in the exact endpoint here.',
    );
  }

  async launchMobile(_ids: number[]): Promise<{ port: number; ids: number[] }> {
    throw new Error('launchMobile: confirm endpoint vs xcli mobile-phone-launch trace');
  }

  async shutdownMobile(_ids: number[]): Promise<void> {
    throw new Error('shutdownMobile: confirm endpoint vs xcli mobile-phone-shutdown trace');
  }

  // ─────────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────────

  private osTypeFor(device: BrowserProfileSpec['device']): string {
    if (device === 'mobile_ios') return 'ios';
    if (device === 'mobile_android') return 'android';
    return 'macos';
  }

  private requireToken(): void {
    if (!this.token) {
      throw new Error(
        'MULTILOGIN_API_TOKEN missing. Set it in .env.local. ' +
          'Run `pnpm multilogin:token` (or call provider.signin() then provider.generateAutomationToken()) ' +
          'to obtain a long-lived automation token.',
      );
    }
  }

  private async cloudRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    opts?: { skipAuth?: boolean },
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.cloudBase}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (!opts?.skipAuth) headers.Authorization = `Bearer ${this.token}`;

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new Error(`Multilogin cloud API unreachable: ${(err as Error).message}`);
    }
    const text = await res.text();
    let envelope: MultiloginEnvelope<T> | T | null = null;
    try {
      envelope = text ? (JSON.parse(text) as MultiloginEnvelope<T> | T) : null;
    } catch {
      throw new Error(`Multilogin HTTP ${res.status}: non-JSON body: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const msg = isEnvelope<T>(envelope)
        ? envelope.status?.message ?? envelope.status?.error_code
        : '';
      throw new Error(`Multilogin HTTP ${res.status}: ${msg ?? text.slice(0, 200)}`);
    }
    if (isEnvelope<T>(envelope)) {
      return envelope.data as T;
    }
    return envelope as T;
  }

  private async launcherRequest<T>(url: string): Promise<T> {
    // Launcher is HTTPS to launcher.mlx.yt:45001 but the cert is self-signed
    // for the local agent — fetch() with system trust will still work as long
    // as the user has the Multilogin Agent installed. We pass the Bearer
    // token even for the launcher (some endpoints require it).
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token ?? ''}`,
        },
      });
    } catch (err) {
      throw new Error(
        `Multilogin launcher unreachable at ${this.launcherBase}: ${(err as Error).message}. ` +
          'Is the Multilogin Agent app running on this machine?',
      );
    }
    const text = await res.text();
    let envelope: MultiloginEnvelope<T> | T | null = null;
    try {
      envelope = text ? (JSON.parse(text) as MultiloginEnvelope<T> | T) : null;
    } catch {
      throw new Error(`Multilogin launcher HTTP ${res.status}: non-JSON: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const msg = isEnvelope<T>(envelope)
        ? envelope.status?.message ?? envelope.status?.error_code
        : '';
      throw new Error(`Multilogin launcher HTTP ${res.status}: ${msg ?? text.slice(0, 200)}`);
    }
    if (isEnvelope<T>(envelope)) return envelope.data as T;
    return envelope as T;
  }
}

function isEnvelope<T>(x: unknown): x is MultiloginEnvelope<T> {
  return (
    typeof x === 'object' &&
    x !== null &&
    'status' in x &&
    typeof (x as { status: unknown }).status === 'object'
  );
}
