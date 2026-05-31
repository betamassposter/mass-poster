import { z } from 'zod';

/**
 * Env vars schema (Zod-validated).
 *
 * Pattern d'uso:
 *   import { env } from '@/lib/env';
 *   const key = env.ANTHROPIC_API_KEY;
 *
 * NON usare `process.env.X` sparso nel codice. Tutto passa da qui.
 *
 * Le env opzionali (Blocchi non ancora attivati) sono `.optional()`.
 * Le env required (Blocco 1) sono required.
 */

const schema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),

  // Supabase (Blocco 1) — REQUIRED
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(), // solo server-side

  // AI providers (Blocco 5)
  ANTHROPIC_API_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Email factory (Blocco 3)
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  FORWARDEMAIL_API_KEY: z.string().optional(),

  // Account orchestrator (Blocco 4)
  ADSPOWER_API_BASE: z.url().default('http://local.adspower.net:50325'),
  IPROYAL_API_KEY: z.string().optional(),

  // Multilogin Cloud Phones + Mobile Proxies (pivot 2026-05-28)
  // Cloud API for profile management + Local Launcher for browser lifecycle.
  // See [[reference-multilogin-api]] for the verified endpoint shapes.
  MULTILOGIN_API_BASE: z.url().default('https://api.multilogin.com'),
  MULTILOGIN_LAUNCHER_BASE: z.url().default('https://launcher.mlx.yt:45001'),
  /**
   * Signin token (or, if it ever comes back to REST, automation_token).
   * Lifetime ~1h. The provider auto-refreshes via MULTILOGIN_EMAIL/PASSWORD
   * when this expires.
   */
  MULTILOGIN_API_TOKEN: z.string().optional(),
  /**
   * Account email — used to re-signin when MULTILOGIN_API_TOKEN expires.
   * Multilogin's POST /workspace/automation_token returns HTTP 501 in REST
   * mode as of 2026-06-01, so signin + auto-refresh is our only path.
   */
  MULTILOGIN_EMAIL: z.string().optional(),
  MULTILOGIN_PASSWORD: z.string().optional(),
  MULTILOGIN_WORKSPACE_ID: z.string().optional(),
  /** Default folder to drop newly-created profiles into. Get from GET /workspace/folders. */
  MULTILOGIN_FOLDER_ID: z.string().optional(),
  /** When true (default), a proxy that fails reputation gating cannot be assigned. */
  IP_REPUTATION_STRICT: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),

  // IP reputation providers
  // AbuseIPDB: real abuse reports (community-reported, ~1k/day free). See
  // [[reference-ip-reputation-vendors]] for why we picked it over ZeroBounce.
  ABUSEIPDB_API_KEY: z.string().optional(),
  // ZeroBounce has NO public IP reputation API (their /ip-reputation-checker is
  // a web tool only). Key kept for future email-warmup use (Blocco 3).
  ZEROBOUNCE_API_KEY: z.string().optional(),
  // (Note: browserleaks.com is scraped via headless Chromium — no API key.)

  // Posting (Blocco 7)
  ZERNIO_API_KEY: z.string().optional(),
  BROWSER_USE_API_KEY: z.string().optional(),

  // Analytics (Blocco 8)
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.url().default('https://eu.i.posthog.com'),
  SENTRY_DSN: z.string().optional(),

  // Queue (Blocco 7)
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Billing (Blocco 12)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

type Env = z.infer<typeof schema>;

let cached: Env | undefined;

function load(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(z.prettifyError(parsed.error));
    throw new Error('Environment validation failed. Check .env.local against .env.example.');
  }
  cached = parsed.data;
  return cached;
}

/**
 * Lazy proxy: validation runs on first property access, not at module load.
 *
 * Why: Next.js build (Docker on Render) collects page data without runtime
 * env vars set. If env.ts validated on import, the build would crash on
 * required vars like NEXT_PUBLIC_SUPABASE_URL even though that path never
 * actually executes at build time. The proxy defers validation to first use.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    return load()[prop as keyof Env];
  },
}) as Env;

/** Guard helper per blocchi non ancora abilitati. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `Missing required env var ${String(key)}. Aggiorna .env.local. ` +
        `Vedi ../Mass Poster/SPECS/04-roadmap.md per quale blocco la introduce.`,
    );
  }
  return value as NonNullable<Env[K]>;
}
