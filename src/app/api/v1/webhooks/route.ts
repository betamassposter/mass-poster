import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { authenticateRequest } from '../auth';
import { generateWebhookSecret } from '@/lib/webhooks/dispatcher';

/**
 * Public API: webhook subscriptions.
 *
 * GET  /api/v1/webhooks
 * POST /api/v1/webhooks   body: { url, event_types[], description? }
 *
 * Scope: write to create, read to list.
 */

const createSchema = z.object({
  url: z.url(),
  event_types: z.array(z.string()).default([]),  // empty = all events
  description: z.string().max(200).optional(),
});

export async function GET(req: Request) {
  const auth = await authenticateRequest(req, 'read');
  if (auth instanceof NextResponse) return auth;
  const { record } = auth;

  const { data, error } = await getSupabaseAdmin()
    .from('webhook_subscription')
    .select('id, url, event_types, description, enabled, last_delivery_at, last_delivery_status, consecutive_failures, created_at')
    .eq('workspace_id', record.workspace_id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const auth = await authenticateRequest(req, 'write');
  if (auth instanceof NextResponse) return auth;
  const { record } = auth;

  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    const secret = generateWebhookSecret();

    const { data, error } = await getSupabaseAdmin()
      .from('webhook_subscription')
      .insert({
        workspace_id: record.workspace_id,
        url: parsed.url,
        event_types: parsed.event_types,
        description: parsed.description ?? null,
        secret,
        enabled: true,
      })
      .select('id, url, event_types, description, enabled, created_at')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      webhook: data,
      // Return secret ONCE — store it on the subscriber side
      secret,
      signature_verification: `Compute HMAC-SHA256 of "${timestampPlaceholder()}.<raw_body>" with this secret. Compare to v1=<sig> in the X-Mass-Poster-Signature header.`,
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

function timestampPlaceholder(): string {
  return '<t-from-header>';
}
