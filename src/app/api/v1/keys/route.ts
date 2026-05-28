import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { requireSession } from '@/lib/auth/session';
import { createApiKey } from '@/lib/api-keys/manager';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';

/**
 * Self-service API key management.
 *
 * Auth: Supabase session (not API key — chicken-and-egg). So these routes
 * are auth'd via the cookie/JWT session, not Bearer mp_live_...
 *
 * Why /api/v1/keys (not /api/keys): keep all "REST API" endpoints under v1
 * for consistency. They're session-auth'd, not API-key-auth'd — exception.
 *
 * GET  /api/v1/keys     list keys for current workspace (prefix only — never secret)
 * POST /api/v1/keys     create new key, returns full key ONCE
 */

const createSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(z.enum(['read', 'write', 'admin'])).default(['read']),
  expires_at: z.iso.datetime().nullable().optional(),
  env: z.enum(['live', 'test']).default('live'),
});

export async function GET() {
  const session = await requireSession();
  const { data, error } = await getSupabaseAdmin()
    .from('api_key')
    .select('id, name, key_prefix, scopes, enabled, last_used_at, expires_at, created_at')
    .eq('workspace_id', CURRENT_WORKSPACE_ID)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, user: session.user_id });
}

export async function POST(req: Request) {
  const session = await requireSession();
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    const result = await createApiKey(getSupabaseAdmin(), {
      workspace_id: CURRENT_WORKSPACE_ID,
      name: parsed.name,
      scopes: parsed.scopes,
      expires_at: parsed.expires_at ?? null,
      env: parsed.env,
      created_by_user_id: session.user_id,
    });

    return NextResponse.json({
      ok: true,
      key: result.full_key,
      warning: '⚠️ This is the only time the full key is shown. Store it now.',
      record: result.record,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: z.prettifyError(err) },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
