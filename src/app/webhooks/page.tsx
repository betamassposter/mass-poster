import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Webhook, AlertCircle, CheckCircle2 } from 'lucide-react';
import { WebhookCreator } from './webhook-creator';

export const dynamic = 'force-dynamic';

export default async function WebhooksPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: subs }, { data: recentDeliveries }] = await Promise.all([
    supabase
      .from('webhook_subscription')
      .select('id, url, event_types, description, enabled, last_delivery_at, last_delivery_status, consecutive_failures, created_at')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('created_at', { ascending: false }),
    supabase
      .from('webhook_delivery')
      .select('id, webhook_id, event_type, ok, http_status, delivered_at')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('delivered_at', { ascending: false })
      .limit(50),
  ]);

  const deliveryStats = new Map<string, { total: number; ok: number; lastErr?: string }>();
  for (const d of recentDeliveries ?? []) {
    const s = deliveryStats.get(d.webhook_id) ?? { total: 0, ok: 0 };
    s.total++;
    if (d.ok) s.ok++;
    deliveryStats.set(d.webhook_id, s);
  }

  return (
    <div className="space-y-8 animate-float-in">
      <PageHeader
        eyebrow="Developer"
        title="Webhooks"
        description="Subscribe to events (post published, account banned, content generated). Stripe-style signed payloads via HMAC-SHA256."
      />

      <WebhookCreator />

      <div className="surface-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-baseline justify-between">
          <h2 className="font-semibold text-sm">
            Active subscriptions <span className="text-text-muted font-normal">({subs?.length ?? 0})</span>
          </h2>
        </div>

        {!subs || subs.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title="No webhooks yet"
            description="Add an endpoint to receive event notifications. Useful for n8n, Zapier, custom dashboards."
          />
        ) : (
          <div className="divide-y divide-border-subtle">
            {subs.map((s) => {
              const stats = deliveryStats.get(s.id);
              return (
                <div key={s.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-[13px] font-mono text-text-primary truncate">{s.url}</code>
                        <span
                          className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full"
                          style={{
                            color: s.enabled ? 'var(--status-success)' : 'var(--text-muted)',
                            background: s.enabled ? 'var(--status-success-bg)' : 'var(--bg-hover)',
                          }}
                        >
                          {s.enabled ? 'active' : 'disabled'}
                        </span>
                      </div>
                      {s.description && (
                        <p className="text-[12px] text-text-muted">{s.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(s.event_types as string[]).length === 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary font-mono">
                            all events
                          </span>
                        ) : (
                          (s.event_types as string[]).map((et) => (
                            <span
                              key={et}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary font-mono"
                            >
                              {et}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-text-muted font-mono pt-2 border-t border-border-subtle/60 mt-3">
                    {stats ? (
                      <>
                        <span className="text-[color:var(--status-success)] flex items-center gap-1">
                          <CheckCircle2 size={10} />
                          {stats.ok}/{stats.total} delivered
                        </span>
                      </>
                    ) : (
                      <span>no deliveries yet</span>
                    )}
                    {s.consecutive_failures > 0 && (
                      <span className="text-[color:var(--status-danger)] flex items-center gap-1">
                        <AlertCircle size={10} />
                        {s.consecutive_failures} consecutive failures
                      </span>
                    )}
                    {s.last_delivery_at && (
                      <span>
                        last: {new Date(s.last_delivery_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {recentDeliveries && recentDeliveries.length > 0 && (
        <div className="surface-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border-subtle">
            <h2 className="font-semibold text-sm">Recent deliveries</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="text-left px-5 py-2.5 font-medium">Event</th>
                  <th className="text-left px-5 py-2.5 font-medium">Webhook</th>
                  <th className="text-right px-5 py-2.5 font-medium">Status</th>
                  <th className="text-right px-5 py-2.5 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentDeliveries.map((d) => (
                  <tr key={d.id} className="border-t border-border-subtle/60 hover:bg-bg-hover/30 transition-colors">
                    <td className="px-5 py-2.5 font-mono text-[12px]">{d.event_type}</td>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-text-muted">{d.webhook_id.slice(0, 8)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span
                        className="font-mono text-[11px] font-medium"
                        style={{ color: d.ok ? 'var(--status-success)' : 'var(--status-danger)' }}
                      >
                        {d.http_status ?? 'err'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-[11px] text-text-muted">
                      {new Date(d.delivered_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
