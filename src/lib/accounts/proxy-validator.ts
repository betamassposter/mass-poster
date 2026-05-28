import { env } from '../env.ts';
import type {
  IpReputationProvider,
  IpReputationResult,
  ProxyCredential,
  ProxyValidationVerdict,
} from './types.ts';
import { ZeroBounceIpReputationProvider } from './providers/zerobounce-ip.ts';
import { IpFingerprintReputationProvider } from './providers/ip-fingerprint.ts';

/**
 * Two-source reputation gate.
 *
 * Composes ZeroBounce IP reputation + an IP-fingerprint check (server-side
 * equivalent of browserleaks.com/ip checks). A proxy is `clean: true` ONLY if
 * BOTH providers return clean: true.
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
      new ZeroBounceIpReputationProvider(),
      new IpFingerprintReputationProvider(),
    ];
    this.strict = opts?.strict ?? env.IP_REPUTATION_STRICT;
  }

  /**
   * Probe egress IP for the given proxy, then run every reputation provider
   * in parallel against that IP. Returns the aggregate verdict.
   */
  async validate(
    proxy: ProxyCredential,
    opts?: { expectedCountry?: string; reason?: string },
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

    const results: IpReputationResult[] = await Promise.all(
      runnable.map((p) =>
        p
          .check(ip, { proxy, expectedCountry: opts?.expectedCountry })
          .catch((err): IpReputationResult => ({
            provider: p.name,
            ip,
            clean: false,
            signals: { notes: [`provider error: ${(err as Error).message}`] },
            checked_at: new Date().toISOString(),
          })),
      ),
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
    const { ProxyAgent } = await import('undici');
    const auth =
      proxy.username && proxy.password
        ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
        : '';
    const dispatcher = new ProxyAgent(`${proxy.type}://${auth}${proxy.host}:${proxy.port}`);
    const res = await fetch('https://api.ipify.org?format=json', {
      // @ts-expect-error — `dispatcher` is a valid undici extension
      dispatcher,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ip?: string };
    return json.ip ?? null;
  } catch {
    return null;
  }
}
