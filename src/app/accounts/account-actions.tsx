'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Platform = 'instagram' | 'tiktok' | 'youtube_shorts' | 'x' | 'linkedin' | 'facebook';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'instagram', label: '📸 Instagram' },
  { value: 'tiktok', label: '🎵 TikTok' },
  { value: 'youtube_shorts', label: '▶️ YouTube Shorts' },
  { value: 'x', label: '𝕏 X' },
  { value: 'linkedin', label: '💼 LinkedIn' },
  { value: 'facebook', label: 'f Facebook' },
];

interface Brand {
  id: string;
  name: string;
  slug: string;
}

export function AccountActions({
  brands,
  proxiesAvailable,
}: {
  brands: Brand[];
  proxiesAvailable: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [proxyCount, setProxyCount] = useState(5);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function createAccount() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/account/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand_id: brandId, platform }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        setMessage({
          type: 'ok',
          text: `✅ Created @${json.handle} (profile ${json.adspower_profile_id})`,
        });
        router.refresh();
      } catch (e) {
        setMessage({ type: 'err', text: (e as Error).message });
      }
    });
  }

  function rentProxies() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/proxy/rent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: proxyCount }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        setMessage({ type: 'ok', text: `✅ Rented ${json.count} proxies` });
        router.refresh();
      } catch (e) {
        setMessage({ type: 'err', text: (e as Error).message });
      }
    });
  }

  return (
    <div className="space-y-4">
      {brands.length === 0 ? (
        <div className="text-sm text-zinc-500">
          No brands yet. Run <code className="px-1 rounded bg-zinc-100 dark:bg-zinc-800">pnpm brand:seed</code>.
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-zinc-500 mb-1">Brand</span>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              disabled={isPending}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-zinc-500 mb-1">Platform</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              disabled={isPending}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={createAccount}
            disabled={isPending || !brandId}
            className="rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Creating…' : 'Create account'}
          </button>
          {proxiesAvailable === 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400 self-center">
              ⚠️ No proxies free
            </span>
          )}
        </div>
      )}

      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-zinc-500 mb-1">Rent proxies (mock)</span>
          <input
            type="number"
            min={1}
            max={50}
            value={proxyCount}
            onChange={(e) => setProxyCount(Number(e.target.value))}
            disabled={isPending}
            className="w-20 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
          />
        </label>
        <button
          onClick={rentProxies}
          disabled={isPending}
          className="rounded border border-zinc-300 dark:border-zinc-700 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? 'Renting…' : 'Rent N proxies'}
        </button>
        <span className="text-xs text-zinc-500 self-center">
          (mock until <code>iProyal</code> credentials added)
        </span>
      </div>

      {message && (
        <div
          className={`text-sm ${
            message.type === 'ok'
              ? 'text-green-700 dark:text-green-400'
              : 'text-red-700 dark:text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
