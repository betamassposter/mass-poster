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
  /** Optional: rotate / get a fresh IP on the same proxy (mobile proxies support this). */
  rotateIp?(proxy: ProxyCredential): Promise<{ ok: boolean; new_ip?: string }>;
  /** Optional: release a proxy back to the pool (for paid mobile proxies billed per session). */
  releaseProxy?(proxy: ProxyCredential): Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// IP reputation provider — runs BEFORE a proxy is bound to an account.
// Multiple providers are composed (zerobounce + browserleaks-style fingerprint).
// A proxy is only `clean` if ALL providers return clean: true.
// ─────────────────────────────────────────────────────────────

export interface IpReputationSignals {
  /** Blacklists the IP appears on (Spamhaus, Barracuda, etc.). Empty = none. */
  blacklisted_on?: string[];
  /** Country code returned by IP geolocation (compare with expected country). */
  geo_country?: string;
  /** True if geo matches the country we requested when renting the proxy. */
  geo_matches_target?: boolean;
  /** ASN (autonomous system number) and the org behind it. */
  asn?: number;
  asn_org?: string;
  /** True if the ASN is a residential/mobile ISP (vs a known datacenter/hosting org). */
  is_residential?: boolean;
  /** DNS leak: the proxy's DNS resolver geo doesn't match the proxy's IP geo. */
  dns_leak?: boolean;
  /** WebRTC leak: only detectable from inside a Cloud Phone session — deferred. */
  webrtc_leak?: boolean;
  /** Fraud / risk score (0-100, higher = riskier). */
  fraud_score?: number;
  /** Free-form notes describing any other concerns. */
  notes?: string[];
}

export interface IpReputationResult {
  /** Provider that produced this result (e.g. 'zerobounce', 'ip-fingerprint'). */
  provider: string;
  /** IP that was checked. */
  ip: string;
  /** True iff there are zero red flags from this provider. */
  clean: boolean;
  /** Score 0-100 if the provider supports it. 100 = best. */
  score?: number;
  signals: IpReputationSignals;
  /** Raw vendor response — stored for debugging in proxy_validation_check.results. */
  raw?: unknown;
  /** ISO timestamp. */
  checked_at: string;
}

export interface IpReputationProvider {
  readonly name: string;
  /** Ready means: env config present + reachable. */
  isReady(): Promise<boolean>;
  /**
   * Check `ip`. If `proxy` is provided, the check should be run through that
   * proxy (so we observe what the target platform would see).
   */
  check(ip: string, opts?: { proxy?: ProxyCredential; expectedCountry?: string }): Promise<IpReputationResult>;
}

/** Aggregate validator verdict, written to proxy.last_validation_summary. */
export interface ProxyValidationVerdict {
  /** True only if every provider returned clean. */
  clean: boolean;
  /** 'pending' | 'clean' | 'dirty' | 'error' — mirrors the DB enum. */
  status: 'pending' | 'clean' | 'dirty' | 'error';
  /** Egress IP we observed. */
  ip: string | null;
  /** Per-provider results. */
  results: IpReputationResult[];
  /** Human-readable reasons the proxy was rejected (empty if clean). */
  failure_reasons: string[];
  /** Total ms across all providers. */
  duration_ms: number;
  /** ISO timestamp. */
  checked_at: string;
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
  /** Antidetect profile id — AdsPower's user_id or Multilogin's profile uuid. */
  profile_id: string;
  /** Which antidetect provider was used. */
  profile_provider: string;
  /** Cloud Phone instance id, when running on Multilogin Cloud Phones. */
  cloud_phone_id?: string;
  proxy_id: string | null;
  handle: string;
  status: AccountStatus;
}
