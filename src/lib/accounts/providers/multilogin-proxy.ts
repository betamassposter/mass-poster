import { env } from '../../env.ts';
import type { ProxyCredential, ProxyProvider } from '../types.ts';

/**
 * Multilogin Mobile Proxies provider.
 *
 * Mobile 4G/5G proxies, country-targeted, IP rotation on demand.
 * Bundled with the Multilogin Cloud Phones subscription.
 *
 * API base: https://api.multilogin.com (configurable via MULTILOGIN_API_BASE)
 *
 * Endpoint shape (per Multilogin Mobile Proxy docs at pivot date):
 *   POST /mobile-proxy/allocate       → request N proxies with country filter
 *   POST /mobile-proxy/{id}/rotate    → force IP rotation on a session
 *   GET  /mobile-proxy/{id}/test      → vendor-side health probe
 *   DELETE /mobile-proxy/{id}         → release allocation
 *
 * SCAFFOLD STATUS: requires MULTILOGIN_API_TOKEN + MULTILOGIN_WORKSPACE_ID.
 * Methods throw with helpful errors until credentials are wired.
 */

interface AllocateResponse {
  proxies: Array<{
    id: string;
    host: string;
    port: number;
    username: string;
    password: string;
    type: 'http' | 'https' | 'socks5';
    country: string;
    city?: string;
  }>;
}

interface TestResponse {
  ok: boolean;
  latency_ms?: number;
  egress_ip?: string;
}

interface RotateResponse {
  ok: boolean;
  new_ip?: string;
}

export class MultiloginMobileProxyProvider implements ProxyProvider {
  readonly name = 'multilogin_mobile';
  private baseUrl: string;
  private token: string | undefined;
  private workspaceId: string | undefined;

  constructor(opts?: { baseUrl?: string; token?: string; workspaceId?: string }) {
    this.baseUrl = opts?.baseUrl ?? env.MULTILOGIN_API_BASE;
    this.token = opts?.token ?? env.MULTILOGIN_API_TOKEN;
    this.workspaceId = opts?.workspaceId ?? env.MULTILOGIN_WORKSPACE_ID;
  }

  async rentProxies(count: number, country: string = 'IT'): Promise<ProxyCredential[]> {
    this.requireCreds();
    const data = await this.request<AllocateResponse>('POST', '/mobile-proxy/allocate', {
      workspace_id: this.workspaceId,
      count,
      country: country.toUpperCase(),
      proxy_type: 'mobile',
    });
    return (data.proxies ?? []).map((p) => ({
      host: p.host,
      port: p.port,
      username: p.username,
      password: p.password,
      type: p.type,
      country: p.country,
      city: p.city,
      provider: this.name,
    }));
  }

  async testProxy(proxy: ProxyCredential): Promise<{ ok: boolean; latency_ms: number; ip?: string }> {
    // Vendor-side probe if the proxy was allocated through us and we kept the id;
    // otherwise fall back to a direct HTTP probe through the proxy.
    const id = (proxy as ProxyCredential & { vendor_id?: string }).vendor_id;
    if (id && this.token) {
      try {
        const data = await this.request<TestResponse>(
          'GET',
          `/mobile-proxy/${encodeURIComponent(id)}/test`,
        );
        return { ok: data.ok, latency_ms: data.latency_ms ?? 0, ip: data.egress_ip };
      } catch {
        // Fall through to direct probe.
      }
    }
    return directProbe(proxy);
  }

  async rotateIp(proxy: ProxyCredential): Promise<{ ok: boolean; new_ip?: string }> {
    this.requireCreds();
    const id = (proxy as ProxyCredential & { vendor_id?: string }).vendor_id;
    if (!id) {
      return { ok: false };
    }
    const data = await this.request<RotateResponse>(
      'POST',
      `/mobile-proxy/${encodeURIComponent(id)}/rotate`,
    );
    return { ok: data.ok, new_ip: data.new_ip };
  }

  async releaseProxy(proxy: ProxyCredential): Promise<void> {
    this.requireCreds();
    const id = (proxy as ProxyCredential & { vendor_id?: string }).vendor_id;
    if (!id) return;
    await this.request<unknown>(
      'DELETE',
      `/mobile-proxy/${encodeURIComponent(id)}`,
    );
  }

  private requireCreds(): void {
    if (!this.token || !this.workspaceId) {
      throw new Error(
        'Multilogin credentials missing. Set MULTILOGIN_API_TOKEN + MULTILOGIN_WORKSPACE_ID in .env.local.',
      );
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Multilogin proxy HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}

/** Direct probe — hits ipinfo.io through the proxy to verify connectivity + observe egress IP. */
async function directProbe(
  proxy: ProxyCredential,
): Promise<{ ok: boolean; latency_ms: number; ip?: string }> {
  // Node.js fetch doesn't natively route through HTTP proxies, so we use the
  // undici ProxyAgent dispatcher. Imported lazily to avoid type weight where unused.
  const { ProxyAgent } = await import('undici');
  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : '';
  const dispatcher = new ProxyAgent(`${proxy.type}://${auth}${proxy.host}:${proxy.port}`);
  const start = Date.now();
  try {
    const res = await fetch('https://ipinfo.io/json', {
      // @ts-expect-error — `dispatcher` is a valid undici extension, not in lib.dom types.
      dispatcher,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, latency_ms: Date.now() - start };
    const json = (await res.json()) as { ip?: string };
    return { ok: true, latency_ms: Date.now() - start, ip: json.ip };
  } catch {
    return { ok: false, latency_ms: Date.now() - start };
  }
}
