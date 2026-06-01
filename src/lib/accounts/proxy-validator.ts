import { env } from '../env.ts';
import { logger } from '../log.ts';
import type {
  IpReputationProvider,
  IpReputationResult,
  ProxyCredential,
  ProxyValidationVerdict,
} from './types.ts';
import { AbuseIpdbReputationProvider } from './providers/abuseipdb.ts';
import { BrowserleaksIpReputationProvider } from './providers/browserleaks.ts';
import { readCached, writeCached } from './ip-reputation-cache.ts';

const log = logger('accounts/proxy-validator');

/**
 * Two-source reputation gate.
 *
 * Composes AbuseIPDB IP reputation + browserleaks.com/ip (scraped via a
 * headless Chromium routed through the proxy under test). A proxy is
 * `clean: true` ONLY if BOTH providers return clean: true.
 *
 * Behavior depends on env IP_REPUTATION_STRICT:
 *   - true (default): a missing provider key counts as a hard fail.
 *     Forces the user to configure both before allocating production proxies.
 *   - false:          a missing provider degrades gracefully — the gate
 *     passes if every provider that COULD run returned clean. Useful for dev.
 *
 * Side effect: callers persist the verdict to the proxy_validation_check
 * table and update the proxy's validation_status / last_validation_summary.
 */

export class ProxyValidator {
  private providers: IpReputationProvider[];
  private strict: boolean;

  constructor(opts?: { providers?: IpReputationProvider[]; strict?: boolean }) {
    this.providers = opts?.providers ?? [
      new AbuseIpdbReputationProvider(),
      new BrowserleaksIpReputationProvider(),
    ];
    this.strict = opts?.strict ?? env.IP_REPUTATION_STRICT;
  }

  /**
   * Probe egress IP for the given proxy, then run every reputation provider
   * in parallel against that IP. Returns the aggregate verdict.
   */
  async validate(
    proxy: ProxyCredential,
    opts?: {
      expectedCountry?: string;
      reason?: string;
      /**
       * When provided, results are cached per `(workspace_id, provider, ip)`
       * with a 24h TTL (see [[reference-ip-reputation-vendors]] for why
       * AbuseIPDB's 1000/day free tier makes this worth doing).
       */
      workspace_id?: string;
      /** Force a fresh check, ignore cache. Default: false. */
      bypass_cache?: boolean;
    },
  ): Promise<ProxyValidationVerdict> {
    const startedAt = new Date().toISOString();
    const start = Date.now();

    const ip = await observeEgressIp(proxy);
    if (!ip) {
      return {
        clean: false,
        status: 'error',
        ip: null,
        results: [],
        failure_reasons: ['Could not observe egress IP through the proxy'],
        duration_ms: Date.now() - start,
        checked_at: startedAt,
      };
    }

    const readyFlags = await Promise.all(this.providers.map((p) => p.isReady()));
    const runnable = this.providers.filter((_, i) => readyFlags[i]);
    const skipped = this.providers.filter((_, i) => !readyFlags[i]);

    if (this.strict && skipped.length > 0) {
      return {
        clean: false,
        status: 'error',
        ip,
        results: [],
        failure_reasons: [
          ...skipped.map(
            (p) => `Provider ${p.name} not ready (missing credentials) — strict mode rejects`,
          ),
        ],
        duration_ms: Date.now() - start,
        checked_at: startedAt,
      };
    }

    if (runnable.length === 0) {
      return {
        clean: false,
        status: 'error',
        ip,
        results: [],
        failure_reasons: ['No reputation providers configured'],
        duration_ms: Date.now() - start,
        checked_at: startedAt,
      };
    }

    const useCache = Boolean(opts?.workspace_id) && !opts?.bypass_cache;

    const results: IpReputationResult[] = await Promise.all(
      runnable.map(async (p) => {
        if (useCache && opts?.workspace_id) {
          const cached = await readCached({
            workspace_id: opts.workspace_id,
            provider: p.name,
            ip,
          });
          if (cached) {
            log.debug('cache hit', { provider: p.name, ip });
            return cached;
          }
        }
        try {
          const fresh = await p.check(ip, {
            proxy,
            expectedCountry: opts?.expectedCountry,
          });
          if (useCache && opts?.workspace_id) {
            await writeCached(
              { workspace_id: opts.workspace_id, provider: p.name, ip },
              fresh,
            );
          }
          return fresh;
        } catch (err) {
          return {
            provider: p.name,
            ip,
            clean: false,
            signals: { notes: [`provider error: ${(err as Error).message}`] },
            checked_at: new Date().toISOString(),
          };
        }
      }),
    );

    const allClean = results.every((r) => r.clean);
    const failure_reasons = results
      .filter((r) => !r.clean)
      .flatMap((r) =>
        (r.signals.notes ?? []).map((n) => `[${r.provider}] ${n}`),
      );

    return {
      clean: allClean,
      status: allClean ? 'clean' : 'dirty',
      ip,
      results,
      failure_reasons,
      duration_ms: Date.now() - start,
      checked_at: startedAt,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Egress IP probe — routes through the proxy using undici's ProxyAgent,
// fetches a tiny IP-echo endpoint, and returns what the upstream world
// sees as our source IP.
// ─────────────────────────────────────────────────────────────────────

async function observeEgressIp(proxy: ProxyCredential): Promise<string | null> {
  try {
    const auth =
      proxy.username && proxy.password
        ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
        : '';

    // SOCKS5 → undici doesn't support SOCKS, so we route via node:https
    // with socks-proxy-agent. Multilogin Mobile Proxies are SOCKS5.
    if (proxy.type === 'socks5') {
      const [{ SocksProxyAgent }, https] = await Promise.all([
        import('socks-proxy-agent'),
        import('node:https'),
      ]);
      const agent = new SocksProxyAgent(
        `${proxy.type}://${auth}${proxy.host}:${proxy.port}`,
      );
      return await new Promise<string | null>((resolve) => {
        const req = https.get(
          'https://api.ipify.org?format=json',
          { agent, timeout: 15_000 },
          (res) => {
            if (res.statusCode !== 200) {
              resolve(null);
              return;
            }
            let body = '';
            res.on('data', (chunk) => (body += String(chunk)));
            res.on('end', () => {
              try {
                resolve((JSON.parse(body) as { ip?: string }).ip ?? null);
              } catch {
                resolve(null);
              }
            });
          },
        );
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });
        req.on('error', () => resolve(null));
      });
    }

    // HTTP / HTTPS proxy path — undici ProxyAgent handles this.
    const { ProxyAgent } = await import('undici');
    const dispatcher = new ProxyAgent(`${proxy.type}://${auth}${proxy.host}:${proxy.port}`);
    const res = await fetch('https://api.ipify.org?format=json', {
      // @ts-expect-error — `dispatcher` is a valid undici extension
      dispatcher,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ip?: string };
    return json.ip ?? null;
  } catch {
    return null;
  }
}
