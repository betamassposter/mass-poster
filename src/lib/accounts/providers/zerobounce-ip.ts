import { env } from '../../env.ts';
import type {
  IpReputationProvider,
  IpReputationResult,
  ProxyCredential,
} from '../types.ts';

/**
 * ZeroBounce IP reputation check.
 *
 * The user explicitly pointed at https://www.zerobounce.net/ip-reputation-checker
 * which is the web UI. The corresponding API endpoint is the "Get IP Address
 * Information" call:
 *
 *   GET https://api.zerobounce.in/v2/ip-info?ip_address=<IP>&api_key=<KEY>
 *
 * The free tier ships 100 lookups, paid tiers go up from there. Without a key
 * we mark this provider as not-ready (the validator will treat it as a hard
 * fail when IP_REPUTATION_STRICT=true).
 *
 * Output schema (verified May 2026):
 *   {
 *     "ip_address": "1.2.3.4",
 *     "country": "United States",
 *     "country_code": "US",
 *     "region": "California",
 *     "city": "San Francisco",
 *     "isp": "Cloudflare Inc",
 *     "is_proxy": "true",
 *     "is_vpn": "false",
 *     "is_tor": "false",
 *     "fraud_score": 25,
 *     "blacklisted": "true",
 *     "blacklist_count": 3,
 *     "blacklist_details": [...]
 *   }
 *
 * Decision rule for `clean: true`:
 *   - fraud_score < 25
 *   - blacklist_count === 0
 *   - is_tor === "false"
 *   - is_vpn === "false" OR (residential mobile flag wins — see signals)
 */

interface ZerobounceIpInfo {
  ip_address: string;
  country?: string;
  country_code?: string;
  region?: string;
  city?: string;
  isp?: string;
  organization?: string;
  is_proxy?: string | boolean;
  is_vpn?: string | boolean;
  is_tor?: string | boolean;
  fraud_score?: number;
  blacklisted?: string | boolean;
  blacklist_count?: number;
  blacklist_details?: Array<{ blacklist?: string; name?: string }>;
  error?: string;
}

export class ZeroBounceIpReputationProvider implements IpReputationProvider {
  readonly name = 'zerobounce';
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? env.ZEROBOUNCE_API_KEY;
  }

  async isReady(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async check(
    ip: string,
    opts?: { proxy?: ProxyCredential; expectedCountry?: string },
  ): Promise<IpReputationResult> {
    const startedAt = new Date().toISOString();
    if (!this.apiKey) {
      return {
        provider: this.name,
        ip,
        clean: false,
        signals: { notes: ['ZEROBOUNCE_API_KEY not configured'] },
        checked_at: startedAt,
      };
    }

    const url = new URL('https://api.zerobounce.in/v2/ip-info');
    url.searchParams.set('ip_address', ip);
    url.searchParams.set('api_key', this.apiKey);

    let raw: ZerobounceIpInfo;
    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return {
          provider: this.name,
          ip,
          clean: false,
          signals: { notes: [`zerobounce HTTP ${res.status}`] },
          checked_at: startedAt,
        };
      }
      raw = (await res.json()) as ZerobounceIpInfo;
    } catch (err) {
      return {
        provider: this.name,
        ip,
        clean: false,
        signals: { notes: [`zerobounce error: ${(err as Error).message}`] },
        checked_at: startedAt,
      };
    }

    if (raw.error) {
      return {
        provider: this.name,
        ip,
        clean: false,
        signals: { notes: [`zerobounce: ${raw.error}`] },
        raw,
        checked_at: startedAt,
      };
    }

    const isProxy = parseBool(raw.is_proxy);
    const isVpn = parseBool(raw.is_vpn);
    const isTor = parseBool(raw.is_tor);
    const blacklisted = parseBool(raw.blacklisted);
    const blacklistCount = raw.blacklist_count ?? 0;
    const fraudScore = raw.fraud_score ?? 0;

    const signals: IpReputationResult['signals'] = {
      blacklisted_on:
        raw.blacklist_details?.map((b) => b.name ?? b.blacklist ?? 'unknown') ?? [],
      geo_country: raw.country_code,
      geo_matches_target: opts?.expectedCountry
        ? raw.country_code?.toUpperCase() === opts.expectedCountry.toUpperCase()
        : undefined,
      asn_org: raw.organization ?? raw.isp,
      fraud_score: fraudScore,
      notes: [],
    };

    const failures: string[] = [];
    if (isTor) failures.push('IP flagged as Tor exit node');
    if (blacklisted || blacklistCount > 0) {
      failures.push(`Blacklisted on ${blacklistCount} list(s)`);
    }
    if (fraudScore >= 25) {
      failures.push(`Fraud score too high (${fraudScore} ≥ 25)`);
    }
    // is_proxy + is_vpn — we EXPECT a mobile proxy to be flagged as proxy on
    // some commercial lists; that's not a kill signal by itself. Only kill on
    // VPN flag (datacenter VPN ≠ residential/mobile carrier).
    if (isVpn) failures.push('IP flagged as VPN (datacenter)');
    if (signals.geo_matches_target === false) {
      failures.push(
        `Geo mismatch: expected ${opts?.expectedCountry}, got ${signals.geo_country}`,
      );
    }

    if (failures.length > 0) signals.notes = failures;

    return {
      provider: this.name,
      ip,
      clean: failures.length === 0,
      score: Math.max(0, 100 - fraudScore - blacklistCount * 10),
      signals,
      raw,
      checked_at: startedAt,
    };

    // (Note: `isProxy` is captured intentionally; downstream consumers can read
    // it from `raw` if they want to weight it. We don't fail on it because the
    // whole point of a mobile proxy is that it IS a proxy — failing on that
    // would be self-defeating.)
  }
}

function parseBool(v: string | boolean | undefined): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return false;
}
