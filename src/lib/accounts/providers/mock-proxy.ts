import type { ProxyCredential, ProxyProvider } from '../types.ts';

/**
 * Mock proxy provider — generates fake creds. Used in dev before signing up
 * with iProyal/Soax. Test always returns ok (we won't actually use it for
 * outbound requests).
 */
export class MockProxyProvider implements ProxyProvider {
  readonly name = 'mock-proxy';

  async rentProxies(count: number, country: string = 'IT'): Promise<ProxyCredential[]> {
    return Array.from({ length: count }, (_, i) => ({
      host: `mock-proxy-${i + 1}.example.com`,
      port: 10000 + i,
      username: `mock_user_${i + 1}`,
      password: `mock_pwd_${i + 1}`,
      type: 'http' as const,
      country,
      city: country === 'IT' ? 'Milan' : 'New York',
      provider: this.name,
    }));
  }

  async testProxy(_proxy: ProxyCredential) {
    return { ok: true, latency_ms: 42, ip: '127.0.0.1' };
  }
}
