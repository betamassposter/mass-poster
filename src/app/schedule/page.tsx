import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KPICard } from '@/components/ui/kpi-card';
import { Calendar, Clock, Send, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PLATFORM_COLOR: Record<string, string> = {
  instagram: 'var(--magenta)',
  tiktok: 'var(--accent)',
  youtube_shorts: 'var(--status-danger)',
  x: 'var(--text-primary)',
  linkedin: 'var(--status-info)',
};

export default async function SchedulePage() {
  const supabase = getSupabaseAdmin();

  const [{ data: posts }, { data: accounts }, { data: contents }, { data: brands }] = await Promise.all([
    supabase
      .from('post')
      .select('id, content_id, account_id, scheduled_at, published_at, status, posting_provider, platform_post_url, retries')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('scheduled_at', { ascending: true })
      .limit(200),
    supabase
      .from('account')
      .select('id, handle, platform, brand_id')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('content')
      .select('id, hook, brand_id')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('brand')
      .select('id, name')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
  ]);

  const accountsById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const contentsById = new Map((contents ?? []).map((c) => [c.id, c]));
  const brandsById = new Map((brands ?? []).map((b) => [b.id, b]));

  const now = new Date();
  const upcoming = (posts ?? []).filter(
    (p) => p.status === 'scheduled' && new Date(p.scheduled_at) > now,
  );
  const overdue = (posts ?? []).filter(
    (p) => p.status === 'scheduled' && new Date(p.scheduled_at) <= now,
  );
  const recent = (posts ?? [])
    .filter((p) => p.status === 'published')
    .sort((a, b) =>
      new Date(b.published_at ?? b.scheduled_at).getTime() -
      new Date(a.published_at ?? a.scheduled_at).getTime(),
    )
    .slice(0, 10);
  const failed = (posts ?? []).filter((p) => p.status === 'failed');

  // Group upcoming by day
  const grouped = new Map<string, typeof upcoming>();
  for (const p of upcoming) {
    const d = new Date(p.scheduled_at);
    const diffDays = Math.floor((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    let label: string;
    if (diffDays === 0) label = 'Today';
    else if (diffDays === 1) label = 'Tomorrow';
    else if (diffDays < 7) label = d.toLocaleDateString('en-US', { weekday: 'long' });
    else label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const arr = grouped.get(label) ?? [];
    arr.push(p);
    grouped.set(label, arr);
  }

  return (
    <div className="space-y-8 animate-float-in">
      <PageHeader
        eyebrow="Schedule"
        title="Posting schedule"
        description="Scheduled, overdue, recently published, and failed posts across all accounts"
        actions={
          <Link
            href="/content"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-[color:var(--accent)] text-bg-canvas text-sm font-medium hover:bg-[color:var(--accent-strong)] transition-colors"
          >
            <Send size={14} />
            Schedule from content
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Upcoming" value={upcoming.length} icon={<Calendar size={14} />} variant="accent" hint="next 7 days" />
        <KPICard label="Overdue" value={overdue.length} icon={<Clock size={14} />} variant="amber" hint="will run on next tick" />
        <KPICard label="Published 24h" value={recent.length} icon={<Send size={14} />} variant="lime" />
        <KPICard label="Failed" value={failed.length} icon={<AlertTriangle size={14} />} hint="awaiting retry or dead-letter" />
      </div>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="surface-elevated border border-[color:var(--status-warning)]/30 rounded-lg p-4 flex items-start gap-3">
          <Clock size={16} className="text-[color:var(--status-warning)] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-text-primary mb-1">
              {overdue.length} post{overdue.length > 1 ? 's' : ''} overdue
            </div>
            <p className="text-xs text-text-muted">
              These will be picked up on next <code className="font-mono px-1 rounded bg-bg-canvas">pnpm post:tick</code> run.
              Configure Vercel Cron or Inngest for automatic execution.
            </p>
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length === 0 && overdue.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No scheduled posts"
          description="Go to /content, approve some ideas, and schedule them across your accounts."
          cta={{ label: 'Browse content', href: '/content', variant: 'accent' }}
        />
      ) : (
        <div className="space-y-6">
          {/* Upcoming grouped by day */}
          {[...grouped.entries()].map(([day, items]) => (
            <div key={day} className="surface-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border-subtle flex items-baseline justify-between">
                <h3 className="text-[11px] uppercase tracking-[0.1em] font-medium text-text-muted">{day}</h3>
                <span className="text-[11px] text-text-faint font-mono">{items.length} posts</span>
              </div>
              <div className="divide-y divide-border-subtle/60">
                {items.map((p) => {
                  const acct = accountsById.get(p.account_id);
                  const content = contentsById.get(p.content_id);
                  const brand = acct ? brandsById.get(acct.brand_id) : null;
                  const platformColor = acct ? PLATFORM_COLOR[acct.platform] ?? 'var(--text-muted)' : 'var(--text-muted)';
                  const t = new Date(p.scheduled_at);
                  return (
                    <Link
                      key={p.id}
                      href={content ? `/content/${content.id}` : `/schedule`}
                      className="px-5 py-3 flex items-center gap-4 hover:bg-bg-hover/30 transition-colors"
                    >
                      {/* Time */}
                      <div className="font-mono text-[12px] text-text-muted w-14 flex-shrink-0">
                        {t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </div>
                      {/* Platform glyph */}
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded font-mono text-[9px] font-bold text-bg-canvas flex-shrink-0"
                        style={{ background: platformColor }}
                      >
                        {acct?.platform.slice(0, 2).toUpperCase() ?? '?'}
                      </span>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{content?.hook ?? '—'}</p>
                        <div className="text-[10px] text-text-muted">
                          @{acct?.handle ?? 'unknown'} · {brand?.name ?? '—'}
                        </div>
                      </div>
                      {/* Status */}
                      <span
                        className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          color: 'var(--accent)',
                          background: 'var(--accent-glow)',
                        }}
                      >
                        scheduled
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recently published */}
      {recent.length > 0 && (
        <div className="surface-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h3 className="text-sm font-semibold">Recently published</h3>
          </div>
          <div className="divide-y divide-border-subtle/60">
            {recent.map((p) => {
              const acct = accountsById.get(p.account_id);
              const content = contentsById.get(p.content_id);
              const t = new Date(p.published_at ?? p.scheduled_at);
              return (
                <div key={p.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="font-mono text-[12px] text-text-muted w-20 flex-shrink-0">
                    {t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded font-mono text-[9px] font-bold text-bg-canvas flex-shrink-0"
                    style={{ background: PLATFORM_COLOR[acct?.platform ?? ''] ?? 'var(--text-muted)' }}
                  >
                    {acct?.platform.slice(0, 2).toUpperCase() ?? '?'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{content?.hook ?? '—'}</p>
                    <div className="text-[10px] text-text-muted">@{acct?.handle ?? 'unknown'}</div>
                  </div>
                  {p.platform_post_url && (
                    <a
                      href={p.platform_post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[color:var(--accent)] hover:underline"
                    >
                      view live
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <div className="surface-card overflow-hidden border-[color:var(--status-danger)]/20">
          <div className="px-5 py-3 border-b border-border-subtle">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle size={14} className="text-[color:var(--status-danger)]" />
              Failed posts
            </h3>
          </div>
          <div className="divide-y divide-border-subtle/60">
            {failed.map((p) => {
              const acct = accountsById.get(p.account_id);
              const content = contentsById.get(p.content_id);
              return (
                <div key={p.id} className="px-5 py-3 flex items-center gap-4">
                  <span className="text-[10px] font-mono text-[color:var(--status-danger)] w-16 flex-shrink-0">
                    {p.retries}/4 retries
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{content?.hook ?? '—'}</p>
                    <div className="text-[10px] text-text-muted">@{acct?.handle}</div>
                  </div>
                  <span className="text-[10px] text-text-muted font-mono">
                    {p.retries >= 4 ? 'DEAD LETTER' : 'will retry'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
