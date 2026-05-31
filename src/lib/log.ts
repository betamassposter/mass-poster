/**
 * Centralized structured logger.
 *
 * Use this instead of `console.log` everywhere. Scoped loggers attach a
 * module name to every line so it's grep-able. In production we emit JSON
 * (one log per line, ready for any sink); in dev we pretty-print.
 *
 * Pattern:
 *   import { logger } from '@/lib/log';
 *   const log = logger('accounts/orchestrator');
 *   log.info('account created', { account_id, brand_id });
 *   log.error('proxy gate failed', { proxy_id, reasons });
 *
 * Levels: debug | info | warn | error. Filter via LOG_LEVEL env (default 'info').
 *
 * Wiring sinks later (Sentry, Datadog, Axiom): patch `emit()` — every call
 * goes through it. Don't sprinkle vendor SDKs across modules.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (process.env.LOG_LEVEL?.toLowerCase() ?? 'info') as Level;
const threshold = LEVELS[envLevel] ?? LEVELS.info;
const isDev = process.env.NODE_ENV !== 'production';

interface LogRecord {
  ts: string;
  level: Level;
  scope: string;
  msg: string;
  ctx?: Record<string, unknown>;
}

function emit(record: LogRecord): void {
  if (LEVELS[record.level] < threshold) return;

  if (isDev) {
    const color =
      record.level === 'error'
        ? '\x1b[31m'
        : record.level === 'warn'
          ? '\x1b[33m'
          : record.level === 'debug'
            ? '\x1b[90m'
            : '\x1b[36m';
    const reset = '\x1b[0m';
    const tag = `${color}[${record.level.toUpperCase()}]${reset}`;
    const scope = `\x1b[90m${record.scope}\x1b[0m`;
    const ctxStr = record.ctx ? ` ${JSON.stringify(record.ctx)}` : '';
    console.log(`${tag} ${scope} ${record.msg}${ctxStr}`);
    return;
  }

  // Production: one JSON object per line — easy for any aggregator.
  console.log(JSON.stringify(record));
}

export interface ScopedLogger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  /** Spawn a sub-scoped logger ("accounts" → "accounts/multilogin"). */
  child(subScope: string): ScopedLogger;
}

function build(scope: string): ScopedLogger {
  const make = (level: Level) => (msg: string, ctx?: Record<string, unknown>) =>
    emit({ ts: new Date().toISOString(), level, scope, msg, ctx });

  return {
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    child(subScope) {
      return build(`${scope}/${subScope}`);
    },
  };
}

export function logger(scope: string): ScopedLogger {
  return build(scope);
}
