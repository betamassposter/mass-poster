import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { AccountActions } from './account-actions';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  creating: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  warmup: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  shadowbanned: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  banned: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  retired: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸',
  tiktok: '🎵',
  youtube_shorts: '▶️',
  x: '𝕏',
  linkedin: '💼',
  facebook: 'f',
};

export default async function AccountsPage() {
  const supabase = getSupabaseAdmin();

  const [{ data: accounts }, { data: proxies }, { data: brands }] = await Promise.all([
    supabase
      .from('account')
      .select('id, handle, platform, status, health_score, daily_post_cap, adspower_profile_id, proxy_id, brand_id, warmup_started_at, activated_at, created_at')
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

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Home
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Accounts</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Social account farm — antidetect profiles + proxy bindings + lifecycle status.
        </p>
      </div>

      {/* Status strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Accounts</div>
          <div className="mt-1 text-2xl font-semibold">{accounts?.length ?? 0}</div>
          <div className="mt-1 text-xs text-zinc-500">
            {Object.entries(accountsByStatus)
              .map(([s, n]) => `${n} ${s}`)
              .join(' · ') || '—'}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Proxies free</div>
          <div className="mt-1 text-2xl font-semibold">{proxiesAvailable}</div>
          <div className="mt-1 text-xs text-zinc-500">{proxiesInUse} in use · {proxiesDead} dead</div>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Active</div>
          <div className="mt-1 text-2xl font-semibold text-green-700 dark:text-green-400">
            {accountsByStatus.active ?? 0}
          </div>
          <div className="mt-1 text-xs text-zinc-500">posting-ready</div>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Burn rate</div>
          <div className="mt-1 text-2xl font-semibold">
            {accounts?.length
              ? Math.round(
                  ((accountsByStatus.banned ?? 0) / accounts.length) * 100,
                )
              : 0}
            %
          </div>
          <div className="mt-1 text-xs text-zinc-500">target &lt; 30%</div>
        </div>
      </section>

      {/* Actions */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="font-semibold mb-3">Create account</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Picks a free proxy + creates an antidetect browser profile (AdsPower if running, mock otherwise).
        </p>
        <AccountActions
          brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
          proxiesAvailable={proxiesAvailable}
        />
      </section>

      {/* Accounts table */}
      <section>
        <h2 className="font-semibold mb-3">All accounts</h2>
        {!accounts || accounts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-10 text-center text-zinc-500">
            No accounts yet. Click <strong>Create</strong> above (or{' '}
            <code className="px-1 rounded bg-zinc-100 dark:bg-zinc-800">pnpm account:create instagram</code>).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Account</th>
                  <th className="text-left px-4 py-2 font-medium">Brand</th>
                  <th className="text-left px-4 py-2 font-medium">Platform</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Health</th>
                  <th className="text-right px-4 py-2 font-medium">Cap</th>
                  <th className="text-left px-4 py-2 font-medium">Profile</th>
                  <th className="text-left px-4 py-2 font-medium">Proxy</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const brand = brandsById.get(a.brand_id);
                  return (
                    <tr key={a.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-zinc-500">{a.id.slice(0, 8)}</div>
                        <div className="font-medium">@{a.handle}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {brand?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <span>{PLATFORM_EMOJI[a.platform] ?? '?'}</span>
                          {a.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[a.status] ?? STATUS_STYLES.retired}`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={a.health_score < 50 ? 'text-red-600' : ''}>
                          {a.health_score}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                        {a.daily_post_cap}/d
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                        {a.adspower_profile_id ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                        {a.proxy_id ? a.proxy_id.slice(0, 8) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
