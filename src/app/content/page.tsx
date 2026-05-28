import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { PageHeader } from '@/components/ui/page-header';
import { KPICard } from '@/components/ui/kpi-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ContentLibrary } from './content-library';
import { FileText, Sparkles, CheckCircle2, ClockIcon } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; platform?: string; status?: string; q?: string }>;
}) {
  const { brand, platform, status, q } = await searchParams;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('content')
    .select(
      'id, brand_id, hook, caption, hashtags, status, cost_eur, generation_meta, assets, created_at',
    )
    .eq('workspace_id', CURRENT_WORKSPACE_ID)
    .order('created_at', { ascending: false })
    .limit(100);

  if (status) query = query.eq('status', status);

  const [{ data: contents }, { data: brands }, { count: total }] = await Promise.all([
    query,
    supabase
      .from('brand')
      .select('id, name, slug')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('content')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
  ]);

  const brandsById = new Map((brands ?? []).map((b) => [b.id, b]));

  // Apply client-side filters (brand, platform from meta, search query)
  let filtered = contents ?? [];
  if (brand) {
    const brandRow = brands?.find((b) => b.slug === brand);
    if (brandRow) filtered = filtered.filter((c) => c.brand_id === brandRow.id);
  }
  if (platform) {
    filtered = filtered.filter((c) => {
      const meta = (c.generation_meta as Record<string, unknown>) ?? {};
      return meta.platform === platform;
    });
  }
  if (q) {
    const qq = q.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        (c.hook ?? '').toLowerCase().includes(qq) ||
        (c.caption ?? '').toLowerCase().includes(qq),
    );
  }

  const stats = (contents ?? []).reduce(
    (acc, c) => {
      acc.total++;
      acc.totalCost += Number(c.cost_eur ?? 0);
      const s = c.status;
      acc.byStatus[s] = (acc.byStatus[s] ?? 0) + 1;
      return acc;
    },
    { total: 0, totalCost: 0, byStatus: {} as Record<string, number> },
  );

  return (
    <div className="space-y-8 animate-float-in">
      <PageHeader
        eyebrow="Content library"
        title="Content"
        description="All generated ideas across brands. Filter, review, approve, and schedule."
        actions={
          <>
            <Link
              href="/brands"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-bg-hover border border-border-default text-text-primary text-sm font-medium hover:bg-bg-active transition-colors"
            >
              Generate from brand
            </Link>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total" value={total ?? 0} icon={<FileText size={14} />} />
        <KPICard
          label="Generated"
          value={stats.byStatus.generated ?? 0}
          icon={<Sparkles size={14} />}
          variant="accent"
          hint="ready to schedule"
        />
        <KPICard
          label="Drafts"
          value={stats.byStatus.draft ?? 0}
          icon={<ClockIcon size={14} />}
          variant="amber"
          hint="quality 50-69, needs review"
        />
        <KPICard
          label="Approved"
          value={stats.byStatus.approved ?? 0}
          icon={<CheckCircle2 size={14} />}
          variant="lime"
        />
      </div>

      {/* Library */}
      <ContentLibrary
        items={filtered.map((c) => ({
          id: c.id,
          hook: c.hook,
          caption: c.caption,
          hashtags: (c.hashtags as string[]) ?? [],
          status: c.status,
          cost_eur: Number(c.cost_eur ?? 0),
          brand_name: brandsById.get(c.brand_id)?.name ?? '—',
          brand_slug: brandsById.get(c.brand_id)?.slug ?? '',
          platform: (c.generation_meta as Record<string, unknown>)?.platform as string | undefined,
          quality_score: (c.generation_meta as Record<string, unknown>)?.quality_score as
            | number
            | undefined,
          cta_used: (c.generation_meta as Record<string, unknown>)?.cta_used as string | undefined,
          thumbnail_concept: (c.assets as Record<string, unknown>)?.thumbnail_concept as
            | string
            | undefined,
          final_edit_url: (c.assets as Record<string, unknown>)?.final_edit_url as string | undefined,
          created_at: c.created_at,
        }))}
        brands={(brands ?? []).map((b) => ({ slug: b.slug, name: b.name }))}
        appliedFilters={{ brand, platform, status, q }}
      />

      {stats.total === 0 && (
        <EmptyState
          icon={Sparkles}
          title="No content yet"
          description="Open a brand and click Generate to create your first ideas. They'll show up here with quality scores and ready-to-schedule actions."
          cta={{ label: 'Open brands', href: '/brands', variant: 'accent' }}
        />
      )}
    </div>
  );
}
