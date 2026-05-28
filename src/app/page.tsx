import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = getSupabaseAdmin();

  const [{ data: brands }, { count: contentCount }, { count: postCount }, { count: accountCount }] =
    await Promise.all([
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
    ]);

  const kpis = [
    { label: 'Brands', value: brands?.length ?? 0 },
    { label: 'Content generated', value: contentCount ?? 0 },
    { label: 'Posts published', value: postCount ?? 0 },
    { label: 'Accounts live', value: accountCount ?? 0 },
  ];

  return (
    <div className="space-y-10">
      {/* KPI strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3"
          >
            <div className="text-xs uppercase tracking-wider text-zinc-500">{k.label}</div>
            <div className="mt-1 text-2xl font-semibold">{k.value}</div>
          </div>
        ))}
      </section>

      {/* Brands */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-semibold">Brands</h2>
          <span className="text-sm text-zinc-500">{brands?.length ?? 0} total</span>
        </div>

        {!brands || brands.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-12 text-center text-zinc-500">
            No brands yet. Seed one via{' '}
            <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">pnpm brand:seed</code>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brands.map((b) => (
              <Link
                key={b.id}
                href={`/brands/${b.slug}`}
                className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{b.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      b.status === 'active'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {b.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {b.niche ?? 'No niche set'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(b.default_platforms as string[]).map((p) => (
                    <span
                      key={p}
                      className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <div className="mt-3 text-xs text-zinc-500">
                  {(b.target_personas as unknown[]).length} personas
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
