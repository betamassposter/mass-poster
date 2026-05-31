import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyValidator } from './proxy-validator.ts';
import type {
  IpReputationProvider,
  IpReputationResult,
  ProxyCredential,
} from './types.ts';

/**
 * Mock provider that returns a canned result. Supports `notReady` to test
 * the strict-mode skip behavior.
 */
class MockProvider implements IpReputationProvider {
  readonly name: string;
  constructor(
    name: string,
    private result: Partial<IpReputationResult> & { ready?: boolean },
  ) {
    this.name = name;
  }
  async isReady(): Promise<boolean> {
    return this.result.ready !== false;
  }
  async check(ip: string): Promise<IpReputationResult> {
    return {
      provider: this.name,
      ip,
      clean: this.result.clean ?? true,
      signals: this.result.signals ?? { notes: [] },
      checked_at: new Date().toISOString(),
    };
  }
}

const FAKE_PROXY: ProxyCredential = {
  host: 'proxy.test',
  port: 1080,
  username: 'u',
  password: 'p',
  type: 'http',
  country: 'IT',
  provider: 'multilogin',
};

function stubFetchReturning(ip: string | null) {
  const fetchMock = vi.fn().mockImplementation(async () => {
    if (ip === null) {
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ ip }) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ProxyValidator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T12:00:00Z'));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns clean when every provider returns clean', async () => {
    stubFetchReturning('203.0.113.10');
    const validator = new ProxyValidator({
      providers: [
        new MockProvider('mockA', { clean: true }),
        new MockProvider('mockB', { clean: true }),
      ],
      strict: true,
    });

    const verdict = await validator.validate(FAKE_PROXY);
    expect(verdict.clean).toBe(true);
    expect(verdict.status).toBe('clean');
    expect(verdict.ip).toBe('203.0.113.10');
    expect(verdict.results).toHaveLength(2);
  });

  it('returns dirty when any provider returns dirty', async () => {
    stubFetchReturning('203.0.113.10');
    const validator = new ProxyValidator({
      providers: [
        new MockProvider('mockA', { clean: true }),
        new MockProvider('mockB', {
          clean: false,
          signals: { notes: ['simulated blacklist hit'] },
        }),
      ],
      strict: true,
    });

    const verdict = await validator.validate(FAKE_PROXY);
    expect(verdict.clean).toBe(false);
    expect(verdict.status).toBe('dirty');
    expect(verdict.failure_reasons).toContain('[mockB] simulated blacklist hit');
  });

  it('returns error when egress IP cannot be observed', async () => {
    stubFetchReturning(null);
    const validator = new ProxyValidator({
      providers: [new MockProvider('mockA', { clean: true })],
      strict: true,
    });

    const verdict = await validator.validate(FAKE_PROXY);
    expect(verdict.status).toBe('error');
    expect(verdict.ip).toBeNull();
    expect(verdict.failure_reasons[0]).toContain('Could not observe egress IP');
  });

  it('strict mode: any not-ready provider fails the whole verdict', async () => {
    stubFetchReturning('203.0.113.10');
    const validator = new ProxyValidator({
      providers: [
        new MockProvider('mockA', { clean: true }),
        new MockProvider('mockB', { clean: true, ready: false }),
      ],
      strict: true,
    });

    const verdict = await validator.validate(FAKE_PROXY);
    expect(verdict.status).toBe('error');
    expect(verdict.failure_reasons.join(' ')).toContain('mockB not ready');
  });

  it('non-strict mode: not-ready providers degrade silently', async () => {
    stubFetchReturning('203.0.113.10');
    const validator = new ProxyValidator({
      providers: [
        new MockProvider('mockA', { clean: true }),
        new MockProvider('mockB', { clean: true, ready: false }),
      ],
      strict: false,
    });

    const verdict = await validator.validate(FAKE_PROXY);
    expect(verdict.clean).toBe(true);
    expect(verdict.results).toHaveLength(1); // only mockA ran
  });

  it('non-strict mode: errors out when NO provider is ready', async () => {
    stubFetchReturning('203.0.113.10');
    const validator = new ProxyValidator({
      providers: [new MockProvider('mockA', { clean: true, ready: false })],
      strict: false,
    });

    const verdict = await validator.validate(FAKE_PROXY);
    expect(verdict.status).toBe('error');
    expect(verdict.failure_reasons[0]).toContain('No reputation providers');
  });

  it('aggregates failure_reasons from multiple dirty providers', async () => {
    stubFetchReturning('203.0.113.10');
    const validator = new ProxyValidator({
      providers: [
        new MockProvider('mockA', {
          clean: false,
          signals: { notes: ['reason A1', 'reason A2'] },
        }),
        new MockProvider('mockB', {
          clean: false,
          signals: { notes: ['reason B1'] },
        }),
      ],
      strict: true,
    });

    const verdict = await validator.validate(FAKE_PROXY);
    expect(verdict.failure_reasons).toEqual([
      '[mockA] reason A1',
      '[mockA] reason A2',
      '[mockB] reason B1',
    ]);
  });

  it('skips cache (no DB hit) when workspace_id is not provided', async () => {
    stubFetchReturning('203.0.113.10');
    const validator = new ProxyValidator({
      providers: [new MockProvider('mockA', { clean: true })],
      strict: true,
    });
    // No workspace_id → cache layer is bypassed → no Supabase admin client
    // is instantiated. If it were, the test would crash on missing service
    // role key.
    const verdict = await validator.validate(FAKE_PROXY);
    expect(verdict.clean).toBe(true);
  });
});
