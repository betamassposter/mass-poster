import { env } from '../../env.ts';
import type {
  IpReputationProvider,
  IpReputationResult,
  ProxyCredential,
} from '../types.ts';

/**
 * Proxycheck.io IP reputation provider.
 *
 * Why this second source (alongside AbuseIPDB):
 *   - AbuseIPDB: human-reported abuse, score 0-100, Tor flag, blacklists
 *   - Proxycheck: machine-detected VPN/proxy/datacenter/Tor classification
 *     + risk score (0-100) + ISP type ("Mobile ISP" / "Datacenter" / etc.)
 *
 * Together they cover both "is this IP a known bad actor" (AbuseIPDB) and
 * "is this IP from a clean residential/mobile ISP" (Proxycheck). For IG/TT
 * detection avoidance, BOTH must come back clean.
 *
 * Endpoint:  GET https://proxycheck.io/v2/{ip}?vpn=1&asn=1&risk=1[&key=...]
 * Free tier: 100 queries/day no key, 1000/day with free API key
 *
 * Decision rule: clean ⇔
 *   - proxy === "no"
 *   - vpn === "no"
 *   - tor === "no"
 *   - risk < 33 (Proxycheck risk scale 0-100)
 *   - type matches expected "Mobile ISP" / "Residential" if we expect mobile/residential
 */

interface ProxycheckIpInfo {
  asn?: string;
  provider?: string;
  organisation?: string;
  country?: string;
  isocode?: string;
  city?: string;
  type?: string; // "Mobile ISP", "Residential", "Business", "Datacenter", "Education", etc.
  proxy?: 'yes' | 'no';
  vpn?: 'yes' | 'no';
  tor?: 'yes' | 'no';
  risk?: number;
}

interface ProxycheckResponse {
  status: 'ok' | 'denied' | 'warning' | 'error';
  message?: string;
  [ip: string]: ProxycheckIpInfo | string | undefined;
}

export class ProxycheckProvider implements IpReputationProvider {
  readonly name = 'proxycheck';
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    // Optional key — free tier without key allows 100/day rate-limited by source IP.
    // env.PROXYCHECK_API_KEY would extend to 1000/day; not required.
    this.apiKey = apiKey ?? (process.env.PROXYCHECK_API_KEY || undefined);
  }

  async isReady(): Promise<boolean> {
    return true; // works without API key (free tier)
  }

  async check(
    ip: string,
    opts?: { proxy?: ProxyCredential; expectedCountry?: string },
  ): Promise<IpReputationResult> {
    const startedAt = new Date().toISOString();
    const url = new URL(`https://proxycheck.io/v2/${encodeURIComponent(ip)}`);
    url.searchParams.set('vpn', '1');
    url.searchParams.set('asn', '1');
    url.searchParams.set('risk', '1');
    if (this.apiKey) url.searchParams.set('key', this.apiKey);

    let raw: ProxycheckResponse;
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        return {
          provider: this.name,
          ip,
          clean: false,
          signals: { notes: [`proxycheck HTTP ${res.status}`] },
          checked_at: startedAt,
        };
      }
      raw = (await res.json()) as ProxycheckResponse;
    } catch (err) {
      return {
        provider: this.name,
        ip,
        clean: false,
        signals: { notes: [`proxycheck error: ${(err as Error).message}`] },
        checked_at: startedAt,
      };
    }

    if (raw.status === 'denied' || raw.status === 'error') {
      return {
        provider: this.name,
        ip,
        clean: false,
        signals: { notes: [`proxycheck: ${raw.message ?? raw.status}`] },
        raw,
        checked_at: startedAt,
      };
    }

    const info = raw[ip] as ProxycheckIpInfo | undefined;
    if (!info || typeof info !== 'object') {
      return {
        provider: this.name,
        ip,
        clean: false,
        signals: { notes: ['proxycheck: no info for this IP'] },
        raw,
        checked_at: startedAt,
      };
    }

    const isProxy = info.proxy === 'yes';
    const isVpn = info.vpn === 'yes';
    const isTor = info.tor === 'yes';
    const risk = info.risk ?? 0;
    const typeStr = (info.type ?? '').toLowerCase();
    // Proxycheck classifies mobile carrier IPs as "Wireless" (verified with
    // Wind/Tre Italian mobile IP 2026-06-01). "Mobile ISP" is a synonym.
    const isMobile = typeStr.includes('mobile') || typeStr.includes('wireless');
    const isResidential = typeStr.includes('residential');
    const isDatacenter = typeStr.includes('datacenter') || typeStr.includes('hosting');

    const failures: string[] = [];
    if (isTor) failures.push('IP flagged as Tor exit node');
    if (isVpn) failures.push('IP flagged as VPN');
    // Mobile proxies are inherently "proxies" — Proxycheck flags them, but
    // a mobile-ISP-classified proxy is what we WANT for IG/TT. So we only
    // reject the proxy flag if the IP is also datacenter-classified.
    if (isProxy && !isMobile && !isResidential) {
      failures.push(`IP flagged as proxy (type=${info.type ?? 'unknown'})`);
    }
    if (isDatacenter) failures.push('IP from datacenter/hosting (not residential/mobile)');
    if (risk >= 33) failures.push(`Proxycheck risk score ${risk} ≥ 33`);
    if (opts?.expectedCountry && info.isocode) {
      if (info.isocode.toUpperCase() !== opts.expectedCountry.toUpperCase()) {
        failures.push(
          `Geo mismatch: expected ${opts.expectedCountry}, got ${info.isocode}`,
        );
      }
    }

    return {
      provider: this.name,
      ip,
      clean: failures.length === 0,
      score: Math.max(0, 100 - risk),
      signals: {
        geo_country: info.isocode,
        geo_matches_target: opts?.expectedCountry
          ? info.isocode?.toUpperCase() === opts.expectedCountry.toUpperCase()
          : undefined,
        asn_org: info.provider ?? info.organisation,
        is_residential: isResidential || isMobile,
        fraud_score: risk,
        notes: failures,
      },
      raw,
      checked_at: startedAt,
    };
  }
}
