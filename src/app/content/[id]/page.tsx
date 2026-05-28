import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { PageHeader } from '@/components/ui/page-header';
import { Calendar, Copy, Edit3, ExternalLink, Sparkles, Trash2 } from 'lucide-react';
import { ContentActions } from './content-actions';

export const dynamic = 'force-dynamic';

const PLATFORM_COLOR: Record<string, string> = {
  instagram: 'var(--magenta)',
  tiktok: 'var(--accent)',
  youtube_shorts: 'var(--status-danger)',
  x: 'var(--text-primary)',
  linkedin: 'var(--status-info)',
};

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: content } = await supabase
    .from('content')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', CURRENT_WORKSPACE_ID)
    .maybeSingle();

  if (!content) notFound();

  const [{ data: brand }, { data: posts }] = await Promise.all([
    supabase
      .from('brand')
      .select('id, name, slug')
      .eq('id', content.brand_id)
      .single(),
    supabase
      .from('post')
      .select('id, account_id, scheduled_at, published_at, status, platform_post_url')
      .eq('content_id', content.id)
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('scheduled_at', { ascending: false }),
  ]);

  const c = content as Record<string, unknown>;
  const meta = (c.generation_meta as Record<string, unknown>) ?? {};
  const assets = (c.assets as Record<string, unknown>) ?? {};
  const platform = meta.platform as string | undefined;
  const score = meta.quality_score as number | undefined;
  const hashtags = (c.hashtags as string[]) ?? [];
  const videoUrl = assets.final_edit_url as string | undefined;
  const caption: string = (c.caption as string | null) ?? '';
  const hook: string = (c.hook as string | null) ?? '(no hook)';
  const status: string = (c.status as string) ?? 'unknown';
  const createdAt: string = (c.created_at as string) ?? '';
  const contentId: string = (c.id as string) ?? '';
  const costEur: number = Number(c.cost_eur ?? 0);

  return (
    <div className="space-y-6 animate-float-in">
      <PageHeader
        back={{ href: '/content', label: 'All content' }}
        eyebrow={brand?.name ?? 'Content'}
        title={hook}
        actions={<ContentActions contentId={contentId} status={status} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main column */}
        <div className="space-y-6 min-w-0">
          {/* Video preview */}
          {videoUrl ? (
            <div className="surface-card overflow-hidden">
              <video
                src={videoUrl}
                controls
                className="w-full aspect-[9/16] max-h-[600px] object-contain bg-bg-canvas mx-auto block"
              />
            </div>
          ) : (
            <div className="surface-card p-12 text-center">
              <Sparkles size={28} className="text-text-muted mx-auto mb-3" />
              <p className="text-sm text-text-muted">No video asset yet</p>
              <p className="text-xs text-text-faint mt-1">
                Run reel pipeline to generate video + voice + edit
              </p>
            </div>
          )}

          {/* Caption */}
          <Section title="Caption" copyValue={caption}>
            <p className="text-[14px] text-text-secondary whitespace-pre-line leading-relaxed">
              {caption.length > 0 ? caption : '(no caption)'}
            </p>
          </Section>

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <Section title="Hashtags" copyValue={hashtags.join(' ')}>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((h) => (
                  <span
                    key={h}
                    className="text-[12px] px-2 py-0.5 rounded bg-bg-elevated text-text-secondary font-mono"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Thumbnail concept */}
          {typeof assets.thumbnail_concept === 'string' && assets.thumbnail_concept.length > 0 ? (
            <Section title="Thumbnail concept">
              <p className="text-[13px] text-text-secondary italic">
                &quot;{assets.thumbnail_concept}&quot;
              </p>
            </Section>
          ) : null}

          {/* Scheduled posts */}
          <div className="surface-card">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="font-semibold text-sm">
                Scheduled posts <span className="text-text-muted font-normal">({posts?.length ?? 0})</span>
              </h2>
            </div>
            {!posts || posts.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                Not scheduled yet. Use the actions panel.
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {posts.map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Calendar size={13} className="text-text-muted flex-shrink-0" />
                      <span className="text-[12px] font-mono text-text-secondary">
                        {p.scheduled_at?.slice(0, 16).replace('T', ' ')}
                      </span>
                      <span className="text-[11px] text-text-faint font-mono">acct {p.account_id?.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.platform_post_url && (
                        <a
                          href={p.platform_post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[color:var(--accent)] hover:underline flex items-center gap-1"
                        >
                          live <ExternalLink size={10} />
                        </a>
                      )}
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Side column — metadata */}
        <div className="space-y-4">
          <div className="surface-card p-5">
            <h3 className="font-semibold text-sm mb-4">Metadata</h3>
            <dl className="space-y-2.5 text-xs">
              <Row label="Status">
                <StatusBadge status={status} />
              </Row>
              {score !== undefined && (
                <Row label="Quality score">
                  <span
                    className="font-mono font-medium"
                    style={{
                      color:
                        score >= 70
                          ? 'var(--status-success)'
                          : score >= 50
                            ? 'var(--status-warning)'
                            : 'var(--status-danger)',
                    }}
                  >
                    Q{score}
                  </span>
                </Row>
              )}
              {platform && (
                <Row label="Platform">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: PLATFORM_COLOR[platform] ?? 'var(--text-muted)' }}
                    />
                    <span className="capitalize">{platform.replace('_', ' ')}</span>
                  </span>
                </Row>
              )}
              <Row label="Brand">
                <Link
                  href={`/brands/${brand?.slug}`}
                  className="text-[color:var(--accent)] hover:underline"
                >
                  {brand?.name}
                </Link>
              </Row>
              <div className="h-px bg-border-subtle my-3" />
              <Row label="Provider">
                <span className="font-mono">{String(meta.provider ?? '—')}</span>
              </Row>
              <Row label="Model">
                <span className="font-mono">{String(meta.model ?? '—')}</span>
              </Row>
              <Row label="Tokens in/out">
                <span className="font-mono">
                  {String(meta.tokens_in ?? '—')} / {String(meta.tokens_out ?? '—')}
                </span>
              </Row>
              <Row label="Cache hits">
                <span className="font-mono">{String(meta.cache_read ?? '—')}</span>
              </Row>
              <Row label="Duration">
                <span className="font-mono">{String(meta.duration_ms ?? '—')}ms</span>
              </Row>
              <div className="h-px bg-border-subtle my-3" />
              <Row label="Cost">
                <span className="font-mono font-medium">€{costEur.toFixed(4)}</span>
              </Row>
              {meta.cta_used ? (
                <Row label="CTA used">
                  <span className="font-mono text-[11px]">{String(meta.cta_used)}</span>
                </Row>
              ) : null}
              <div className="h-px bg-border-subtle my-3" />
              <Row label="Created">
                <span className="font-mono text-[11px]">
                  {new Date(createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </Row>
              <Row label="ID">
                <code className="font-mono text-[10px] text-text-faint">{contentId.slice(0, 12)}…</code>
              </Row>
            </dl>
          </div>

          {/* Quick stats */}
          {(meta.quality_brand_voice_alignment !== undefined || meta.quality_issues_count !== undefined) && (
            <div className="surface-card p-5">
              <h3 className="font-semibold text-sm mb-3">Quality breakdown</h3>
              {meta.quality_brand_voice_alignment !== undefined && (
                <div className="mb-3">
                  <div className="flex items-baseline justify-between text-xs mb-1.5">
                    <span className="text-text-muted">Brand voice alignment</span>
                    <span className="font-mono font-medium">
                      {Math.round((meta.quality_brand_voice_alignment as number) * 100)}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-bg-hover overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(meta.quality_brand_voice_alignment as number) * 100}%`,
                        background: 'var(--accent)',
                      }}
                    />
                  </div>
                </div>
              )}
              {meta.quality_issues_count !== undefined && (
                <div className="text-xs text-text-muted">
                  {String(meta.quality_issues_count)} issues detected (gates flagged but score passed)
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-secondary text-right">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'published'
      ? 'var(--status-success)'
      : status === 'generated' || status === 'approved'
        ? 'var(--status-success)'
        : status === 'draft' || status === 'scheduled' || status === 'publishing'
          ? 'var(--status-warning)'
          : status === 'failed' || status === 'rejected'
            ? 'var(--status-danger)'
            : 'var(--text-muted)';
  return (
    <span
      className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full"
      style={{ color, background: `oklch(from ${color} l c h / 0.13)` }}
    >
      {status}
    </span>
  );
}

function Section({
  title,
  children,
  copyValue,
}: {
  title: string;
  children: React.ReactNode;
  copyValue?: string;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{title}</h3>
        {copyValue && <CopyButton value={copyValue} />}
      </div>
      {children}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  // Server component — link to client utility for now
  return (
    <button
      className="text-[10px] text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors"
      data-copy={value}
      type="button"
    >
      <Copy size={11} />
      copy
    </button>
  );
}
