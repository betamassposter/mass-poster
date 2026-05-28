'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { CheckCircle2, AlertTriangle, Loader2, RotateCw, ShieldCheck, Trash2 } from 'lucide-react';

interface ProxyRowProps {
  proxy: {
    id: string;
    provider: string;
    proxy_type: string;
    host: string;
    port: number;
    country: string | null;
    city: string | null;
    status: string;
    validation_status: string;
    ip_address: string | null;
    last_validated_at: string | null;
    last_validation_summary: {
      clean: boolean;
      failure_reasons?: string[];
      ip?: string | null;
    } | null;
    asn: number | null;
    asn_org: string | null;
    is_residential: boolean | null;
    rotation_count: number;
    assigned_account_id: string | null;
  };
}

export function ProxyRow({ proxy }: ProxyRowProps) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<'validate' | 'rotate' | 'release' | null>(null);
  const [, startTransition] = useTransition();

  const action = (
    op: 'validate' | 'rotate' | 'release',
    url: string,
    successMsg: string,
  ) => {
    setBusy(op);
    startTransition(async () => {
      try {
        const res = await fetch(url, { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        toast.success(successMsg, json.ip ?? json.verdict ?? '');
        router.refresh();
      } catch (e) {
        toast.error('Action failed', (e as Error).message);
      } finally {
        setBusy(null);
      }
    });
  };

  const failures = proxy.last_validation_summary?.failure_reasons ?? [];

  return (
    <tr className="hover:bg-bg-hover/30 transition-colors">
      <td className="px-5 py-3">
        <div className="flex flex-col">
          <span className="text-[12px] font-medium">
            {proxy.provider}
            <span className="ml-1.5 text-text-faint font-mono">{proxy.proxy_type}</span>
          </span>
          <span className="text-[11px] text-text-muted">
            {(proxy.country ?? '??')} · {proxy.city ?? '—'}
          </span>
          <span className="text-[10px] text-text-faint font-mono mt-0.5">
            {proxy.host}:{proxy.port}
          </span>
        </div>
      </td>

      <td className="px-5 py-3 font-mono text-[12px]">
        {proxy.ip_address ?? <span className="text-text-faint">—</span>}
        {proxy.rotation_count > 0 && (
          <div className="text-[10px] text-text-muted mt-0.5">
            rotated ×{proxy.rotation_count}
          </div>
        )}
      </td>

      <td className="px-5 py-3 text-[11px]">
        {proxy.asn_org ? (
          <div>
            <div className="text-text-secondary">{proxy.asn_org}</div>
            <div className="text-text-faint mt-0.5">
              {proxy.asn ? `AS${proxy.asn} · ` : ''}
              {proxy.is_residential === true
                ? 'residential'
                : proxy.is_residential === false
                  ? <span style={{ color: 'var(--status-danger)' }}>datacenter</span>
                  : 'unknown'}
            </div>
          </div>
        ) : (
          <span className="text-text-faint">—</span>
        )}
      </td>

      <td className="px-5 py-3">
        <ValidationBadge status={proxy.validation_status} />
        {proxy.last_validated_at && (
          <div className="text-[10px] text-text-muted mt-0.5">
            {relativeTime(proxy.last_validated_at)}
          </div>
        )}
        {failures.length > 0 && (
          <details className="mt-1">
            <summary className="text-[10px] text-[color:var(--status-danger)] cursor-pointer">
              {failures.length} reason{failures.length > 1 ? 's' : ''}
            </summary>
            <ul className="text-[10px] text-text-muted mt-1 space-y-0.5">
              {failures.slice(0, 4).map((f, i) => (
                <li key={i} className="leading-snug">
                  · {f}
                </li>
              ))}
            </ul>
          </details>
        )}
      </td>

      <td className="px-5 py-3 text-[11px] font-mono text-text-muted">
        {proxy.assigned_account_id
          ? proxy.assigned_account_id.slice(0, 10) + '…'
          : <span className="text-text-faint">—</span>}
      </td>

      <td className="px-5 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            onClick={() =>
              action('validate', `/api/proxy/${proxy.id}/validate`, 'Validation complete')
            }
            disabled={busy !== null}
            className="
              inline-flex items-center gap-1 px-2 h-7 rounded-md
              text-[11px] text-text-secondary hover:text-text-primary
              hover:bg-bg-hover transition-colors disabled:opacity-50
            "
            title="Re-run reputation gate"
          >
            {busy === 'validate' ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
            Validate
          </button>
          <button
            onClick={() => action('rotate', `/api/proxy/${proxy.id}/rotate`, 'IP rotated')}
            disabled={busy !== null}
            className="
              inline-flex items-center gap-1 px-2 h-7 rounded-md
              text-[11px] text-text-secondary hover:text-text-primary
              hover:bg-bg-hover transition-colors disabled:opacity-50
            "
            title="Force new IP on this proxy session"
          >
            {busy === 'rotate' ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />}
            Rotate
          </button>
          <button
            onClick={() => {
              if (!confirm('Release this proxy? It will be returned to the vendor.')) return;
              action('release', `/api/proxy/${proxy.id}/release`, 'Released');
            }}
            disabled={busy !== null || proxy.status === 'in_use'}
            className="
              inline-flex items-center gap-1 px-2 h-7 rounded-md
              text-[11px] text-text-muted hover:text-[color:var(--status-danger)]
              hover:bg-bg-hover transition-colors disabled:opacity-30
            "
            title={proxy.status === 'in_use' ? 'Unbind account first' : 'Release back to vendor'}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ValidationBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
  > = {
    clean: {
      label: 'Clean',
      color: 'var(--status-success)',
      bg: 'var(--status-success-bg)',
      icon: CheckCircle2,
    },
    dirty: {
      label: 'Dirty',
      color: 'var(--status-danger)',
      bg: 'var(--status-danger-bg)',
      icon: AlertTriangle,
    },
    pending: {
      label: 'Pending',
      color: 'var(--text-muted)',
      bg: 'var(--bg-hover)',
      icon: Loader2,
    },
    validating: {
      label: 'Checking…',
      color: 'var(--accent)',
      bg: 'var(--accent-glow)',
      icon: Loader2,
    },
    error: {
      label: 'Error',
      color: 'var(--status-warning)',
      bg: 'var(--status-warning-bg)',
      icon: AlertTriangle,
    },
  };
  const c = config[status] ?? config.pending;
  const Icon = c.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider"
      style={{ color: c.color, background: c.bg }}
    >
      <Icon size={10} className={status === 'validating' ? 'animate-spin' : ''} />
      {c.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
