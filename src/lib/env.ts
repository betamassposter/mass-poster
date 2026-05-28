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
  MULTILOGIN_API_BASE: z.url().default('https://api.multilogin.com'),
  MULTILOGIN_API_TOKEN: z.string().optional(),
  MULTILOGIN_WORKSPACE_ID: z.string().optional(),
  /** When true (default), a proxy that fails reputation gating cannot be assigned. */
  IP_REPUTATION_STRICT: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),

  // IP reputation providers
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

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(z.prettifyError(parsed.error));
    throw new Error('Environment validation failed. Check .env.local against .env.example.');
  }
  return parsed.data;
}

export const env: Env = load();

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
