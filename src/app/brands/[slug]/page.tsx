import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/db/admin';
import { CURRENT_WORKSPACE_ID } from '@/lib/db/workspace';
import { GenerateButton } from './generate-button';

export const dynamic = 'force-dynamic';

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
  };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Brands
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <h1 className="text-3xl font-bold">{brand.name}</h1>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              brand.status === 'active'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >
            {brand.status}
          </span>
        </div>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">{brand.niche}</p>
      </div>

      {/* Voice + offers summary */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="font-semibold mb-3">Voice</h2>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Tone</dt>
              <dd className="font-medium capitalize">{voice.tone}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Banned words</dt>
              <dd className="font-medium">{voice.banned_words.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Signature phrases</dt>
              <dd className="font-medium">{voice.signature_phrases.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Personas</dt>
              <dd className="font-medium">
                {(brand.target_personas as unknown[]).length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Platforms</dt>
              <dd className="font-medium">
                {(brand.default_platforms as string[]).length}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="font-semibold mb-3">Offers ({offers?.length ?? 0})</h2>
          {offers?.map((o) => (
            <div key={o.id} className="text-sm space-y-1 mb-3 last:mb-0">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{o.name}</span>
                {o.is_primary && (
                  <span className="text-xs text-amber-700 dark:text-amber-400">★ primary</span>
                )}
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 line-clamp-2">
                {o.pitch_1_sentence}
              </p>
              {o.url && (
                <a
                  href={o.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {o.url} ↗
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Generate */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="font-semibold mb-3">Generate content</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Calls the AI pipeline (Claude Sonnet 4.6 or Mock if no API key) and persists ideas to{' '}
          <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">content</code>.
        </p>
        <GenerateButton brandSlug={brand.slug} />
      </section>

      {/* Content list */}
      <section>
        <h2 className="font-semibold mb-3">
          Content ({contents?.length ?? 0})
          <span className="ml-2 text-sm font-normal text-zinc-500">latest 20</span>
        </h2>
        {!contents || contents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-10 text-center text-zinc-500">
            No content yet. Click <strong>Generate</strong> above.
          </div>
        ) : (
          <ul className="space-y-2">
            {contents.map((c) => {
              const meta = (c.generation_meta as Record<string, unknown>) ?? {};
              return (
                <li
                  key={c.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium line-clamp-1">{c.hook ?? '(no hook)'}</p>
                    <span className="text-xs text-zinc-500 flex-shrink-0">
                      {String(meta.platform ?? '?')} · €
                      {(c.cost_eur ?? 0).toFixed(4)} · {c.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    {c.caption}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(c.hashtags as string[]).slice(0, 5).map((h) => (
                      <span
                        key={h}
                        className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      >
                        {h}
                      </span>
                    ))}
                    {(c.hashtags as string[]).length > 5 && (
                      <span className="text-xs text-zinc-500">
                        +{(c.hashtags as string[]).length - 5} more
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
