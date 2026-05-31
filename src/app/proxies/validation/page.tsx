import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KPICard } from '@/components/ui/kpi-card';
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldOff, Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface ProviderResult {
  provider: string;
  clean: boolean;
  score?: number;
  signals?: {
    notes?: string[];
    geo_country?: string;
    geo_matches_target?: boolean;
    asn_org?: string;
    fraud_score?: number;
    blacklisted_on?: string[];
  };
  checked_at?: string;
}

interface ValidationRow {
  id: string;
  proxy_id: string;
  verdict: string;
  ip_address: string | null;
  results: ProviderResult[];
  reason: string;
  duration_ms: number | null;
  checked_at: string;
  proxy: {
    host: string;
    country: string | null;
  } | null;
}

export default async function ValidationHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ proxy?: string; reason?: string; verdict?: string }>;
}) {
  const params = await searchParams;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('proxy_validation_check')
    .select(
      'id, proxy_id, verdict, ip_address, results, reason, duration_ms, checked_at, proxy(host, country)',
    )
    .eq('workspace_id', CURRENT_WORKSPACE_ID)
    .order('checked_at', { ascending: false })
    .limit(200);

  if (params.proxy) query = query.eq('proxy_id', params.proxy);
  if (params.reason) query = query.eq('reason', params.reason);
  if (params.verdict) query = query.eq('verdict', params.verdict);

  const { data } = await query;
  const rows = (data ?? []) as unknown as ValidationRow[];

  const total = rows.length;
  const cleanCount = rows.filter((r) => r.verdict === 'clean').length;
  const dirtyCount = rows.filter((r) => r.verdict === 'dirty').length;
  const errorCount = rows.filter((r) => r.verdict === 'error').length;
  const avgDuration = total > 0
    ? Math.round(rows.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0) / total)
    : 0;

  // Aggregate failure reasons across all dirty/error rows for pattern surfacing
  const failurePatterns = new Map<string, number>();
  for (const r of rows) {
    if (r.verdict === 'clean') continue;
    for (const res of r.results ?? []) {
      for (const note of res.signals?.notes ?? []) {
        failurePatterns.set(note, (failurePatterns.get(note) ?? 0) + 1);
      }
    }
  }
  const topPatterns = Array.from(failurePatterns.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-8 animate-float-in">
      <div className="flex items-center gap-3 text-[11px] text-text-muted">
        <Link href="/proxies" className="flex items-center gap-1 hover:text-text-secondary">
          <ArrowLeft size={12} /> Proxies
        </Link>
        <span>/</span>
        <span className="text-text-secondary">Validation history</span>
      </div>

      <PageHeader
        eyebrow="Infrastructure · Debug"
        title="Proxy validation history"
        description="Every IP reputation check the gate has run (AbuseIPDB + browserleaks). Filter by proxy, reason, or verdict — useful to surface patterns like 'all IT proxies failing geo' or 'AbuseIPDB returning Tor flag often'."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Last 200 checks" value={total} icon={<Activity size={14} />} hint={`avg ${avgDuration}ms`} />
        <KPICard label="Clean" value={cleanCount} icon={<ShieldCheck size={14} />} variant="lime" />
        <KPICard label="Dirty" value={dirtyCount} icon={<ShieldAlert size={14} />} variant="amber" />
        <KPICard label="Error" value={errorCount} icon={<ShieldOff size={14} />} variant="amber" />
      </div>

      {topPatterns.length > 0 && (
        <div className="surface-card p-5">
          <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted mb-3">
            Top failure patterns
          </div>
          <ul className="space-y-1.5 text-[13px]">
            {topPatterns.map(([reason, count]) => (
              <li key={reason} className="flex justify-between gap-4">
                <span className="text-text-secondary">{reason}</span>
                <span className="font-mono text-text-muted">{count}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 text-[11px]">
        <FilterPill href="/proxies/validation" active={!params.verdict} label="All" />
        <FilterPill href="/proxies/validation?verdict=clean" active={params.verdict === 'clean'} label="Clean" />
        <FilterPill href="/proxies/validation?verdict=dirty" active={params.verdict === 'dirty'} label="Dirty" />
        <FilterPill href="/proxies/validation?verdict=error" active={params.verdict === 'error'} label="Error" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No validation checks yet"
          description="Allocate a proxy on the Proxies page to see the gate run for the first time."
        />
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-bg-elevated/40 border-b border-border-subtle">
                <tr className="text-[10px] uppercase tracking-[0.1em] text-text-muted font-medium">
                  <th className="text-left px-5 py-3">When</th>
                  <th className="text-left px-5 py-3">Proxy · IP</th>
                  <th className="text-left px-5 py-3">Verdict</th>
                  <th className="text-left px-5 py-3">Reason</th>
                  <th className="text-left px-5 py-3">Signals</th>
                  <th className="text-right px-5 py-3">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {rows.map((r) => {
                  const reasons: string[] = [];
                  for (const res of r.results ?? []) {
                    for (const note of res.signals?.notes ?? []) reasons.push(`[${res.provider}] ${note}`);
                  }
                  return (
                    <tr key={r.id} className="hover:bg-bg-elevated/20">
                      <td className="px-5 py-3 font-mono text-[12px] text-text-muted">
                        {new Date(r.checked_at).toLocaleString('it-IT', { hour12: false })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-[12px]">{r.proxy?.host ?? '—'}</div>
                        <div className="font-mono text-[11px] text-text-muted">{r.ip_address ?? '—'}</div>
                      </td>
                      <td className="px-5 py-3">
                        <VerdictBadge verdict={r.verdict} />
                      </td>
                      <td className="px-5 py-3 text-[12px] text-text-muted">{r.reason}</td>
                      <td className="px-5 py-3 text-[11px] text-text-muted max-w-[400px]">
                        {reasons.length === 0 ? (
                          <span className="text-emerald-400/70">— no flags</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {reasons.slice(0, 3).map((n, i) => (
                              <li key={i}>· {n}</li>
                            ))}
                            {reasons.length > 3 && <li className="text-text-faint">+ {reasons.length - 3} more</li>}
                          </ul>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[11px] text-text-muted">
                        {r.duration_ms ?? '—'}ms
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    clean: { bg: 'bg-emerald-500/15', fg: 'text-emerald-400', label: 'clean' },
    dirty: { bg: 'bg-amber-500/15', fg: 'text-amber-400', label: 'dirty' },
    error: { bg: 'bg-rose-500/15', fg: 'text-rose-400', label: 'error' },
    pending: { bg: 'bg-slate-500/15', fg: 'text-slate-400', label: 'pending' },
  };
  const s = (map[verdict] ?? map.pending)!;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium ${s.bg} ${s.fg}`}>
      {s.label}
    </span>
  );
}

function FilterPill({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'px-3 py-1 rounded-full bg-bg-elevated border border-border-strong text-text-primary'
          : 'px-3 py-1 rounded-full border border-border-subtle text-text-muted hover:text-text-secondary hover:border-border-strong'
      }
    >
      {label}
    </Link>
  );
}
