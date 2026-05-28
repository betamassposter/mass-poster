import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { ApiKeyCreator, RevokeButton } from './api-keys-actions';

export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  const supabase = getSupabaseAdmin();
  const { data: keys } = await supabase
    .from('api_key')
    .select('id, name, key_prefix, scopes, enabled, last_used_at, expires_at, created_at')
    .eq('workspace_id', CURRENT_WORKSPACE_ID)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8 animate-float-in">
      <PageHeader
        eyebrow="Developer"
        title="API Keys"
        description="Authenticate requests to /api/v1/* with bearer tokens. Use scopes (read · write · admin) for least-privilege access."
      />

      <div className="surface-elevated border border-[color:var(--status-warning)]/20 rounded-lg p-4 flex items-start gap-3">
        <ShieldAlert size={16} className="text-[color:var(--status-warning)] flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-text-secondary">
          <strong className="text-text-primary">Keys are shown once.</strong> When you create a new key, copy
          the full value immediately — only the prefix is stored after that. Lost keys must be revoked + recreated.
        </div>
      </div>

      <ApiKeyCreator />

      <div className="surface-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="font-semibold text-sm">
            Your keys <span className="text-text-muted font-normal">({keys?.length ?? 0})</span>
          </h2>
        </div>
        {!keys || keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys"
            description="Create a key to integrate Mass Poster with n8n, Zapier, or your own services."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-5 py-3 font-medium">Prefix</th>
                  <th className="text-left px-5 py-3 font-medium">Scopes</th>
                  <th className="text-left px-5 py-3 font-medium">Last used</th>
                  <th className="text-left px-5 py-3 font-medium">Created</th>
                  <th className="text-right px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-border-subtle hover:bg-bg-hover/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-[13px]">{k.name}</td>
                    <td className="px-5 py-3 font-mono text-[12px] text-text-secondary">
                      {k.key_prefix}...
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        {(k.scopes as string[]).map((s) => (
                          <span
                            key={s}
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{
                              background: s === 'admin' ? 'var(--status-danger-bg)' : 'var(--bg-elevated)',
                              color: s === 'admin' ? 'var(--status-danger)' : 'var(--text-secondary)',
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-text-muted font-mono text-[11px]">
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'never'}
                    </td>
                    <td className="px-5 py-3 text-text-muted font-mono text-[11px]">
                      {new Date(k.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className="text-[10px] uppercase tracking-wider font-medium"
                        style={{ color: k.enabled ? 'var(--status-success)' : 'var(--text-muted)' }}
                      >
                        {k.enabled ? 'active' : 'revoked'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {k.enabled && <RevokeButton keyId={k.id} keyName={k.name} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
