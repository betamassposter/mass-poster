import type { SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

/**
 * Webhook dispatcher — fire outbound webhooks on events.
 *
 * Event lifecycle:
 *   1. Code calls fireEvent(supabase, workspace_id, 'post.published', payload)
 *   2. Dispatcher looks up all enabled webhook_subscription matching event_type
 *   3. For each subscriber, POST to subscriber.url with:
 *      - Body: { event, id, created_at, workspace_id, data }
 *      - Header `X-Mass-Poster-Signature: t=<ts>,v1=<hmac>` (Stripe-style)
 *      - Header `X-Mass-Poster-Event: <event_type>`
 *      - Header `X-Mass-Poster-Delivery: <delivery_id>`
 *   4. On 2xx → log success.
 *   5. On non-2xx → log failure + schedule retry (exp backoff 1m, 5m, 30m, 2h)
 *   6. After 4 failures → disable subscription, log 'disabled_for_failures'
 *
 * Signature verification (subscriber side):
 *   const [t, v1] = header.split(',').map(p => p.split('=')[1]);
 *   const expected = hmac_sha256(`${t}.${rawBody}`, secret);
 *   if (timingSafeEqual(v1, expected)) OK;
 */

export type WebhookEvent =
  | 'post.scheduled'
  | 'post.published'
  | 'post.failed'
  | 'post.dead_letter'
  | 'account.created'
  | 'account.warmup_completed'
  | 'account.banned'
  | 'content.generated'
  | 'content.approved'
  | 'tracking_link.clicked'
  | 'viral.detected';

export interface WebhookPayload {
  workspace_id: string;
  data: Record<string, unknown>;
}

const MAX_DELIVERY_ATTEMPTS = 4;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

/**
 * Fire an event to all subscribers in the workspace.
 * Returns immediately after enqueuing (best-effort fan-out, non-blocking).
 */
export async function fireEvent(
  supabase: SupabaseClient,
  workspace_id: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<{ subscribers_notified: number }> {
  const { data: subs } = await supabase
    .from('webhook_subscription')
    .select('id, url, secret, event_types, consecutive_failures')
    .eq('workspace_id', workspace_id)
    .eq('enabled', true);

  const matching = (subs ?? []).filter(
    (s) => s.event_types.length === 0 || s.event_types.includes(event),
  );

  // Fire all in parallel, don't await — they manage their own retry log
  for (const sub of matching) {
    void deliverWebhook(supabase, sub, event, { workspace_id, data });
  }

  return { subscribers_notified: matching.length };
}

interface SubscriptionRow {
  id: string;
  url: string;
  secret: string;
  consecutive_failures: number;
}

async function deliverWebhook(
  supabase: SupabaseClient,
  sub: SubscriptionRow,
  event: WebhookEvent,
  payload: WebhookPayload,
  attempt: number = 1,
): Promise<void> {
  const delivery_id = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({
    id: delivery_id,
    event,
    created_at: new Date().toISOString(),
    ...payload,
  });

  const signature = createHmac('sha256', sub.secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  let httpStatus: number | null = null;
  let responseBody = '';
  let ok = false;

  try {
    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mass-Poster-Signature': `t=${timestamp},v1=${signature}`,
        'X-Mass-Poster-Event': event,
        'X-Mass-Poster-Delivery': delivery_id,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    httpStatus = res.status;
    responseBody = (await res.text()).slice(0, 500);
    ok = res.ok;
  } catch (err) {
    responseBody = (err as Error).message;
  }

  // Log delivery
  await supabase.from('webhook_delivery').insert({
    id: delivery_id,
    webhook_id: sub.id,
    workspace_id: payload.workspace_id,
    event_type: event,
    payload: payload.data,
    http_status: httpStatus,
    response_body: responseBody,
    ok,
    attempts: attempt,
  });

  // Update subscription stats
  if (ok) {
    await supabase
      .from('webhook_subscription')
      .update({
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: 'ok',
        consecutive_failures: 0,
      })
      .eq('id', sub.id);
    return;
  }

  // Failure: maybe retry, maybe disable
  const newFailures = sub.consecutive_failures + 1;
  const shouldRetry = attempt < MAX_DELIVERY_ATTEMPTS;
  const shouldDisable = newFailures >= 20;

  await supabase
    .from('webhook_subscription')
    .update({
      last_delivery_at: new Date().toISOString(),
      last_delivery_status: 'failed',
      consecutive_failures: newFailures,
      enabled: !shouldDisable,
    })
    .eq('id', sub.id);

  if (shouldRetry) {
    setTimeout(() => {
      void deliverWebhook(supabase, { ...sub, consecutive_failures: newFailures }, event, payload, attempt + 1);
    }, BACKOFF_MS[attempt - 1]!);
  }
}

/** Generate a webhook secret (32 random URL-safe chars). */
export function generateWebhookSecret(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString('base64url');
}
