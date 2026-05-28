'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';

interface Brand {
  id: string;
  name: string;
}
interface Offer {
  id: string;
  name: string;
  brand_id: string;
}

export function LinksActions({
  brands,
  offers,
  origin,
}: {
  brands: Brand[];
  offers: Offer[];
  origin: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [offerId, setOfferId] = useState<string>('');
  const [targetUrl, setTargetUrl] = useState('https://trymaplo.com');
  const [utmSource, setUtmSource] = useState('instagram');
  const [utmMedium, setUtmMedium] = useState('reel');
  const [utmCampaign, setUtmCampaign] = useState('mass-poster');
  const [utmContent, setUtmContent] = useState('');
  const [result, setResult] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const offersForBrand = useMemo(
    () => offers.filter((o) => o.brand_id === brandId),
    [brandId, offers],
  );

  function create() {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/tracking-link/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand_id: brandId,
            offer_id: offerId || undefined,
            target_url: targetUrl,
            utm_source: utmSource || undefined,
            utm_medium: utmMedium || undefined,
            utm_campaign: utmCampaign || undefined,
            utm_content: utmContent || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        setResult({
          type: 'ok',
          text: `✅ ${json.short_url}`,
        });
        router.refresh();
      } catch (e) {
        setResult({ type: 'err', text: (e as Error).message });
      }
    });
  }

  return (
    <div className="space-y-4">
      {brands.length === 0 ? (
        <div className="text-sm text-zinc-500">
          No brands yet. Run <code>pnpm brand:seed</code>.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-zinc-500 mb-1">Brand</span>
              <select
                value={brandId}
                onChange={(e) => {
                  setBrandId(e.target.value);
                  setOfferId('');
                }}
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-zinc-500 mb-1">Offer (optional)</span>
              <select
                value={offerId}
                onChange={(e) => setOfferId(e.target.value)}
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
              >
                <option value="">— none —</option>
                {offersForBrand.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="block text-zinc-500 mb-1">Target URL</span>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="block text-zinc-500 mb-1">UTM source</span>
              <input
                type="text"
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="block text-zinc-500 mb-1">UTM medium</span>
              <input
                type="text"
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="block text-zinc-500 mb-1">UTM campaign</span>
              <input
                type="text"
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="block text-zinc-500 mb-1">UTM content (e.g. account handle)</span>
              <input
                type="text"
                value={utmContent}
                onChange={(e) => setUtmContent(e.target.value)}
                className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={create}
              disabled={isPending || !brandId}
              className="rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create link'}
            </button>
            <span className="text-xs text-zinc-500">
              Will live at <code>{origin}/l/<i>xxxxxxxxxx</i></code>
            </span>
          </div>
          {result && (
            <div
              className={`text-sm ${result.type === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
            >
              {result.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}
