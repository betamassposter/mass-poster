import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { GenerateButton } from './generate-button';
import { ChevronLeft, ExternalLink, Mic, Users, Award } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function BrandDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = getSupabaseAdmin();

  const { data: brand } = await supabase
    .from('brand')
    .select('*')
    .eq('workspace_id', CURRENT_WORKSPACE_ID)
    .eq('slug', slug)
    .single();

  if (!brand) notFound();

  const [{ data: offers }, { data: contents }] = await Promise.all([
    supabase
      .from('offer')
      .select('*')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .eq('brand_id', brand.id)
      .order('is_primary', { ascending: false }),
    supabase
      .from('content')
      .select('id, hook, caption, hashtags, status, cost_eur, generation_meta, created_at')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .eq('brand_id', brand.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const voice = brand.voice_config as {
    tone: string;
    banned_words: string[];
    signature_phrases: string[];
    vocab_pref: string[];
  };
  const personas = brand.target_personas as Array<{ name: string; role: string }>;

  return (
    <div className="space-y-8 animate-float-in">
      {/* Breadcrumb + header */}
      <div>
        <Link
          href="/brands"
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors mb-3"
        >
          <ChevronLeft size={12} />
          All brands
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div
              className="h-14 w-14 rounded-lg flex items-center justify-center font-bold text-lg text-bg-canvas flex-shrink-0"
              style={{ background: 'var(--lime)' }}
            >
              {brand.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{brand.name}</h1>
              <p className="text-sm text-text-muted mt-1 max-w-2xl">{brand.niche}</p>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-[10px] uppercase tracking-wider font-mono text-text-muted">
                  /{brand.slug}
                </span>
                <span className="text-text-faint">·</span>
                <span
                  className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full"
                  style={{
                    color: 'var(--status-success)',
                    background: 'var(--status-success-bg)',
                  }}
                >
                  {brand.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Voice + Offer side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Voice */}
        <div className="surface-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Mic size={14} className="text-text-muted" />
            <h2 className="font-semibold text-sm">Voice</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Stat label="Tone" value={voice.tone} mono />
            <Stat label="Personas" value={personas.length} />
            <Stat label="Banned words" value={voice.banned_words.length} />
            <Stat label="Signature phrases" value={voice.signature_phrases.length} />
          </div>
          {voice.vocab_pref.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-faint mb-2">
                Preferred vocab
              </div>
              <div className="flex flex-wrap gap-1">
                {voice.vocab_pref.slice(0, 8).map((w) => (
                  <span
                    key={w}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary font-mono"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Offers */}
        <div className="surface-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award size={14} className="text-text-muted" />
            <h2 className="font-semibold text-sm">
              Offers <span className="text-text-muted font-normal">({offers?.length ?? 0})</span>
            </h2>
          </div>
          <div className="space-y-3">
            {offers?.map((o) => (
              <div key={o.id} className="text-sm">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-medium">{o.name}</span>
                  {o.is_primary && (
                    <span className="text-[9px] text-[color:var(--amber)] font-medium uppercase tracking-wider">
                      ★ primary
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary line-clamp-2">{o.pitch_1_sentence}</p>
                {o.url && (
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-[color:var(--accent)] hover:underline font-mono"
                  >
                    {o.url} <ExternalLink size={9} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Personas pills */}
      {personas.length > 0 && (
        <div className="surface-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={14} className="text-text-muted" />
            <h2 className="font-semibold text-sm">Target personas</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {personas.map((p, i) => (
              <div
                key={i}
                className="surface-elevated rounded-lg px-3 py-2 flex items-center gap-2 text-sm"
              >
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded font-bold text-[10px] text-bg-canvas"
                  style={{ background: 'var(--accent)' }}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <div className="text-[12px] font-medium">{p.name}</div>
                  <div className="text-[10px] text-text-muted">{p.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate panel */}
      <div className="surface-card p-6 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-50 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 20% 50%, oklch(0.82 0.16 195 / 0.06), transparent 60%)',
          }}
        />
        <div className="relative">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="font-semibold">Generate content</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Calls the AI pipeline (Claude Sonnet 4.6 + brand voice + offer + quality gates) → persists ideas with score
              </p>
            </div>
          </div>
          <GenerateButton brandSlug={brand.slug} />
        </div>
      </div>

      {/* Content stream */}
      <div className="surface-card overflow-hidden">
        <div className="p-5 border-b border-border-subtle flex items-baseline justify-between">
          <div>
            <h2 className="font-semibold">
              Content <span className="text-text-muted font-normal">({contents?.length ?? 0})</span>
            </h2>
            <p className="text-xs text-text-muted mt-0.5">latest 20</p>
          </div>
        </div>
        {!contents || contents.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-text-muted">
            <div className="font-medium text-text-secondary">No content yet</div>
            <p className="text-xs mt-1 text-text-faint">Click Generate above.</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {contents.map((c) => {
              const meta = (c.generation_meta as Record<string, unknown>) ?? {};
              const platform = meta.platform as string | undefined;
              const score = meta.quality_score as number | undefined;
              return (
                <div key={c.id} className="px-5 py-4 hover:bg-bg-hover/30 transition-colors">
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <p className="font-medium text-[14px] line-clamp-1 flex-1">{c.hook ?? '(no hook)'}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {platform && <PlatformChip platform={platform} />}
                      <ContentStatusPill status={c.status} score={score} />
                    </div>
                  </div>
                  <p className="text-[13px] text-text-secondary line-clamp-2 mb-2">{c.caption}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {(c.hashtags as string[]).slice(0, 6).map((h) => (
                        <span
                          key={h}
                          className="text-[10px] text-text-muted font-mono"
                        >
                          {h}
                        </span>
                      ))}
                      {(c.hashtags as string[]).length > 6 && (
                        <span className="text-[10px] text-text-faint">+{(c.hashtags as string[]).length - 6}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-text-faint font-mono">
                      <span>€{Number(c.cost_eur ?? 0).toFixed(4)}</span>
                      <span>·</span>
                      <span>{new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-faint mb-1">{label}</div>
      <div className={`text-[14px] font-medium capitalize ${mono ? 'font-mono lowercase' : ''}`}>{value}</div>
    </div>
  );
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'var(--magenta)',
  tiktok: 'var(--accent)',
  youtube_shorts: 'var(--status-danger)',
  x: 'var(--text-primary)',
  linkedin: 'var(--status-info)',
};

function PlatformChip({ platform }: { platform: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-text-secondary font-medium">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: PLATFORM_COLORS[platform] ?? 'var(--text-muted)' }}
      />
      {platform.replace('_', ' ')}
    </span>
  );
}

function ContentStatusPill({ status, score }: { status: string; score?: number }) {
  const color =
    status === 'generated' ? 'var(--status-success)' :
    status === 'approved' ? 'var(--accent)' :
    status === 'published' ? 'var(--lime)' :
    status === 'rejected' ? 'var(--status-danger)' :
    'var(--text-muted)';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{ color, background: 'oklch(from ' + color + ' l c h / 0.12)' }}
    >
      {status}
      {score !== undefined && <span className="font-mono">Q{score}</span>}
    </span>
  );
}
