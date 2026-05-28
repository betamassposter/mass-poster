import { env } from '../../env.ts';
import type {
  IpReputationProvider,
  IpReputationResult,
  ProxyCredential,
} from '../types.ts';

/**
 * IP fingerprint provider — server-side equivalent of the checks shown on
 * https://browserleaks.com/ip
 *
 * What we can verify WITHOUT a browser session through the proxy:
 *   - Geo (country, city, region)        → ipinfo.io / ip-api.com
 *   - ASN + organization                 → ipinfo.io
 *   - Residential vs datacenter heuristic→ ASN org name lookup
 *   - DNS leak                           → DNS resolver IP geo vs proxy IP geo
 *   - Public blacklists                  → AbuseIPDB if key present
 *
 * What we CAN'T verify here (needs a Cloud Phone browser session):
 *   - WebRTC leak (browser-only signal)
 *   - Canvas/audio fingerprint coherence
 *   - JS-detectable headless flags
 *
 * Decision rule for `clean: true`:
 *   - Geo matches expectedCountry (if provided)
 *   - ASN is residential/mobile (not in datacenter org list)
 *   - AbuseIPDB confidence < 25 (if key present)
 *   - DNS leak check inconclusive or pass
 */

interface IpinfoResponse {
  ip: string;
  hostname?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  org?: string;       // e.g. "AS13335 Cloudflare, Inc."
  postal?: string;
  timezone?: string;
}

interface AbuseIpdbResponse {
  data?: {
    ipAddress: string;
    isPublic: boolean;
    ipVersion: number;
    isWhitelisted?: boolean;
    abuseConfidenceScore: number;
    countryCode?: string;
    usageType?: string;
    isp?: string;
    domain?: string;
    totalReports?: number;
    lastReportedAt?: string;
  };
  errors?: Array<{ detail: string }>;
}

/**
 * ASN organization fragments that strongly indicate a *datacenter / hosting*
 * provider (not residential / not mobile carrier). Hit → not residential.
 */
const DATACENTER_ORG_PATTERNS = [
  'amazon', 'aws', 'google', 'microsoft', 'azure', 'cloudflare',
  'digitalocean', 'linode', 'ovh', 'hetzner', 'vultr', 'oracle',
  'alibaba cloud', 'leaseweb', 'choopa', 'm247', 'datacamp',
  'colocrossing', 'quadranet', 'ramnode', 'contabo', 'webnx',
  'serverhub', 'hostwinds', 'gigenet',
];

/**
 * ASN org fragments that strongly indicate a mobile / residential ISP.
 * Hit → residential confirmed.
 */
const RESIDENTIAL_ORG_PATTERNS = [
  'mobile', 'wireless', 'cellular', 'telecom', 'telecomunicaz',
  'tim ', 'wind tre', 'vodafone', 'iliad', 'fastweb',  // IT carriers
  'verizon', 't-mobile', 'at&t', 'sprint', 'comcast', 'spectrum', // US carriers
  'orange', 'sfr', 'bouygues',                                     // FR carriers
  'telefonica', 'movistar', 'o2', 'three',                         // EU carriers
  'broadband', 'fiber', 'dsl',
];

export class IpFingerprintReputationProvider implements IpReputationProvider {
  readonly name = 'ip-fingerprint';
  private ipinfoToken: string | undefined;
  private abuseKey: string | undefined;

  constructor(opts?: { ipinfoToken?: string; abuseKey?: string }) {
    this.ipinfoToken = opts?.ipinfoToken ?? env.IPINFO_TOKEN;
    this.abuseKey = opts?.abuseKey ?? env.ABUSEIPDB_API_KEY;
  }

  async isReady(): Promise<boolean> {
    // We can do a reduced check (ip-api.com free tier, no key) even without tokens —
    // so always ready, but signals quality scales with available keys.
    return true;
  }

