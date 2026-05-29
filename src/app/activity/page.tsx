import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Activity, Users, Send, Sparkles, Webhook } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface EventItem {
  id: string;
  type: string;
  category: 'account' | 'post' | 'content' | 'webhook' | 'system';
  title: string;
  description?: string;
  timestamp: string;
  brand_name?: string;
  meta?: Record<string, unknown>;
}

const CATEGORY_CONFIG: Record<
  EventItem['category'],
  { icon: React.ComponentType<{ size?: number; className?: string }>; color: string }
> = {
  account: { icon: Users, color: 'var(--status-info)' },
  post: { icon: Send, color: 'var(--accent)' },
  content: { icon: Sparkles, color: 'var(--lime)' },
  webhook: { icon: Webhook, color: 'var(--magenta)' },
  system: { icon: Activity, color: 'var(--text-muted)' },
};

function getEventDisplay(eventType: string): {
  title: string;
  category: EventItem['category'];
} {
  if (eventType.startsWith('ban_')) return { title: 'Account banned', category: 'account' };
  if (eventType === 'profile_created') return { title: 'Profile created', category: 'account' };
  if (eventType === 'browser_started') return { title: 'Browser opened', category: 'account' };
  if (eventType === 'browser_stopped') return { title: 'Browser closed', category: 'account' };
  if (eventType === 'login') return { title: 'Account logged in', category: 'account' };
  if (eventType === 'post') return { title: 'Posted', category: 'post' };
  if (eventType === 'rate_limit') return { title: 'Rate limit hit', category: 'account' };
  if (eventType === 'shadowban_suspected') return { title: 'Shadowban suspected', category: 'account' };
  if (eventType === 'health_check') return { title: 'Health check', category: 'system' };
  if (eventType === 'otp_received') return { title: 'OTP received', category: 'account' };
  return { title: eventType.replace(/_/g, ' '), category: 'system' };
}

