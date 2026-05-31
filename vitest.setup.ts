import { config as loadEnv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load real .env.local before any test file imports `env.ts` — the Zod
// schema in env.ts validates at module load and would otherwise throw
// inside Vitest's worker before any test code runs.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '.env.local'), quiet: true });

// Vitest sets NODE_ENV='test' on the worker, but our env.ts Zod schema
// only accepts development|staging|production. Force it back so the
// schema validates — tests do not need a dedicated 'test' branch.
// Cast away Next's readonly literal type on process.env.NODE_ENV so tests can
// satisfy our Zod schema (which only accepts development|staging|production).
(process.env as Record<string, string | undefined>).NODE_ENV = 'development';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';
