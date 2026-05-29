'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, List } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { FilterBar, FilterChip, SearchInput } from '@/components/ui/filter-bar';

interface ContentItem {
  id: string;
  hook: string | null;
  caption: string | null;
  hashtags: string[];
  status: string;
  cost_eur: number;
  brand_name: string;
  brand_slug: string;
  platform?: string;
  quality_score?: number;
  cta_used?: string;
  thumbnail_concept?: string;
  final_edit_url?: string;
  created_at: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'var(--magenta)',
  tiktok: 'var(--accent)',
  youtube_shorts: 'var(--status-danger)',
  x: 'var(--text-primary)',
  linkedin: 'var(--status-info)',
};

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'generated', label: 'Generated' },
  { id: 'draft', label: 'Draft' },
  { id: 'approved', label: 'Approved' },
  { id: 'published', label: 'Published' },
  { id: 'rejected', label: 'Rejected' },
];

export function ContentLibrary({
  items,
  brands,
  appliedFilters,
}: {
  items: ContentItem[];
  brands: { slug: string; name: string }[];
  appliedFilters: { brand?: string; platform?: string; status?: string; q?: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState(appliedFilters.q ?? '');

  const setParam = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  // Tab counts
  const counts = useMemo(() => {
    const out: Record<string, number> = { all: items.length };
    for (const item of items) {
      out[item.status] = (out[item.status] ?? 0) + 1;
    }
    return out;
  }, [items]);

  const activeTab = appliedFilters.status ?? 'all';
  const filteredItems = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        (i.hook ?? '').toLowerCase().includes(q) ||
        (i.caption ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      {/* Tabs by status */}
      <Tabs
        tabs={STATUS_TABS.map((t) => ({ ...t, count: counts[t.id] ?? 0 }))}
        active={activeTab}
        onChange={(id) => setParam('status', id === 'all' ? undefined : id)}
      />

      {/* Filter row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <FilterBar>
          <FilterChip
            label="Brand"
            value={appliedFilters.brand}
            options={brands.map((b) => ({ value: b.slug, label: b.name }))}
            onChange={(v) => setParam('brand', v)}
          />
          <FilterChip
            label="Platform"
            value={appliedFilters.platform}
            options={[
              { value: 'instagram', label: 'Instagram' },
              { value: 'tiktok', label: 'TikTok' },
              { value: 'youtube_shorts', label: 'YouTube' },
              { value: 'linkedin', label: 'LinkedIn' },
              { value: 'x', label: 'X' },
            ]}
            onChange={(v) => setParam('platform', v)}
          />
        </FilterBar>

        <div className="flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setParam('q', v || undefined);
            }}
            placeholder="Search hook or caption…"
            className="w-[240px]"
          />
          <div className="inline-flex p-0.5 rounded-md bg-bg-elevated border border-border-subtle">
            <button
              onClick={() => setView('grid')}
              className={`h-7 w-7 flex items-center justify-center rounded ${
                view === 'grid' ? 'bg-bg-card text-text-primary' : 'text-text-muted'
              }`}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setView('list')}
              className={`h-7 w-7 flex items-center justify-center rounded ${
                view === 'list' ? 'bg-bg-card text-text-primary' : 'text-text-muted'
              }`}
            >
              <List size={13} />
            </button>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="surface-card py-20 text-center">
          <p className="text-text-muted text-sm">No content matches these filters</p>
          <button
            onClick={() => {
              setSearch('');
              router.push('?');
            }}
            className="text-[color:var(--accent)] text-xs mt-2 hover:underline"
          >
            Clear all filters
          </button>
        </div>
      ) : view === 'grid' ? (
        <ContentGrid items={filteredItems} />
      ) : (
        <ContentList items={filteredItems} />
      )}
    </div>
  );
}

function ContentGrid({ items }: { items: ContentItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((item) => (
        <ContentCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function ContentCard({ item }: { item: ContentItem }) {
  const platformColor = item.platform ? PLATFORM_COLORS[item.platform] ?? 'var(--text-muted)' : null;
  return (
    <Link
      href={`/content/${item.id}`}
      className="
        surface-card overflow-hidden hover:border-[color:var(--accent)]/40
        transition-all duration-200 hover:translate-y-[-2px] group flex flex-col
      "
    >
      {/* Thumbnail / video preview */}
      <div className="aspect-[9/16] relative bg-bg-elevated overflow-hidden">
        {item.final_edit_url ? (
          <video
            src={item.final_edit_url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => e.currentTarget.pause()}
          />
        ) : (
          <div
            className="w-full h-full flex items-end p-4"
            style={{
              background: `linear-gradient(135deg, oklch(0.25 0.06 ${(item.id.charCodeAt(0) * 7) % 360}) 0%, oklch(0.15 0.04 ${(item.id.charCodeAt(1) * 13) % 360}) 100%)`,
            }}
          >
            <p className="text-[10px] text-text-muted line-clamp-3">
              {item.thumbnail_concept ?? 'No thumbnail concept'}
            </p>
          </div>
        )}
        {platformColor && (
          <span
            className="absolute top-2 left-2 inline-flex h-5 w-5 items-center justify-center rounded font-mono text-[9px] font-bold text-bg-canvas"
            style={{ background: platformColor }}
          >
            {item.platform?.slice(0, 2).toUpperCase()}
          </span>
        )}
        {item.quality_score !== undefined && (
          <span
            className="absolute top-2 right-2 px-1.5 py-0.5 rounded font-mono text-[10px] font-medium backdrop-blur-md bg-black/40"
            style={{
              color:
                item.quality_score >= 70
                  ? 'var(--status-success)'
                  : item.quality_score >= 50
                    ? 'var(--status-warning)'
                    : 'var(--status-danger)',
            }}
          >
            Q{item.quality_score}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-[11px] text-text-muted truncate">{item.brand_name}</span>
          <span
            className="text-[10px] uppercase tracking-wider font-medium"
            style={{
              color:
                item.status === 'generated'
                  ? 'var(--status-success)'
                  : item.status === 'draft'
                    ? 'var(--status-warning)'
                    : 'var(--text-muted)',
            }}
          >
            {item.status}
          </span>
        </div>
        <p className="text-[13px] font-medium line-clamp-2 leading-snug min-h-[2.4em] flex-1">
          {item.hook ?? '(no hook)'}
        </p>
        <div className="flex items-center justify-between mt-2 text-[10px] text-text-faint font-mono">
          <span>€{item.cost_eur.toFixed(4)}</span>
          <span>{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    </Link>
  );
}

function ContentList({ items }: { items: ContentItem[] }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="divide-y divide-border-subtle">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/content/${item.id}`}
            className="block px-5 py-4 hover:bg-bg-hover/40 transition-colors group"
          >
            <div className="flex items-start gap-3">
              {/* Thumbnail mini */}
              <div className="w-12 aspect-[9/16] rounded flex-shrink-0 overflow-hidden bg-bg-elevated">
                {item.final_edit_url ? (
                  <video src={item.final_edit_url} className="w-full h-full object-cover" muted />
                ) : (
                  <div
                    className="w-full h-full"
                    style={{
                      background: `linear-gradient(135deg, oklch(0.25 0.06 ${(item.id.charCodeAt(0) * 7) % 360}), oklch(0.15 0.04 ${(item.id.charCodeAt(1) * 13) % 360}))`,
                    }}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium text-[14px] line-clamp-1">{item.hook ?? '(no hook)'}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.platform && (
                      <span className="text-[10px] uppercase tracking-wider text-text-muted">
                        {item.platform.replace('_', ' ')}
                      </span>
                    )}
                    {item.quality_score !== undefined && (
                      <span
                        className="text-[10px] font-mono font-medium"
                        style={{
                          color:
                            item.quality_score >= 70
                              ? 'var(--status-success)'
                              : item.quality_score >= 50
                                ? 'var(--status-warning)'
                                : 'var(--status-danger)',
                        }}
                      >
                        Q{item.quality_score}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-text-secondary line-clamp-1 mt-0.5">{item.caption}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex items-center gap-2 text-[10px] text-text-faint font-mono">
                    <span>{item.brand_name}</span>
                    <span>·</span>
                    <span>€{item.cost_eur.toFixed(4)}</span>
                    <span>·</span>
                    <span>{new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                    View →
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
