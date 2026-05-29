import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { Plus, Sparkles, ArrowUpRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function BrandsPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: brands }, { data: contentCounts }] = await Promise.all([
    supabase
      .from('brand')
      .select('id, slug, name, niche, status, default_platforms, target_personas, created_at')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('created_at', { ascending: false }),
    supabase
      .from('content')
      .select('brand_id')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
  ]);

  const countsByBrand = new Map<string, number>();
  for (const c of contentCounts ?? []) {
    countsByBrand.set(c.brand_id, (countsByBrand.get(c.brand_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-8 animate-float-in">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1.5">
            Brands
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Creative units</h1>
          <p className="text-sm text-text-muted mt-1">
            Each brand has its own voice, personas, accounts, and content stream
          </p>
        </div>
        <Link
          href="/brands/new"
          className="
            inline-flex items-center gap-1.5 h-9 px-4 rounded-md
            bg-[color:var(--accent)] text-bg-canvas text-sm font-medium
            hover:bg-[color:var(--accent-strong)] transition-colors
            shadow-[0_0_0_1px_oklch(0.82_0.16_195/0.3),0_4px_24px_oklch(0.82_0.16_195/0.25)]
          "
        >
          <Plus size={14} />
          New brand
        </Link>
      </div>

      {!brands || brands.length === 0 ? (
        <div className="surface-card p-16 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[color:var(--accent-glow)] mb-4">
            <Sparkles size={20} className="text-[color:var(--accent)]" />
          </div>
          <h2 className="text-lg font-semibold">No brands yet</h2>
          <p className="text-sm text-text-muted mt-2 max-w-md mx-auto">
            Brands define <strong>voice</strong>, <strong>target personas</strong>, and the <strong>offer</strong> you&apos;re promoting.
            Run <code className="font-mono px-1.5 py-0.5 rounded bg-bg-elevated">pnpm brand:seed</code> to create the Maplo demo brand.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {brands.map((b) => {
            const platforms = b.default_platforms as string[];
            const personas = b.target_personas as unknown[];
            const contentCount = countsByBrand.get(b.id) ?? 0;
            return (
              <Link
                key={b.id}
                href={`/brands/${b.slug}`}
                className="
                  surface-card p-5 hover:border-[color:var(--accent)]/40
                  transition-all duration-200 hover:translate-y-[-2px] group
                "
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-11 w-11 rounded-lg flex items-center justify-center font-bold text-base text-bg-canvas"
                      style={{ background: 'var(--lime)' }}
                    >
                      {b.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[15px]">{b.name}</div>
                      <div className="text-[11px] text-text-muted font-mono">/{b.slug}</div>
                    </div>
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full border"
                    style={{
                      color:
                        b.status === 'active'
                          ? 'var(--status-success)'
                          : 'var(--text-muted)',
                      background:
                        b.status === 'active'
                          ? 'var(--status-success-bg)'
                          : 'var(--bg-hover)',
                      borderColor:
                        b.status === 'active'
                          ? 'oklch(0.74 0.16 145 / 0.2)'
                          : 'var(--border-subtle)',
                    }}
                  >
                    {b.status}
                  </span>
                </div>
                <p className="text-xs text-text-secondary line-clamp-2 mb-4 min-h-[2.5em]">
                  {b.niche || 'No niche set'}
                </p>
                <div className="flex flex-wrap gap-1 mb-4">
                  {platforms.slice(0, 5).map((p) => (
                    <span
                      key={p}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary lowercase"
                    >
                      {p.replace('_', ' ')}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
                  <div className="text-[11px] text-text-muted flex gap-3">
                    <span><span className="font-mono">{personas.length}</span> personas</span>
                    <span><span className="font-mono">{contentCount}</span> content</span>
                  </div>
                  <span className="text-[11px] text-[color:var(--accent)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Open <ArrowUpRight size={11} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
