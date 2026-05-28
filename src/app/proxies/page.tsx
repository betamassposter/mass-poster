import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KPICard } from '@/components/ui/kpi-card';
import { ProxyRow } from './proxy-row';
import { ProxyAllocator } from './proxy-allocator';
import { Network, Shield, CheckCircle2, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ProxiesPage() {
  const supabase = getSupabaseAdmin();

  const { data: proxies } = await supabase
    .from('proxy')
    .select(
      'id, provider, proxy_type, host, port, country, city, status, validation_status, ip_address, last_validated_at, last_validation_summary, asn, asn_org, is_residential, rotation_count, assigned_account_id, created_at',
    )
    .eq('workspace_id', CURRENT_WORKSPACE_ID)
    .order('created_at', { ascending: false });

  const rows = proxies ?? [];
  const total = rows.length;
  const clean = rows.filter((p) => p.validation_status === 'clean').length;
  const dirty = rows.filter((p) => p.validation_status === 'dirty').length;
  const pending = rows.filter((p) => p.validation_status === 'pending').length;
  const errored = rows.filter((p) => p.validation_status === 'error').length;
  const inUse = rows.filter((p) => p.status === 'in_use').length;

  return (
    <div className="space-y-8 animate-float-in">
      <PageHeader
        eyebrow="Infrastructure"
        title="Proxy pool"
        description="Mobile proxies (Multilogin) with IP reputation gating. Only `clean` proxies can be bound to new accounts."
        actions={<ProxyAllocator />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total" value={total} icon={<Network size={14} />} hint={`${inUse} in use`} />
        <KPICard
          label="Clean"
          value={clean}
          icon={<CheckCircle2 size={14} />}
          variant="lime"
          hint="passed both gates"
        />
        <KPICard
          label="Dirty"
          value={dirty}
          icon={<AlertTriangle size={14} />}
          variant="amber"
          hint="failed validation"
        />
        <KPICard
          label="Pending / error"
          value={pending + errored}
          icon={<Shield size={14} />}
          hint="awaiting check"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No proxies yet"
          description="Allocate mobile proxies from Multilogin to start farming accounts. Every proxy is automatically run through the IP reputation gate before being marked usable."
        />
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-bg-elevated/40 border-b border-border-subtle">
                <tr className="text-[10px] uppercase tracking-[0.1em] text-text-muted font-medium">
                  <th className="text-left px-5 py-3">Provider · Country</th>
                  <th className="text-left px-5 py-3">Egress IP</th>
                  <th className="text-left px-5 py-3">ASN / Org</th>
                  <th className="text-left px-5 py-3">Validation</th>
                  <th className="text-left px-5 py-3">Bound to</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {rows.map((p) => (
                  <ProxyRow
                    key={p.id}
                    proxy={{
                      id: p.id,
                      provider: p.provider,
                      proxy_type: p.proxy_type ?? 'mobile',
                      host: p.host,
                      port: p.port,
                      country: p.country,
                      city: p.city,
                      status: p.status,
                      validation_status: p.validation_status,
                      ip_address: p.ip_address as unknown as string | null,
                      last_validated_at: p.last_validated_at,
                      last_validation_summary: (p.last_validation_summary ?? null) as
                        | { clean: boolean; failure_reasons?: string[]; ip?: string | null }
                        | null,
                      asn: p.asn,
                      asn_org: p.asn_org,
                      is_residential: p.is_residential,
                      rotation_count: p.rotation_count ?? 0,
                      assigned_account_id: p.assigned_account_id,
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-faint">
        Gate sources:{' '}
        <Link
          href="https://www.zerobounce.net/ip-reputation-checker"
          target="_blank"
          className="text-[color:var(--accent)] hover:underline"
        >
          ZeroBounce IP reputation
        </Link>{' '}
        +{' '}
        <Link
          href="https://browserleaks.com/ip"
          target="_blank"
          className="text-[color:var(--accent)] hover:underline"
        >
          browserleaks.com/ip
        </Link>
        -equivalent server-side fingerprint check.
      </p>
    </div>
  );
}
