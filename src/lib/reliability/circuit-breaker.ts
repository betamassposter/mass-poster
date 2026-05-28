/**
 * Circuit breaker — protect downstream providers from cascading failures.
 *
 * 3 states:
 *  - CLOSED (normal): requests pass through. On failure: increment counter.
 *    If counter ≥ threshold within window → OPEN.
 *  - OPEN (tripped): fail-fast for `cooldown_ms`. Then transition → HALF_OPEN.
 *  - HALF_OPEN (probing): let 1 request through. If success → CLOSED. If fail → OPEN.
 *
 * In-memory, per-provider. Keyed by stable provider name (e.g. "claude", "fal", "zernio").
 *
 * Why this matters: when Zernio is down, our scheduler tries to publish 50 posts
 * in 30 seconds — each times out 30s — that's 25 minutes wasted + 50 retries piling
 * up. With circuit breaker: first 5 fail → open → next 45 fail-fast in 5ms each.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitOptions {
  /** Failures within window to trip the breaker. Default 5. */
  failure_threshold: number;
  /** Window in ms over which failures are counted. Default 60s. */
  rolling_window_ms: number;
  /** How long to stay OPEN before testing again. Default 60s. */
  cooldown_ms: number;
}

const DEFAULT_OPTS: CircuitOptions = {
  failure_threshold: 5,
  rolling_window_ms: 60_000,
  cooldown_ms: 60_000,
};

interface CircuitData {
  state: CircuitState;
  failures: Array<{ at: number }>;
  opened_at: number | null;
}

const circuits = new Map<string, CircuitData>();
const optsMap = new Map<string, CircuitOptions>();

export class CircuitOpenError extends Error {
  constructor(public readonly provider: string, public readonly cooldown_remaining_ms: number) {
    super(`Circuit OPEN for ${provider}; retry in ${Math.ceil(cooldown_remaining_ms / 1000)}s`);
    this.name = 'CircuitOpenError';
  }
}

function getCircuit(name: string): CircuitData {
  let c = circuits.get(name);
  if (!c) {
    c = { state: 'CLOSED', failures: [], opened_at: null };
    circuits.set(name, c);
  }
  return c;
}

function getOpts(name: string): CircuitOptions {
  return optsMap.get(name) ?? DEFAULT_OPTS;
}

export function configureCircuit(name: string, opts: Partial<CircuitOptions>): void {
  optsMap.set(name, { ...DEFAULT_OPTS, ...opts });
}

/**
 * Wrap an async call with the circuit breaker.
 * Throws CircuitOpenError if the circuit is OPEN.
 */
export async function withCircuit<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const opts = getOpts(name);
  const c = getCircuit(name);
  const now = Date.now();

  // Prune old failures outside the rolling window
  c.failures = c.failures.filter((f) => now - f.at < opts.rolling_window_ms);

  // Transition OPEN → HALF_OPEN after cooldown
  if (c.state === 'OPEN' && c.opened_at !== null) {
    const elapsed = now - c.opened_at;
    if (elapsed >= opts.cooldown_ms) {
      c.state = 'HALF_OPEN';
    } else {
      throw new CircuitOpenError(name, opts.cooldown_ms - elapsed);
    }
  }

  try {
    const result = await fn();
    // Success: close the circuit, clear failures
    c.state = 'CLOSED';
    c.failures = [];
    c.opened_at = null;
    return result;
  } catch (err) {
    c.failures.push({ at: now });

    // Trip the breaker if threshold reached
    if (c.state === 'HALF_OPEN' || c.failures.length >= opts.failure_threshold) {
      c.state = 'OPEN';
      c.opened_at = now;
    }
    throw err;
  }
}

/** Inspect current state (for telemetry / dashboards). */
export function getCircuitState(name: string): {
  state: CircuitState;
  failures_in_window: number;
  opened_at: number | null;
  cooldown_remaining_ms: number;
} {
  const c = getCircuit(name);
  const opts = getOpts(name);
  const now = Date.now();
  const recent = c.failures.filter((f) => now - f.at < opts.rolling_window_ms);
  return {
    state: c.state,
    failures_in_window: recent.length,
    opened_at: c.opened_at,
    cooldown_remaining_ms:
      c.state === 'OPEN' && c.opened_at !== null
        ? Math.max(0, opts.cooldown_ms - (now - c.opened_at))
        : 0,
  };
}

export function resetCircuit(name: string): void {
  circuits.delete(name);
}

export function resetAllCircuits(): void {
  circuits.clear();
}

/** Snapshot of all currently-known circuits — for monitoring endpoint. */
export function snapshotCircuits(): Array<{ name: string; state: CircuitState; failures: number }> {
  return [...circuits.entries()].map(([name, c]) => ({
    name,
    state: c.state,
    failures: c.failures.length,
  }));
}
