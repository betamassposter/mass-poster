import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { KPICard } from '@/components/ui/kpi-card';
import { AccountStatusPill } from '@/components/ui/status-pill';
import {
  Users,
  Sparkles,
  Send,
  MousePointerClick,
  ArrowUpRight,
  Wallet,
  Zap,
  Plus,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = getSupabaseAdmin();

  const [
    { data: brands },
    { count: contentCount },
    { count: postCount },
    { count: accountCount },
    { data: accounts },
    { data: recentContent },
    ,
    { data: clicksData },
  ] = await Promise.all([
    supabase
      .from('brand')
      .select('id, slug, name, niche, status, default_platforms, target_personas')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('created_at', { ascending: false }),
    supabase
      .from('content')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('post')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('account')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('account')
      .select('id, handle, platform, status, health_score, brand_id')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('content')
      .select('id, hook, status, cost_eur, created_at, generation_meta')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('post')
      .select('id, status, scheduled_at, published_at, account_id, content_id')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('scheduled_at', { ascending: false })
      .limit(8),
    supabase
      .from('tracking_link')
      .select('clicks')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
  ]);

  const totalClicks = (clicksData ?? []).reduce((s, l) => s + (l.clicks ?? 0), 0);
  const activeAccounts = (accounts ?? []).filter((a) => a.status === 'active').length;
  const warmupAccounts = (accounts ?? []).filter((a) => a.status === 'warmup').length;
  const totalCost = (recentContent ?? []).reduce((s, c) => s + Number(c.cost_eur ?? 0), 0);

  // Generate sparkline data — placeholder for now (when metrics are real, plug in here)
  const fakeTrend = (seed: number, base: number) =>
    Array.from({ length: 14 }, (_, i) =>
      Math.max(0, base + Math.sin((i + seed) * 0.7) * base * 0.3 + Math.random() * base * 0.2),
    );

  return (
    <div className="space-y-8 animate-float-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1.5">
            Dashboard · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-text-muted mt-1">Engine ready · {brands?.length ?? 0} brands · {activeAccounts} active accounts</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/brands"
            className="
              inline-flex items-center gap-1.5 h-9 px-4 rounded-md
              bg-[color:var(--accent)] text-bg-canvas text-sm font-medium
              hover:bg-[color:var(--accent-strong)] transition-colors
              shadow-[0_0_0_1px_oklch(0.82_0.16_195/0.3),0_4px_24px_oklch(0.82_0.16_195/0.25)]
            "
          >
            <Sparkles size={14} />
            Generate content
          </Link>
        </div>
      </div>

      {/* KPI bento — 4 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Active accounts"
          value={activeAccounts}
          icon={<Users size={14} />}
          delta={{ value: `${warmupAccounts} warming`, direction: 'flat' }}
          sparkline={fakeTrend(1, activeAccounts || 5)}
          hint={`of ${accountCount ?? 0} total · ${(accounts ?? []).filter((a) => a.status === 'banned').length} banned`}
        />
        <KPICard
          label="Content generated"
          value={contentCount ?? 0}
          icon={<Sparkles size={14} />}
          delta={{ value: '+24%', direction: 'up' }}
          sparkline={fakeTrend(2, (contentCount ?? 0) || 5)}
          variant="accent"
        />
        <KPICard
          label="Posts published"
          value={postCount ?? 0}
          icon={<Send size={14} />}
          delta={{ value: '0 dead-letter', direction: 'flat' }}
          sparkline={fakeTrend(3, (postCount ?? 0) || 3)}
          variant="lime"
        />
        <KPICard
          label="Total link clicks"
          value={totalClicks}
          icon={<MousePointerClick size={14} />}
          delta={{ value: 'tracking on', direction: 'up' }}
          sparkline={fakeTrend(4, totalClicks || 8)}
          variant="amber"
        />
      </div>

      {/* Main bento grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Brand list — wide card */}
        <div className="col-span-12 lg:col-span-8 surface-card p-6">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <h2 className="font-semibold">Brands</h2>
              <p className="text-xs text-text-muted mt-0.5">Creative units — each has its own voice, personas, accounts</p>
            </div>
            <Link href="/brands" className="text-xs text-[color:var(--accent)] hover:underline flex items-center gap-1">
              View all <ArrowUpRight size={11} />
            </Link>
          </div>
          {!brands || brands.length === 0 ? (
            <EmptyState
              title="No brands yet"
              hint="Run `pnpm brand:seed` to create the Maplo demo brand."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {brands.map((b) => (
                <Link
                  key={b.id}
                  href={`/brands/${b.slug}`}
                  className="
                    group surface-elevated rounded-lg p-4
                    border border-border-subtle hover:border-[color:var(--accent)]/40
                    transition-all duration-200 hover:translate-y-[-1px]
                  "
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="h-9 w-9 rounded-md flex items-center justify-center font-bold text-sm text-bg-canvas"
                        style={{ background: 'var(--lime)' }}
                      >
                        {b.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-[14px] truncate">{b.name}</div>
                        <div className="text-[11px] text-text-muted font-mono">{b.slug}</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">
                      {b.status}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-2 mb-3">
                    {b.niche || 'No niche set'}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-text-muted">
                    <div className="flex gap-1">
                      {(b.default_platforms as string[]).slice(0, 4).map((p) => (
                        <span key={p} className="px-1.5 py-0.5 rounded bg-bg-hover text-text-secondary lowercase">
                          {p.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                    <span className="font-mono">{(b.target_personas as unknown[]).length} personas</span>
                  </div>
                </Link>
              ))}
              <Link
                href="/brands/new"
                className="
                  surface-elevated rounded-lg p-4 border border-dashed border-border-default
                  flex flex-col items-center justify-center gap-2 text-text-muted
                  hover:border-[color:var(--accent)]/50 hover:text-[color:var(--accent)]
                  transition-all min-h-[140px]
                "
              >
                <Plus size={20} />
                <span className="text-xs font-medium">New brand</span>
              </Link>
            </div>
          )}
        </div>

        {/* Side column — costs + system status */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          {/* Cost tile */}
          <div className="surface-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wallet size={14} className="text-text-muted" />
                <span className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium">
                  Cost this month
                </span>
              </div>
              <span className="text-[10px] text-text-muted">€250 cap</span>
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              €{totalCost.toFixed(4)}
            </div>
            <div className="mt-3 h-1 rounded-full bg-bg-hover overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (totalCost / 250) * 100)}%`,
                  background: 'linear-gradient(90deg, var(--accent), var(--lime))',
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-text-muted">€{(250 - totalCost).toFixed(2)} remaining</span>
              <span className="text-[color:var(--status-success)] font-medium">healthy</span>
            </div>
          </div>

          {/* Provider status */}
          <div className="surface-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-text-muted" />
                <span className="text-[11px] uppercase tracking-[0.08em] text-text-muted font-medium">
                  System
                </span>
              </div>
              <span className="text-[10px] text-[color:var(--status-success)]">all systems normal</span>
            </div>
            <div className="space-y-2 text-xs">
              <SystemRow name="Claude" detail="claude-sonnet-4-6" status="up" />
              <SystemRow name="ElevenLabs" detail="turbo-v2.5 · LIVE" status="up" />
              <SystemRow name="FAL Video" detail="kling 2.5 turbo" status="degraded" />
              <SystemRow name="Supabase" detail="eu-central-1" status="up" />
              <SystemRow name="AdsPower" detail="local API" status="warn" />
            </div>
          </div>
        </div>

        {/* Recent content */}
        <div className="col-span-12 lg:col-span-7 surface-card p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-semibold">Recent content</h2>
            <Link href="/content" className="text-xs text-[color:var(--accent)] hover:underline flex items-center gap-1">
              View all <ArrowUpRight size={11} />
            </Link>
          </div>
          {!recentContent || recentContent.length === 0 ? (
            <EmptyState title="No content yet" hint="Generate from a brand page" />
          ) : (
            <div className="space-y-2">
              {recentContent.map((c) => {
                const meta = (c.generation_meta as Record<string, unknown>) ?? {};
                const score = meta.quality_score as number | undefined;
                return (
                  <div
                    key={c.id}
                    className="
                      group flex items-center gap-3 p-2.5 -mx-2 rounded-md
                      hover:bg-bg-hover/50 transition-colors cursor-pointer
                    "
                  >
                    <div
                      className="h-8 w-8 rounded flex-shrink-0 flex items-center justify-center font-mono text-[10px] text-text-muted"
                      style={{ background: 'var(--bg-elevated)' }}
                    >
                      {c.id.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{c.hook ?? '(no hook)'}</div>
                      <div className="text-[11px] text-text-muted flex items-center gap-2 mt-0.5">
                        <span>{String(meta.platform ?? '—')}</span>
                        <span>·</span>
                        <span className="font-mono">€{Number(c.cost_eur ?? 0).toFixed(4)}</span>
                        {score !== undefined && (
                          <>
                            <span>·</span>
                            <QualityBadge score={score} />
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-text-faint font-mono">
                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Account health */}
        <div className="col-span-12 lg:col-span-5 surface-card p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-semibold">Account health</h2>
            <Link href="/accounts" className="text-xs text-[color:var(--accent)] hover:underline flex items-center gap-1">
              View all <ArrowUpRight size={11} />
            </Link>
          </div>
          {!accounts || accounts.length === 0 ? (
            <EmptyState title="No accounts" hint="Create one with `pnpm account:create instagram`" />
          ) : (
            <div className="space-y-2">
              {accounts.slice(0, 6).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 p-2 -mx-2 rounded-md hover:bg-bg-hover/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <PlatformIcon platform={a.platform} />
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium truncate">@{a.handle}</div>
                      <div className="text-[10px] text-text-muted">{a.platform.replace('_', ' ')}</div>
                    </div>
                  </div>
                  <HealthBar score={a.health_score} />
                  <AccountStatusPill status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 70 ? 'var(--status-success)' : score >= 40 ? 'var(--status-warning)' : 'var(--status-danger)';
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1 rounded-full bg-bg-hover overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono text-text-muted w-6 text-right">{score}</span>
    </div>
  );
}

function QualityBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'var(--status-success)' : score >= 50 ? 'var(--status-warning)' : 'var(--status-danger)';
  return (
    <span className="font-mono" style={{ color }}>
      Q{score}
    </span>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="py-10 text-center text-sm text-text-muted">
      <p className="font-medium text-text-secondary">{title}</p>
      <p className="text-xs mt-1 text-text-faint">{hint}</p>
    </div>
  );
}

function SystemRow({ name, detail, status }: { name: string; detail: string; status: 'up' | 'degraded' | 'warn' | 'down' }) {
  const cfg = {
    up: { color: 'var(--status-success)', label: 'up' },
    degraded: { color: 'var(--status-warning)', label: 'low balance' },
    warn: { color: 'var(--status-warning)', label: 'offline' },
    down: { color: 'var(--status-danger)', label: 'down' },
  }[status];
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
      <span className="font-medium text-text-secondary flex-shrink-0">{name}</span>
      <span className="text-text-faint font-mono text-[10px] truncate flex-1">{detail}</span>
      <span style={{ color: cfg.color }} className="text-[10px] font-medium">
        {cfg.label}
      </span>
    </div>
  );
}

const PLATFORM_GLYPH: Record<string, { color: string; letter: string }> = {
  instagram: { color: 'var(--magenta)', letter: 'IG' },
  tiktok: { color: 'var(--accent)', letter: 'TT' },
  youtube_shorts: { color: 'var(--status-danger)', letter: 'YT' },
  x: { color: 'var(--text-primary)', letter: 'X' },
  linkedin: { color: 'var(--status-info)', letter: 'LI' },
  facebook: { color: 'var(--status-info)', letter: 'FB' },
};

function PlatformIcon({ platform }: { platform: string }) {
  const cfg = PLATFORM_GLYPH[platform] ?? { color: 'var(--text-muted)', letter: '?' };
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded font-mono text-[9px] font-bold text-bg-canvas flex-shrink-0"
      style={{ background: cfg.color }}
    >
      {cfg.letter}
    </span>
  );
}
