import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { LinksActions } from './links-actions';
import { KPICard } from '@/components/ui/kpi-card';
import { Link as LinkIcon, MousePointerClick, Target, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function LinksPage() {
  const supabase = getSupabaseAdmin();
  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:3000';
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  const origin = `${proto}://${host}`;

  const [{ data: links }, { data: brands }, { data: offers }] = await Promise.all([
    supabase
      .from('tracking_link')
      .select(
        'id, slug, target_url, utm_source, utm_medium, utm_campaign, utm_content, clicks, conversions, brand_id, offer_id, created_at',
      )
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('brand')
      .select('id, name, slug')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('offer')
      .select('id, name, brand_id')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
  ]);

  const brandsById = new Map((brands ?? []).map((b) => [b.id, b]));
  const offersById = new Map((offers ?? []).map((o) => [o.id, o]));
  const totalClicks = (links ?? []).reduce((s, l) => s + (l.clicks ?? 0), 0);
  const totalConv = (links ?? []).reduce((s, l) => s + (l.conversions ?? 0), 0);
  const convRate = totalClicks ? ((totalConv / totalClicks) * 100).toFixed(1) : '0.0';

  const trend = Array.from({ length: 14 }, (_, i) => Math.max(0, 5 + Math.sin(i * 0.5) * 3));

  return (
    <div className="space-y-8 animate-float-in">
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1.5">
          Attribution
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Tracking Links</h1>
        <p className="text-sm text-text-muted mt-1">
          Bridge links with UTM injection. Drop{' '}
          <code className="text-text-secondary font-mono px-1 rounded bg-bg-elevated">{origin}/l/&lt;slug&gt;</code> in
          your bio or caption — clicks are forwarded to target with UTM params attached.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          label="Links created"
          value={links?.length ?? 0}
          icon={<LinkIcon size={14} />}
          sparkline={trend}
        />
        <KPICard
          label="Total clicks"
          value={totalClicks}
          icon={<MousePointerClick size={14} />}
          variant="accent"
          delta={{ value: 'last 30d', direction: 'up' }}
          sparkline={trend}
        />
        <KPICard
          label="Conversion rate"
          value={`${convRate}%`}
          icon={<Target size={14} />}
          variant="lime"
          hint={`${totalConv} conversions · PostHog wired`}
        />
      </div>

      {/* Create */}
      <div className="surface-card p-6">
        <div className="mb-4">
          <h2 className="font-semibold">Create tracking link</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Will live at <code className="font-mono text-text-secondary">{origin}/l/&lt;random-slug&gt;</code>
          </p>
        </div>
        <LinksActions
          brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))}
          offers={(offers ?? []).map((o) => ({ id: o.id, name: o.name, brand_id: o.brand_id }))}
          origin={origin}
        />
      </div>

      {/* Links table */}
      <div className="surface-card overflow-hidden">
        <div className="p-5 border-b border-border-subtle">
          <h2 className="font-semibold">All links</h2>
        </div>
        {!links || links.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-text-muted">
            <div className="font-medium text-text-secondary">No tracking links yet</div>
            <p className="text-xs mt-1 text-text-faint">Create one above to start tracking clicks.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="text-left px-5 py-3 font-medium">Short URL</th>
                  <th className="text-left px-5 py-3 font-medium">Brand / Offer</th>
                  <th className="text-left px-5 py-3 font-medium">Target</th>
                  <th className="text-left px-5 py-3 font-medium">UTM</th>
                  <th className="text-right px-5 py-3 font-medium">Clicks</th>
                  <th className="text-right px-5 py-3 font-medium">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const brand = brandsById.get(l.brand_id);
                  const offer = l.offer_id ? offersById.get(l.offer_id) : null;
                  const shortUrl = `${origin}/l/${l.slug}`;
                  return (
                    <tr key={l.id} className="border-t border-border-subtle hover:bg-bg-hover/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <a
                          href={shortUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[12px] text-[color:var(--accent)] hover:underline flex items-center gap-1"
                        >
                          /l/{l.slug} <ExternalLink size={10} />
                        </a>
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary text-[13px]">
                        {brand?.name ?? '—'}
                        {offer && <span className="text-text-faint"> · {offer.name}</span>}
                      </td>
                      <td className="px-5 py-3.5 text-text-muted text-[12px] max-w-[200px] truncate" title={l.target_url}>
                        {l.target_url}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {[l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content]
                            .filter(Boolean)
                            .map((v, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary font-mono"
                              >
                                {v}
                              </span>
                            ))}
                          {!l.utm_source && !l.utm_medium && !l.utm_campaign && (
                            <span className="text-[10px] text-text-faint">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-[13px] font-medium tabular-nums">
                        {l.clicks}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-[13px] tabular-nums text-text-muted">
                        {l.conversions}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
