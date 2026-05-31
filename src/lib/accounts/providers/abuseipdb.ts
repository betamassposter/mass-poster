import { env } from '../../env.ts';
import type {
  IpReputationProvider,
  IpReputationResult,
  ProxyCredential,
} from '../types.ts';

/**
 * AbuseIPDB IP reputation check.
 *
 *   GET https://api.abuseipdb.com/api/v2/check
 *   headers: { Key: <API_KEY>, Accept: application/json }
 *   query:   ipAddress=<IP>&maxAgeInDays=90
 *
 * Free tier: 1000 checks/day. Sign up at abuseipdb.com.
 *
 * Why AbuseIPDB and not ZeroBounce: ZeroBounce's "IP reputation checker"
 * (https://www.zerobounce.net/ip-reputation-checker) is a free web tool only
 * — there is no public API behind it. Verified 2026-05-29. See
 * [[reference-ip-reputation-vendors]].
 *
 * Response shape (data wrapper):
 *   {
 *     "data": {
 *       "ipAddress": "...",
 *       "abuseConfidenceScore": 0-100,
 *       "countryCode": "US",
 *       "usageType": "Commercial / Data Center / Mobile / Fixed Line ISP / ...",
 *       "isp": "...",
 *       "domain": "...",
 *       "hostnames": [...],
 *       "isTor": false,
 *       "isWhitelisted": null|true|false,
 *       "totalReports": 0,
 *       "numDistinctUsers": 0,
 *       "lastReportedAt": null | ISO
 *     }
 *   }
 *
 * Decision rule for `clean: true`:
 *   - abuseConfidenceScore < 25
 *   - isTor === false
 *   - geo matches expectedCountry (if provided)
 *
 * Note on usageType: we DO NOT reject "Data Center" — mobile-proxy carriers
 * sometimes get classified as datacenter on AbuseIPDB. Surface it as a signal
 * (`asn_org` includes the usage type) but don't fail on it.
 */

interface AbuseIpdbResponse {
  data?: {
    ipAddress?: string;
    abuseConfidenceScore?: number;
    countryCode?: string;
    usageType?: string;
    isp?: string;
    domain?: string;
    hostnames?: string[];
    isTor?: boolean;
    isWhitelisted?: boolean | null;
    totalReports?: number;
    numDistinctUsers?: number;
    lastReportedAt?: string | null;
  };
  errors?: Array<{ detail?: string; status?: number; source?: { parameter?: string } }>;
}

export class AbuseIpdbReputationProvider implements IpReputationProvider {
  readonly name = 'abuseipdb';
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? env.ABUSEIPDB_API_KEY;
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
        signals: { notes: ['ABUSEIPDB_API_KEY not configured'] },
        checked_at: startedAt,
      };
    }

    const url = new URL('https://api.abuseipdb.com/api/v2/check');
    url.searchParams.set('ipAddress', ip);
    url.searchParams.set('maxAgeInDays', '90');

    let raw: AbuseIpdbResponse;
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Key: this.apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return {
          provider: this.name,
          ip,
          clean: false,
          signals: { notes: [`abuseipdb HTTP ${res.status}`] },
          checked_at: startedAt,
        };
      }
      raw = (await res.json()) as AbuseIpdbResponse;
    } catch (err) {
      return {
        provider: this.name,
        ip,
        clean: false,
        signals: { notes: [`abuseipdb error: ${(err as Error).message}`] },
        checked_at: startedAt,
      };
    }

    if (raw.errors?.length) {
      return {
        provider: this.name,
        ip,
        clean: false,
        signals: { notes: raw.errors.map((e) => `abuseipdb: ${e.detail ?? 'unknown'}`) },
        raw,
        checked_at: startedAt,
      };
    }

    const data = raw.data ?? {};
    const abuseScore = data.abuseConfidenceScore ?? 0;
    const totalReports = data.totalReports ?? 0;
    const isTor = Boolean(data.isTor);
    const geoCountry = data.countryCode;
    const ispLabel = [data.isp, data.usageType].filter(Boolean).join(' · ') || undefined;

    const signals: IpReputationResult['signals'] = {
      blacklisted_on: totalReports > 0 ? [`AbuseIPDB (${totalReports} reports)`] : [],
      geo_country: geoCountry,
      geo_matches_target: opts?.expectedCountry
        ? geoCountry?.toUpperCase() === opts.expectedCountry.toUpperCase()
        : undefined,
      asn_org: ispLabel,
      fraud_score: abuseScore,
      notes: [],
    };

    const failures: string[] = [];
    if (isTor) failures.push('IP flagged as Tor exit node');
    if (abuseScore >= 25) {
      failures.push(`Abuse confidence score too high (${abuseScore} ≥ 25)`);
    }
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
      score: Math.max(0, 100 - abuseScore),
      signals,
      raw,
      checked_at: startedAt,
    };
  }
}
