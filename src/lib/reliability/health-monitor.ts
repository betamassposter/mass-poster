import type { SupabaseClient } from '@supabase/supabase-js';
import { snapshotCircuits } from './circuit-breaker.ts';

/**
 * Provider health monitor — periodic ping, persists status to DB for
 * dashboard visibility and alerting.
 *
 * Each provider has a "probe" function that:
 *   - returns { ok: true, latency_ms } if healthy
 *   - returns { ok: false, error } if degraded/down
 *
 * Runs via cron (`pnpm health:probe`) or on-demand from API endpoint.
 *
 * Persists to `provider_health` table (migration 0011) — see schema below.
 */

export type ProviderStatus = 'healthy' | 'degraded' | 'down';

export interface ProbeResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

export interface ProviderProbe {
  name: string;
  category: 'ai_text' | 'ai_video' | 'ai_voice' | 'posting' | 'antidetect' | 'email' | 'analytics';
  probe: () => Promise<ProbeResult>;
}

export interface HealthSnapshot {
  provider: string;
  category: string;
  status: ProviderStatus;
  latency_ms: number;
  consecutive_failures: number;
  last_check_at: string;
  circuit_state: string;
  last_error?: string;
}

/** Run all probes in parallel, persist results, return snapshot. */
export async function runHealthChecks(
  supabase: SupabaseClient,
  probes: ProviderProbe[],
): Promise<HealthSnapshot[]> {
  const circuitStates = new Map(
    snapshotCircuits().map((c) => [c.name, c.state] as const),
  );

  const results: HealthSnapshot[] = await Promise.all(
    probes.map(async (p) => {
      const start = Date.now();
      let probeResult: ProbeResult;
      try {
        probeResult = await Promise.race([
          p.probe(),
          new Promise<ProbeResult>((_, reject) =>
            setTimeout(() => reject(new Error('Probe timeout (10s)')), 10_000),
          ),
        ]);
      } catch (err) {
        probeResult = {
          ok: false,
          latency_ms: Date.now() - start,
          error: (err as Error).message,
        };
      }

      // Read prior status from DB to compute consecutive_failures
      const { data: prior } = await supabase
        .from('provider_health')
        .select('consecutive_failures')
        .eq('provider', p.name)
        .maybeSingle();

      const consecutive_failures = probeResult.ok
        ? 0
        : ((prior?.consecutive_failures as number | undefined) ?? 0) + 1;

      const status: ProviderStatus = probeResult.ok
        ? probeResult.latency_ms > 5000
          ? 'degraded'
          : 'healthy'
        : consecutive_failures >= 3
          ? 'down'
          : 'degraded';

      const snapshot: HealthSnapshot = {
        provider: p.name,
        category: p.category,
        status,
        latency_ms: probeResult.latency_ms,
        consecutive_failures,
        last_check_at: new Date().toISOString(),
        circuit_state: circuitStates.get(p.name) ?? 'CLOSED',
        last_error: probeResult.error,
      };

      // Upsert into DB
      await supabase.from('provider_health').upsert(
        {
          provider: p.name,
          category: p.category,
          status,
          latency_ms: probeResult.latency_ms,
          consecutive_failures,
          last_check_at: snapshot.last_check_at,
          circuit_state: snapshot.circuit_state,
          last_error: probeResult.error ?? null,
        },
        { onConflict: 'provider' },
      );

      return snapshot;
    }),
  );

  return results;
}

// Helper probe builders ───────────────────────────────────────────────

/** HTTP GET probe. Returns ok if status 2xx in <5s. */
export function httpProbe(
  name: string,
  category: ProviderProbe['category'],
  url: string,
  headers: Record<string, string> = {},
): ProviderProbe {
  return {
    name,
    category,
    probe: async () => {
      const start = Date.now();
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
        const latency_ms = Date.now() - start;
        if (!res.ok) {
          return { ok: false, latency_ms, error: `HTTP ${res.status}` };
        }
        return { ok: true, latency_ms };
      } catch (err) {
        return { ok: false, latency_ms: Date.now() - start, error: (err as Error).message };
      }
    },
  };
}
