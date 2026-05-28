'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Platform = 'instagram' | 'tiktok' | 'youtube_shorts' | 'linkedin' | 'x';

export function GenerateButton({ brandSlug }: { brandSlug: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [count, setCount] = useState(3);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function onClick() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/content/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand_slug: brandSlug, count, platform }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        setSuccess(
          `✅ ${json.inserted_count} ideas generated · ${json.provider} · €${(json.cost_eur ?? 0).toFixed(4)} · ${json.duration_ms}ms`,
        );
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-zinc-500 mb-1">Count</span>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={isPending}
            className="w-20 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="block text-zinc-500 mb-1">Platform</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            disabled={isPending}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
          >
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube_shorts">YouTube Shorts</option>
            <option value="linkedin">LinkedIn</option>
            <option value="x">X</option>
          </select>
        </label>
        <button
          onClick={onClick}
          disabled={isPending}
          className="rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Generating…' : 'Generate'}
        </button>
      </div>
      {error && (
        <div className="text-sm text-red-700 dark:text-red-400">
          ❌ {error}
        </div>
      )}
      {success && (
        <div className="text-sm text-green-700 dark:text-green-400">{success}</div>
      )}
    </div>
  );
}
