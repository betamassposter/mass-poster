/**
 * Account orchestrator types.
 *
 * Mirror dei tipi Postgres `account_status`, `platform`, `account_origin`,
 * `proxy_status` (migration 0001 + 0004 + 0005).
 */

export type Platform =
  | 'instagram'
  | 'tiktok'
  | 'youtube_shorts'
  | 'x'
  | 'linkedin'
  | 'facebook';

export type AccountStatus =
  | 'creating'
  | 'warmup'
  | 'active'
  | 'shadowbanned'
  | 'banned'
  | 'retired';

export type AccountOrigin = 'manual' | 'browser_use_auto';

export type ProxyStatus = 'available' | 'in_use' | 'dead';

export type DeviceProfile = 'desktop' | 'mobile_ios' | 'mobile_android';

// ─────────────────────────────────────────────────────────────
// Antidetect provider abstraction
// ─────────────────────────────────────────────────────────────

export interface BrowserProfileSpec {
  /** Display name in AdsPower (e.g. "maplo-ig-mario-01"). */
  name: string;
  /** Device fingerprint preset. */
  device: DeviceProfile;
  /** Proxy config (null = no proxy = AdsPower direct IP — only for testing). */
  proxy?: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    /** SOCKS5 or HTTP/HTTPS. */
    type: 'http' | 'https' | 'socks5';
    /** Two-letter country code (e.g. 'IT', 'US') — for fingerprint coherence. */
    country?: string;
  };
  /** Browser open URL. Default about:blank. */
  open_url?: string;
  /** Custom user agent override. AdsPower auto-generates if omitted. */
  user_agent?: string;
  /** Tags for grouping in AdsPower dashboard. */
  group?: string;
}

export interface BrowserProfile {
  /** Provider-specific profile id (AdsPower returns `user_id`). */
  profile_id: string;
  /** Name we gave it. */
  name: string;
  /** Provider that created it. */
  provider: string;
  /** Active proxy info if assigned. */
  proxy?: BrowserProfileSpec['proxy'];
}

export interface ActiveBrowser {
  /** Profile that was started. */
  profile_id: string;
  /** WebDriver endpoint for Playwright/Puppeteer/Selenium to attach to. */
  webdriver_endpoint: string;
  /** Chrome DevTools Protocol endpoint (ws://). */
  ws_endpoint?: string;
  /** PID of the launched browser (if reported). */
  pid?: number;
}

/**
 * Antidetect provider: creates browser profiles, starts/stops them,
 * abstracts AdsPower / Multilogin / Kameleo / Mock.
 */
export interface AntidetectProvider {
  readonly name: string;
  /** Health check. Returns true if the local app/service is reachable. */
  isReady(): Promise<boolean>;
  createProfile(spec: BrowserProfileSpec): Promise<BrowserProfile>;
  listProfiles(): Promise<BrowserProfile[]>;
  startBrowser(profile_id: string): Promise<ActiveBrowser>;
  stopBrowser(profile_id: string): Promise<void>;
  deleteProfile(profile_id: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// Proxy provider abstraction (separate from antidetect — proxies
// are bought from iProyal/Soax/etc and assigned to AdsPower profiles)
// ─────────────────────────────────────────────────────────────

export interface ProxyCredential {
  host: string;
  port: number;
  username?: string;
  password?: string;
  type: 'http' | 'https' | 'socks5';
  country?: string;
  city?: string;
  provider: string;
}

export interface ProxyProvider {
  readonly name: string;
  /** Acquire/rent N fresh proxies from the provider. Returns credentials. */
  rentProxies(count: number, country?: string): Promise<ProxyCredential[]>;
  /** Verify a proxy works (HTTP request via the proxy). */
  testProxy(proxy: ProxyCredential): Promise<{ ok: boolean; latency_ms: number; ip?: string }>;
}

// ─────────────────────────────────────────────────────────────
// Account orchestration request shapes
// ─────────────────────────────────────────────────────────────

export interface CreateAccountRequest {
  brand_id: string;
  workspace_id: string;
  platform: Platform;
  /** Display handle hint (final handle set after signup). Defaults to a generated name. */
  handle_hint?: string;
  /** Device profile. Default 'mobile_ios' (best for IG/TT). */
  device?: DeviceProfile;
  /** Proxy id from `proxy` table to assign (must be `available`). If omitted, auto-pick. */
  proxy_id?: string;
  /** Origin tag for DB. */
  origin?: AccountOrigin;
  /** ISO country code for proxy + fingerprint match. Default 'IT'. */
  country?: string;
}

export interface CreateAccountResult {
  account_id: string;
  adspower_profile_id: string;
  proxy_id: string | null;
  handle: string;
  status: AccountStatus;
}
