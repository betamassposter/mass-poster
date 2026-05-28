import { Sparkline } from './sparkline';

/**
 * KPICard — bento-style metric tile.
 * label + big number + delta + sparkline (optional).
 */

interface KPICardProps {
  label: string;
  value: string | number;
  delta?: {
    value: string;
    direction: 'up' | 'down' | 'flat';
  };
  sparkline?: number[];
  icon?: React.ReactNode;
  hint?: string;
  variant?: 'default' | 'accent' | 'lime' | 'amber';
  className?: string;
}

const DELTA_COLOR = {
  up: 'text-[color:var(--status-success)]',
  down: 'text-[color:var(--status-danger)]',
  flat: 'text-text-muted',
};

const DELTA_ICON = { up: '↑', down: '↓', flat: '→' };

const VARIANT_SPARK_COLOR = {
  default: 'var(--accent)',
  accent: 'var(--accent)',
  lime: 'var(--lime)',
  amber: 'var(--amber)',
};

const VARIANT_NUMBER_COLOR = {
  default: 'text-text-primary',
  accent: 'text-[color:var(--accent)]',
  lime: 'text-[color:var(--lime)]',
  amber: 'text-[color:var(--amber)]',
};

export function KPICard({
  label,
  value,
  delta,
  sparkline,
  icon,
  hint,
  variant = 'default',
  className = '',
}: KPICardProps) {
  return (
    <div
      className={`surface-card p-5 hover:border-border-default transition-colors group ${className}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-text-muted">{icon}</span>}
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
            {label}
          </span>
        </div>
        {delta && (
          <span className={`text-xs font-medium ${DELTA_COLOR[delta.direction]}`}>
            {DELTA_ICON[delta.direction]} {delta.value}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className={`text-3xl font-semibold tracking-tight tabular-nums ${VARIANT_NUMBER_COLOR[variant]}`}>
            {value}
          </div>
          {hint && (
            <div className="text-xs text-text-faint mt-1 truncate">{hint}</div>
          )}
        </div>
        {sparkline && sparkline.length > 1 && (
          <div className="flex-shrink-0 opacity-90 group-hover:opacity-100 transition-opacity">
            <Sparkline data={sparkline} color={VARIANT_SPARK_COLOR[variant]} width={70} height={28} />
          </div>
        )}
      </div>
    </div>
  );
}
