import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { hasScope, verifyApiKey, type ApiKeyRecord } from '@/lib/api-keys/manager';

/**
 * API key middleware helper for /api/v1/* routes.
 *
 * Usage in a route handler:
 *
 *   export async function GET(req: Request) {
 *     const auth = await authenticateRequest(req, 'read');
 *     if (auth instanceof NextResponse) return auth;
 *     const { record } = auth;
 *     // use record.workspace_id, scoped queries
 *   }
 */

export interface AuthSuccess {
  record: ApiKeyRecord;
}

export async function authenticateRequest(
  req: Request,
  required_scope: 'read' | 'write' | 'admin',
): Promise<AuthSuccess | NextResponse> {
  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearer) {
    return NextResponse.json(
      { error: 'Missing Authorization header. Use `Bearer mp_live_...`.' },
      { status: 401 },
    );
  }

  const record = await verifyApiKey(getSupabaseAdmin(), bearer);
  if (!record) {
    return NextResponse.json({ error: 'Invalid or expired API key' }, { status: 401 });
  }

  if (!hasScope(record, required_scope)) {
    return NextResponse.json(
      { error: `API key lacks scope "${required_scope}"` },
      { status: 403 },
    );
  }

  return { record };
}
