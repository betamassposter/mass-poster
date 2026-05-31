import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbuseIpdbReputationProvider } from './abuseipdb.ts';

const KEY = 'test-key';

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  } as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AbuseIpdbReputationProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reports clean for a low-score IP', async () => {
    mockFetchOnce({
      data: {
        ipAddress: '1.2.3.4',
        abuseConfidenceScore: 0,
        countryCode: 'IT',
        usageType: 'Mobile ISP',
        isp: 'TIM',
        totalReports: 0,
        isTor: false,
      },
    });

    const provider = new AbuseIpdbReputationProvider(KEY);
    const result = await provider.check('1.2.3.4', { expectedCountry: 'IT' });

    expect(result.clean).toBe(true);
    expect(result.signals.geo_country).toBe('IT');
    expect(result.signals.geo_matches_target).toBe(true);
    expect(result.signals.fraud_score).toBe(0);
    expect(result.score).toBe(100);
  });

  it('rejects when abuseConfidenceScore is high', async () => {
    mockFetchOnce({
      data: {
        ipAddress: '1.2.3.4',
        abuseConfidenceScore: 87,
        countryCode: 'IT',
        usageType: 'Data Center',
        isp: 'Bad Hosting Co',
        totalReports: 42,
        isTor: false,
      },
    });

    const provider = new AbuseIpdbReputationProvider(KEY);
    const result = await provider.check('1.2.3.4');

    expect(result.clean).toBe(false);
    expect(result.signals.notes?.some((n) => n.includes('Abuse confidence score'))).toBe(true);
    expect(result.signals.blacklisted_on?.[0]).toContain('42 reports');
  });

  it('rejects Tor exit nodes even with a clean score', async () => {
    mockFetchOnce({
      data: {
        ipAddress: '1.2.3.4',
        abuseConfidenceScore: 0,
        countryCode: 'IT',
        totalReports: 0,
        isTor: true,
      },
    });

    const provider = new AbuseIpdbReputationProvider(KEY);
    const result = await provider.check('1.2.3.4');

    expect(result.clean).toBe(false);
    expect(result.signals.notes).toContain('IP flagged as Tor exit node');
  });

  it('rejects on geo mismatch', async () => {
    mockFetchOnce({
      data: {
        ipAddress: '1.2.3.4',
        abuseConfidenceScore: 0,
        countryCode: 'DE',
        totalReports: 0,
        isTor: false,
      },
    });

    const provider = new AbuseIpdbReputationProvider(KEY);
    const result = await provider.check('1.2.3.4', { expectedCountry: 'IT' });

    expect(result.clean).toBe(false);
    expect(result.signals.geo_matches_target).toBe(false);
    expect(result.signals.notes?.some((n) => n.includes('Geo mismatch'))).toBe(true);
  });

  it('reports as not-ready when explicitly constructed with no key', async () => {
    // Passing '' disables the provider even when env.ABUSEIPDB_API_KEY exists;
    // `undefined` would fall back to env per the constructor contract.
    const provider = new AbuseIpdbReputationProvider('');
    expect(await provider.isReady()).toBe(false);

    const result = await provider.check('1.2.3.4');
    expect(result.clean).toBe(false);
    expect(result.signals.notes?.[0]).toContain('not configured');
  });

  it('returns dirty (not throws) on non-2xx response', async () => {
    mockFetchOnce({}, false, 429);

    const provider = new AbuseIpdbReputationProvider(KEY);
    const result = await provider.check('1.2.3.4');

    expect(result.clean).toBe(false);
    expect(result.signals.notes?.[0]).toContain('HTTP 429');
  });

  it('surfaces API errors envelope as dirty', async () => {
    mockFetchOnce({ errors: [{ detail: 'invalid IP', status: 422 }] });

    const provider = new AbuseIpdbReputationProvider(KEY);
    const result = await provider.check('not-an-ip');

    expect(result.clean).toBe(false);
    expect(result.signals.notes?.[0]).toContain('invalid IP');
  });
});
