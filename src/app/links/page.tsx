import Link from 'next/link';
import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { LinksActions } from './links-actions';

export const dynamic = 'force-dynamic';

export default async function LinksPage() {
  const supabase = getSupabaseAdmin();
  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'localhost:3000';
  const proto = hdrs.get('x-forwarded-proto') ?? 'http';
  const origin = `${proto}://${host}`;

  const [{ data: links }, { data: brands }, { data: offers }] = await Promise.all([
    supabase
      .from('tracking_link')
      .select('id, slug, target_url, utm_source, utm_medium, utm_campaign, utm_content, clicks, conversions, brand_id, offer_id, created_at')
      .eq('workspace_id', CURRENT_WORKSPACE_ID)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('brand')
      .select('id, name, slug')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
    supabase
      .from('offer')
      .select('id, name, brand_id')
      .eq('workspace_id', CURRENT_WORKSPACE_ID),
  ]);

  const brandsById = new Map((brands ?? []).map((b) => [b.id, b]));
  const offersById = new Map((offers ?? []).map((o) => [o.id, o]));
  const totalClicks = (links ?? []).reduce((s, l) => s + (l.clicks ?? 0), 0);
  const totalConv = (links ?? []).reduce((s, l) => s + (l.conversions ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Home
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Tracking Links</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Bridge links with UTM injection. Put <code>{origin}/l/abc123</code> in
          your bio / caption — clicks are counted and forwarded to the target with
          UTM params appended.
        </p>
      </div>

      {/* KPI strip */}
      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Links</div>
          <div className="mt-1 text-2xl font-semibold">{links?.length ?? 0}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Total clicks</div>
          <div className="mt-1 text-2xl font-semibold">{totalClicks}</div>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Conversions</div>
          <div className="mt-1 text-2xl font-semibold">{totalConv}</div>
          <div className="mt-1 text-xs text-zinc-500">via PostHog (TODO)</div>
        </div>
      </section>

      {/* Create link */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="font-semibold mb-3">Create tracking link</h2>
        <LinksActions
          brands={(brands ?? []).map((b) => ({ id: b.id, name: b.name }))}
          offers={(offers ?? []).map((o) => ({ id: o.id, name: o.name, brand_id: o.brand_id }))}
          origin={origin}
        />
      </section>

      {/* Links table */}
      <section>
        <h2 className="font-semibold mb-3">All links</h2>
        {!links || links.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-10 text-center text-zinc-500">
            No tracking links yet. Create one above.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Short URL</th>
                  <th className="text-left px-4 py-2 font-medium">Brand / Offer</th>
                  <th className="text-left px-4 py-2 font-medium">Target</th>
                  <th className="text-left px-4 py-2 font-medium">UTM</th>
                  <th className="text-right px-4 py-2 font-medium">Clicks</th>
                  <th className="text-right px-4 py-2 font-medium">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const brand = brandsById.get(l.brand_id);
                  const offer = l.offer_id ? offersById.get(l.offer_id) : null;
                  const shortUrl = `${origin}/l/${l.slug}`;
                  return (
                    <tr key={l.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-3">
                        <a
                          href={shortUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          /l/{l.slug}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {brand?.name ?? '—'}
                        {offer ? <span className="text-zinc-400"> · {offer.name}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        <span className="block max-w-xs truncate" title={l.target_url}>
                          {l.target_url}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {[l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{l.clicks}</td>
                      <td className="px-4 py-3 text-right">{l.conversions}</td>
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
