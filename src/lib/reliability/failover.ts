import { CircuitOpenError, withCircuit } from './circuit-breaker.ts';

/**
 * Failover chain — try a list of providers in order, returning the first success.
 *
 * Pattern:
 *   const result = await tryChain([
 *     { name: 'claude', call: () => claude.gen(req) },
 *     { name: 'openai', call: () => openai.gen(req) },
 *     { name: 'mock',   call: () => mock.gen(req) },
 *   ], { provider_filter: shouldTryNext });
 *
 * Each provider is wrapped in its own circuit breaker. If a provider's circuit
 * is OPEN, we skip to the next without waiting.
 *
 * On *every* provider failing, throws AllProvidersFailedError with the
 * full list of errors for postmortem.
 */

export interface ProviderAttempt<T> {
  name: string;
  call: () => Promise<T>;
  /** If set, only attempt this provider if predicate returns true.
   *  E.g. "skip OpenAI if budget < threshold". */
  skip_if?: () => boolean | Promise<boolean>;
}

export interface ChainOptions {
  /** Custom predicate: should we try the next provider given this error? Default: always yes. */
  is_retryable?: (error: unknown) => boolean;
  /** Called before each attempt for telemetry. */
  on_attempt?: (info: { provider: string; attempt: number }) => void;
  /** Called on each failure for telemetry. */
  on_failure?: (info: { provider: string; error: unknown; will_failover: boolean }) => void;
  /** Called on success for telemetry. */
  on_success?: (info: { provider: string; attempt: number; primary: boolean }) => void;
}

export interface AttemptResult<T> {
  value: T;
  /** Provider name that succeeded. */
  provider: string;
  /** Index in the chain (0 = primary). */
  attempt: number;
  /** True if the primary (index 0) was used. */
  was_primary: boolean;
  /** Errors from providers that came before the successful one. */
  failover_errors: Array<{ provider: string; error: string }>;
}

export class AllProvidersFailedError extends Error {
  constructor(
    public readonly errors: Array<{ provider: string; error: unknown }>,
  ) {
    super(
      `All providers failed:\n${errors
        .map((e) => `  ${e.provider}: ${(e.error as Error).message ?? String(e.error)}`)
        .join('\n')}`,
    );
    this.name = 'AllProvidersFailedError';
  }
}

const DEFAULT_RETRYABLE = (err: unknown): boolean => {
  if (err instanceof CircuitOpenError) return true;
  const msg = (err as Error).message ?? String(err);
  // Generic transient signals
  return /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|5\d\d|rate.?limit|overloaded|503|504|429/i.test(
    msg,
  );
};

export async function tryChain<T>(
  attempts: ProviderAttempt<T>[],
  options: ChainOptions = {},
): Promise<AttemptResult<T>> {
  const errors: Array<{ provider: string; error: unknown }> = [];
  const isRetryable = options.is_retryable ?? DEFAULT_RETRYABLE;

  for (let i = 0; i < attempts.length; i++) {
    const att = attempts[i]!;

    if (att.skip_if) {
      try {
        const should_skip = await att.skip_if();
        if (should_skip) {
          errors.push({ provider: att.name, error: new Error('skipped by predicate') });
          continue;
        }
      } catch {
        // ignore skip evaluation errors
      }
    }

    options.on_attempt?.({ provider: att.name, attempt: i });

    try {
      const value = await withCircuit(att.name, att.call);
      options.on_success?.({ provider: att.name, attempt: i, primary: i === 0 });
      return {
        value,
        provider: att.name,
        attempt: i,
        was_primary: i === 0,
        failover_errors: errors.map((e) => ({
          provider: e.provider,
          error: (e.error as Error).message ?? String(e.error),
        })),
      };
    } catch (err) {
      const willFailover = i < attempts.length - 1 && isRetryable(err);
      options.on_failure?.({ provider: att.name, error: err, will_failover: willFailover });
      errors.push({ provider: att.name, error: err });

      if (!willFailover && i < attempts.length - 1) {
        // Non-retryable error AND we have more providers: still treat as final?
        // Conservative: stop the chain on non-retryable errors (e.g. AuthError).
        break;
      }
    }
  }

  throw new AllProvidersFailedError(errors);
}