  async check(
    ip: string,
    opts?: { proxy?: ProxyCredential; expectedCountry?: string },
  ): Promise<IpReputationResult> {
    const startedAt = new Date().toISOString();
    const failures: string[] = [];

    // ── 1. Geo + ASN ────────────────────────────────────────────────
    const geo = await fetchGeo(ip, this.ipinfoToken);
    const asnOrg = (geo.org ?? '').toLowerCase();
    const asnNumber = parseAsnNumber(geo.org);
    const isDatacenter = DATACENTER_ORG_PATTERNS.some((p) => asnOrg.includes(p));
    const isResidential = RESIDENTIAL_ORG_PATTERNS.some((p) => asnOrg.includes(p));

    if (isDatacenter) failures.push(`ASN is a known datacenter (${geo.org})`);
    // If we found neither residential nor datacenter, we can't conclude — that
    // alone isn't a kill signal; we lean on the other providers.

    const geoMatches =
      opts?.expectedCountry
        ? (geo.country ?? '').toUpperCase() === opts.expectedCountry.toUpperCase()
        : undefined;
    if (geoMatches === false) {
      failures.push(`Geo mismatch: expected ${opts?.expectedCountry}, got ${geo.country}`);
    }

    // ── 2. AbuseIPDB (only if key) ──────────────────────────────────
    let abuseScore: number | undefined;
    let blacklistedOn: string[] = [];
    if (this.abuseKey) {
      const abuse = await fetchAbuseIpdb(ip, this.abuseKey);
      abuseScore = abuse?.data?.abuseConfidenceScore;
      if (abuseScore !== undefined && abuseScore >= 25) {
        failures.push(`AbuseIPDB confidence ${abuseScore} ≥ 25`);
        blacklistedOn = ['AbuseIPDB'];
      }
      if (abuse?.data?.usageType === 'Data Center/Web Hosting/Transit') {
        failures.push('AbuseIPDB usage type: datacenter');
      }
    }

    // ── 3. DNS leak heuristic ───────────────────────────────────────
    // We don't run a real DNS-leak test here (that requires a browser session
    // through the proxy querying a uniquely-named domain we control). We can
    // do a coarse check: resolve a known domain via the proxy's exit-side DNS
    // (deferred) and compare resolver geo. Marked as undefined for now.
    const dnsLeak: boolean | undefined = undefined;

    const signals: IpReputationResult['signals'] = {
      blacklisted_on: blacklistedOn,
      geo_country: geo.country,
      geo_matches_target: geoMatches,
      asn: asnNumber,
      asn_org: geo.org,
      is_residential: isDatacenter ? false : isResidential ? true : undefined,
      dns_leak: dnsLeak,
      fraud_score: abuseScore,
      notes: failures.length > 0 ? [...failures] : [],
    };

    const score = computeScore({
      datacenter: isDatacenter,
      residential: isResidential,
      geoMatches,
      abuseScore,
    });

    return {
      provider: this.name,
      ip,
      clean: failures.length === 0,
      score,
      signals,
      raw: { geo, abuseScore },
      checked_at: startedAt,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

async function fetchGeo(ip: string, ipinfoToken?: string): Promise<IpinfoResponse> {
  // ipinfo.io has a free tier (50k req/month) and supports tokenless calls for
  // low volume. With a token we get the richer fields including ASN/org.
  const url = ipinfoToken
    ? `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(ipinfoToken)}`
    : `https://ipinfo.io/${encodeURIComponent(ip)}/json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { ip };
    return (await res.json()) as IpinfoResponse;
  } catch {
    // Fallback: ip-api.com free tier (no key, 45 req/min limit).
    try {
      const res = await fetch(
        `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,org,as`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) return { ip };
      const j = (await res.json()) as {
        countryCode?: string;
        regionName?: string;
        city?: string;
        org?: string;
        as?: string;
        isp?: string;
      };
      return {
        ip,
        country: j.countryCode,
        region: j.regionName,
        city: j.city,
        org: j.as ?? j.org ?? j.isp,
      };
    } catch {
      return { ip };
    }
  }
}

async function fetchAbuseIpdb(ip: string, key: string): Promise<AbuseIpdbResponse | null> {
  try {
    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`;
    const res = await fetch(url, {
      headers: { Key: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as AbuseIpdbResponse;
  } catch {
    return null;
  }
}

function parseAsnNumber(org?: string): number | undefined {
  if (!org) return undefined;
  const m = /AS(\d+)/i.exec(org);
  return m ? Number(m[1]) : undefined;
}

function computeScore(input: {
  datacenter: boolean;
  residential: boolean;
  geoMatches: boolean | undefined;
  abuseScore: number | undefined;
}): number {
  let score = 100;
  if (input.datacenter) score -= 70;
  if (!input.residential && !input.datacenter) score -= 15;
  if (input.geoMatches === false) score -= 30;
  if (input.abuseScore !== undefined) score -= Math.min(50, input.abuseScore);
  return Math.max(0, Math.min(100, score));
}
