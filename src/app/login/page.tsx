import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; sent?: string; error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect('/');

  const { return_to, sent, error } = await searchParams;

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1fr_480px]">
      {/* Visual panel */}
      <div className="hidden lg:flex relative overflow-hidden bg-bg-elevated border-r border-border-subtle p-12 flex-col justify-between">
        <div
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: 'var(--accent)' }}
        />
        <div
          className="absolute bottom-0 right-0 h-80 w-80 rounded-full opacity-15 blur-3xl"
          style={{ background: 'var(--lime)' }}
        />

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--accent)] text-bg-canvas font-bold">
            M
            <span className="absolute inset-0 rounded-md opacity-60 blur-md -z-10" style={{ background: 'var(--accent)' }} />
          </span>
          <span className="font-semibold tracking-tight text-base">Mass Poster</span>
        </div>

        <div className="relative z-10 max-w-md">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--accent)] font-medium mb-3">
            Internal SaaS
          </p>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight mb-4">
            AI content + multi-account social posting
          </h2>
          <p className="text-text-muted text-sm leading-relaxed">
            Generate short-form video with adaptive thinking, schedule across Instagram, TikTok,
            YouTube Shorts, X, and LinkedIn. Provider-agnostic — own your distribution.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { label: 'Brands', value: 'Voice-aware' },
              { label: 'Accounts', value: 'Mobile FP' },
              { label: 'Reels', value: 'Kling 2.5' },
            ].map((b) => (
              <div
                key={b.label}
                className="surface-card p-3"
              >
                <div className="text-[10px] uppercase tracking-wider text-text-muted">{b.label}</div>
                <div className="text-sm font-medium mt-1">{b.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-text-faint font-mono">
          v0.1.0 · oblivion.group.llc
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-8 py-12 lg:px-12">
        <div className="w-full max-w-sm mx-auto">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--accent)] text-bg-canvas font-bold text-sm">
              M
            </span>
            <span className="font-semibold tracking-tight text-[15px]">Mass Poster</span>
          </div>

          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted font-medium mb-2">
            Sign in
          </p>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Welcome back</h1>
          <p className="text-sm text-text-muted mb-8">
            Sign in with your email — we&apos;ll send a magic link to your inbox.
          </p>

          {sent ? (
            <div
              className="rounded-md px-4 py-3.5 text-sm border"
              style={{
                background: 'var(--status-success-bg)',
                borderColor: 'oklch(from var(--status-success) l c h / 0.3)',
                color: 'var(--status-success)',
              }}
            >
              <div className="font-medium mb-1">Check your inbox</div>
              <div className="text-text-secondary text-xs">
                We sent a magic link to <strong className="text-text-primary">{sent}</strong>.
                Open it on this device to complete sign-in.
              </div>
            </div>
          ) : (
            <LoginForm returnTo={return_to ?? '/'} />
          )}

          {error && (
            <div
              className="mt-4 rounded-md px-4 py-3 text-xs border"
              style={{
                background: 'var(--status-danger-bg)',
                borderColor: 'oklch(from var(--status-danger) l c h / 0.3)',
                color: 'var(--status-danger)',
              }}
            >
              {decodeURIComponent(error)}
            </div>
          )}

          <p className="mt-10 text-[11px] text-text-faint leading-relaxed">
            First time? Run{' '}
            <code className="px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary font-mono">
              pnpm auth:invite your@email.com
            </code>{' '}
            to attach your user to the workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
