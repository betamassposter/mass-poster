import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { AccountActions } from './account-actions';
import { PhoneActions } from './phone-actions';
import { KPICard } from '@/components/ui/kpi-card';
import { AccountStatusPill } from '@/components/ui/status-pill';
import { Users, Server, ShieldCheck, AlertTriangle, ArrowUpRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PLATFORM_GLYPH: Record<string, { color: string; letter: string }> = {
  instagram: { color: 'var(--magenta)', letter: 'IG' },
  tiktok: { color: 'var(--accent)', letter: 'TT' },
  youtube_shorts: { color: 'var(--status-danger)', letter: 'YT' },
  x: { color: 'var(--text-primary)', letter: 'X' },
  linkedin: { color: 'var(--status-info)', letter: 'LI' },
  facebook: { color: 'var(--status-info)', letter: 'FB' },
};

export default async function AccountsPage() {
  const supabase = getSupabaseAdmin();

  const [{ data: accounts }, { data: proxies }, { data: brands }] = await Promise.all([
    supabase
      .from('account')
      .select(
        'id, handle, platform, status, health_score, daily_post_cap, adspower_profile_id, multilogin_profile_id, proxy_id, brand_id, warmup_started_at, activated_at, warmup_stage, created_at',
      )
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('created_at', { ascending: false }),
    supabase
      .from('proxy')
      .select('id, host, port, country, status, assigned_account_id')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('brand')
      .select('id, name, slug')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
  ]);

  const brandsById = new Map((brands ?? []).map((b) => [b.id, b]));
  const proxiesAvailable = (proxies ?? []).filter((p) => p.status === 'available').length;
  const proxiesInUse = (proxies ?? []).filter((p) => p.status === 'in_use').length;
  const proxiesDead = (proxies ?? []).filter((p) => p.status === 'dead').length;

  const accountsByStatus = (accounts ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  const burnRate = accounts?.length
    ? Math.round(((accountsByStatus.banned ?? 0) / accounts.length) * 100)
    : 0;
  const avgHealth = accounts?.length
    ? Math.round(accounts.reduce((s, a) => s + a.health_score, 0) / accounts.length)
    : 0;

  // Mock sparkline data
  const trendSpark = (base: number) =>
    Array.from({ length: 14 }, (_, i) => Math.max(0, base + Math.sin(i * 0.6) * base * 0.25));

  return (
    <div className="space-y-8 animate-float-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1.5">
            Accounts
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Account farm</h1>
          <p className="text-sm text-text-muted mt-1">
            Antidetect profiles + proxy bindings + lifecycle status across platforms
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Accounts"
          value={accounts?.length ?? 0}
          icon={<Users size={14} />}
          sparkline={trendSpark(accounts?.length ?? 5)}
          hint={Object.entries(accountsByStatus).map(([s, n]) => `${n} ${s}`).join(' · ') || '—'}
        />
        <KPICard
          label="Active · posting-ready"
          value={accountsByStatus.active ?? 0}
          icon={<ShieldCheck size={14} />}
          variant="lime"
          sparkline={trendSpark(accountsByStatus.active ?? 3)}
          hint={`${accountsByStatus.warmup ?? 0} in warmup`}
        />
        <KPICard
          label="Proxies free"
          value={proxiesAvailable}
          icon={<Server size={14} />}
          variant="accent"
          hint={`${proxiesInUse} in use · ${proxiesDead} dead`}
        />
        <KPICard
          label="Burn rate"
          value={`${burnRate}%`}
          icon={<AlertTriangle size={14} />}
          delta={{ value: 'target <30%', direction: burnRate < 30 ? 'flat' : 'up' }}
          variant={burnRate < 30 ? 'lime' : 'amber'}
          hint={`avg health ${avgHealth}`}
        />
      </div>

      {/* Create panel */}
      <div className="surface-card p-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-semibold">Create account</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Picks a free proxy + creates an antidetect browser profile (AdsPower if running, mock otherwise)
            </p>
          </div>
        </div>
        <AccountActions
          brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
          proxiesAvailable={proxiesAvailable}
        />
      </div>

      {/* Accounts table */}
      <div className="surface-card overflow-hidden">
        <div className="flex items-baseline justify-between p-5 border-b border-border-subtle">
          <div>
            <h2 className="font-semibold">All accounts</h2>
            <p className="text-xs text-text-muted mt-0.5">{accounts?.length ?? 0} total</p>
          </div>
          <Link
            href="/accounts/import"
            className="text-xs text-[color:var(--accent)] hover:underline flex items-center gap-1"
          >
            Bulk import <ArrowUpRight size={11} />
          </Link>
        </div>

        {!accounts || accounts.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-text-muted">
            <div className="font-medium text-text-secondary">No accounts yet</div>
            <p className="text-xs mt-1 text-text-faint">
              Click <strong>Create</strong> above or run{' '}
              <code className="px-1 rounded bg-bg-elevated">pnpm account:create instagram</code>
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="text-left px-5 py-3 font-medium">Account</th>
                  <th className="text-left px-5 py-3 font-medium">Brand</th>
                  <th className="text-left px-5 py-3 font-medium">Platform</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Health</th>
                  <th className="text-right px-5 py-3 font-medium">Cap</th>
                  <th className="text-left px-5 py-3 font-medium">Profile</th>
                  <th className="text-left px-5 py-3 font-medium">Proxy</th>
                  <th className="text-left px-5 py-3 font-medium">Phone</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const brand = brandsById.get(a.brand_id);
                  const platform = PLATFORM_GLYPH[a.platform] ?? { color: 'var(--text-muted)', letter: '?' };
                  return (
                    <tr
                      key={a.id}
                      className="border-t border-border-subtle hover:bg-bg-hover/40 transition-colors group"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-mono text-[10px] text-text-faint">{a.id.slice(0, 8)}</div>
                        <div className="font-medium text-[13px] mt-0.5">@{a.handle}</div>
                      </td>
                      <td className="px-5 py-3.5 text-text-secondary text-[13px]">
                        {brand?.name ?? '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex h-6 w-6 items-center justify-center rounded font-mono text-[9px] font-bold text-bg-canvas"
                            style={{ background: platform.color }}
                          >
                            {platform.letter}
                          </span>
                          <span className="text-[13px] capitalize">{a.platform.replace('_', ' ')}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <AccountStatusPill status={a.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        <HealthIndicator score={a.health_score} />
                      </td>
                      <td className="px-5 py-3.5 text-right text-text-muted font-mono text-[12px]">
                        {a.daily_post_cap}/d
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-text-muted">
                        {a.multilogin_profile_id
                          ? <span title="Multilogin Cloud Phone">{a.multilogin_profile_id.slice(0, 10)}…</span>
                          : a.adspower_profile_id
                            ? <span title="AdsPower (legacy)" className="text-text-faint">{a.adspower_profile_id.slice(0, 10)}…</span>
                            : <span className="text-text-faint">—</span>}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-text-muted">
                        {a.proxy_id ? a.proxy_id.slice(0, 8) : <span className="text-text-faint">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {a.multilogin_profile_id ? (
                          <PhoneActions profileId={a.multilogin_profile_id} handle={a.handle} />
                        ) : (
                          <span className="text-text-faint text-[11px]">—</span>
                        )}
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

function HealthIndicator({ score }: { score: number }) {
  const color = score >= 70 ? 'var(--status-success)' : score >= 40 ? 'var(--status-warning)' : 'var(--status-danger)';
  return (
    <div className="flex items-center gap-2 w-[100px]">
      <div className="flex-1 h-1 rounded-full bg-bg-hover overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[11px] font-mono tabular-nums w-7 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  );
}
