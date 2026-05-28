/**
 * StatusPill — semantic colored pill for account status, post status, etc.
 * Designed to be the only color-coded element in a row (so it pops).
 */

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

const VARIANT_STYLES: Record<Variant, string> = {
  success: 'bg-[color:var(--status-success-bg)] text-[color:var(--status-success)] border-[color:var(--status-success)]/20',
  warning: 'bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning)] border-[color:var(--status-warning)]/20',
  danger: 'bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger)] border-[color:var(--status-danger)]/20',
  info: 'bg-[color:var(--status-info-bg)] text-[color:var(--status-info)] border-[color:var(--status-info)]/20',
  neutral: 'bg-bg-hover text-text-secondary border-border-subtle',
  accent: 'bg-[color:var(--accent-glow)] text-[color:var(--accent)] border-[color:var(--accent)]/30',
};

export function StatusPill({
  variant = 'neutral',
  children,
  pulse = false,
  className = '',
}: {
  variant?: Variant;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full
        border text-[11px] font-medium tracking-wide
        ${VARIANT_STYLES[variant]} ${className}
      `}
    >
      {pulse && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full animate-pulse-dot"
          style={{ backgroundColor: 'currentColor' }}
        />
      )}
      {children}
    </span>
  );
}

const ACCOUNT_STATUS_MAP: Record<string, { variant: Variant; pulse: boolean }> = {
  creating: { variant: 'info', pulse: false },
  warmup: { variant: 'warning', pulse: true },
  active: { variant: 'success', pulse: true },
  shadowbanned: { variant: 'warning', pulse: false },
  banned: { variant: 'danger', pulse: false },
  retired: { variant: 'neutral', pulse: false },
};

export function AccountStatusPill({ status }: { status: string }) {
  const cfg = ACCOUNT_STATUS_MAP[status] ?? { variant: 'neutral' as Variant, pulse: false };
  return (
    <StatusPill variant={cfg.variant} pulse={cfg.pulse}>
      {status}
    </StatusPill>
  );
}

const POST_STATUS_MAP: Record<string, { variant: Variant; pulse: boolean }> = {
  scheduled: { variant: 'info', pulse: false },
  publishing: { variant: 'accent', pulse: true },
  published: { variant: 'success', pulse: false },
  failed: { variant: 'danger', pulse: false },
  retracted: { variant: 'neutral', pulse: false },
};

export function PostStatusPill({ status }: { status: string }) {
  const cfg = POST_STATUS_MAP[status] ?? { variant: 'neutral' as Variant, pulse: false };
  return (
    <StatusPill variant={cfg.variant} pulse={cfg.pulse}>
      {status}
    </StatusPill>
  );
}