export default async function ActivityPage() {
  const supabase = getSupabaseAdmin();

  const [{ data: accountEvents }, { data: posts }, { data: contents }, { data: deliveries }, { data: brands }, { data: accounts }] =
    await Promise.all([
      supabase
        .from('account_event')
        .select('id, event_type, details, occurred_at, account_id')
        .eq('workspace_id', CURRENT_WORKSPACE_ID)
        .order('occurred_at', { ascending: false })
        .limit(50),
      supabase
        .from('post')
        .select('id, status, published_at, scheduled_at, platform_post_url, account_id, content_id')
        .eq('workspace_id', CURRENT_WORKSPACE_ID)
        .order('updated_at', { ascending: false })
        .limit(30),
      supabase
        .from('content')
        .select('id, hook, status, brand_id, created_at, cost_eur')
        .eq('workspace_id', CURRENT_WORKSPACE_ID)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('webhook_delivery')
        .select('id, event_type, ok, http_status, delivered_at')
        .eq('workspace_id', CURRENT_WORKSPACE_ID)
        .order('delivered_at', { ascending: false })
        .limit(20),
      supabase
        .from('brand')
        .select('id, name')
        .eq('workspace_id', CURRENT_WORKSPACE_ID),
      supabase
        .from('account')
        .select('id, handle, platform, brand_id')
        .eq('workspace_id', CURRENT_WORKSPACE_ID),
    ]);

  const brandsById = new Map((brands ?? []).map((b) => [b.id, b]));
  const accountsById = new Map((accounts ?? []).map((a) => [a.id, a]));

  // Merge all event sources into unified timeline
  const events: EventItem[] = [];

  for (const e of accountEvents ?? []) {
    const display = getEventDisplay(e.event_type);
    const account = accountsById.get(e.account_id);
    events.push({
      id: `ae_${e.id}`,
      type: e.event_type,
      category: display.category,
      title: display.title,
      description: account ? `@${account.handle} · ${account.platform}` : undefined,
      timestamp: e.occurred_at,
      brand_name: account ? brandsById.get(account.brand_id)?.name : undefined,
      meta: e.details as Record<string, unknown>,
    });
  }

  for (const p of posts ?? []) {
    const account = accountsById.get(p.account_id);
    const ts = p.published_at ?? p.scheduled_at;
    events.push({
      id: `p_${p.id}`,
      type: `post.${p.status}`,
      category: 'post',
      title:
        p.status === 'published'
          ? 'Post published'
          : p.status === 'failed'
            ? 'Post failed'
            : p.status === 'publishing'
              ? 'Publishing post'
              : 'Post scheduled',
      description: account ? `@${account.handle} · ${account.platform}` : undefined,
      timestamp: ts,
      brand_name: account ? brandsById.get(account.brand_id)?.name : undefined,
    });
  }

  for (const c of contents ?? []) {
    events.push({
      id: `c_${c.id}`,
      type: `content.${c.status}`,
      category: 'content',
      title: c.status === 'generated' ? 'Content generated' : `Content ${c.status}`,
      description: c.hook ?? undefined,
      timestamp: c.created_at,
      brand_name: brandsById.get(c.brand_id)?.name,
      meta: { cost_eur: c.cost_eur },
    });
  }

  for (const d of deliveries ?? []) {
    events.push({
      id: `wd_${d.id}`,
      type: `webhook.${d.event_type}`,
      category: 'webhook',
      title: d.ok ? 'Webhook delivered' : 'Webhook failed',
      description: `${d.event_type} → HTTP ${d.http_status ?? '—'}`,
      timestamp: d.delivered_at,
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Group by day (relative)
  const grouped = new Map<string, EventItem[]>();
  const now = new Date();
  for (const e of events) {
    const d = new Date(e.timestamp);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
    let label: string;
    if (diffDays === 0) label = 'Today';
    else if (diffDays === 1) label = 'Yesterday';
    else if (diffDays < 7) label = `${diffDays} days ago`;
    else label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const arr = grouped.get(label) ?? [];
    arr.push(e);
    grouped.set(label, arr);
  }

  return (
    <div className="space-y-8 animate-float-in">
      <PageHeader
        eyebrow="Audit & Events"
        title="Activity"
        description="Real-time stream of everything happening across accounts, content, posts, and webhooks"
      />

      {events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity yet"
          description="Events show up here automatically: account lifecycle (creating → warmup → active), content generation, post lifecycle, webhook deliveries. Create an account or generate content to populate the timeline."
          cta={{ label: 'Create an account', href: '/accounts', variant: 'accent' }}
          secondary={{ label: 'Generate content', href: '/brands' }}
        />
      ) : (
        <div className="surface-card">
          {[...grouped.entries()].map(([day, items], i) => (
            <div key={day} className={i > 0 ? 'border-t border-border-subtle' : ''}>
              <div className="px-6 pt-4 pb-2 sticky top-14 surface-glass">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-[11px] uppercase tracking-[0.1em] font-medium text-text-muted">{day}</h2>
                  <span className="text-[10px] text-text-faint font-mono">{items.length} events</span>
                </div>
              </div>
              <div className="divide-y divide-border-subtle/60">
                {items.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: EventItem }) {
  const cfg = CATEGORY_CONFIG[event.category];
  const Icon = cfg.icon;

  return (
    <div className="px-6 py-3 flex items-start gap-3 hover:bg-bg-hover/30 transition-colors">
      <div
        className="h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `${cfg.color}1f`, color: cfg.color }}
      >
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-medium">{event.title}</p>
          <span className="text-[10px] text-text-faint font-mono flex-shrink-0">
            {new Date(event.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {event.description && (
          <p className="text-[12px] text-text-muted mt-0.5 truncate">{event.description}</p>
        )}
        {event.brand_name && (
          <span className="inline-block text-[10px] text-text-faint mt-1">{event.brand_name}</span>
        )}
      </div>
    </div>
  );
}
