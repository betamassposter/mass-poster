'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Select, Field } from '@/components/ui/input';
import { Plus } from 'lucide-react';

type Platform = 'instagram' | 'tiktok' | 'youtube_shorts' | 'x' | 'linkedin' | 'facebook';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'facebook', label: 'Facebook' },
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
          text: `Created @${json.handle} — ${json.profile_provider} profile ${json.profile_id?.slice(0, 12)}…`,
        });
        router.refresh();
      } catch (e) {
        setMessage({ type: 'err', text: (e as Error).message });
      }
    });
  }

  // rentProxies removed — /api/proxy/rent endpoint deleted (it called
  // Multilogin's /mobile-proxy/allocate which is HTTP 501 on Pro_10).
  // Proxy sourcing now happens via the /proxies page → Sync from Multilogin.

  return (
    <div className="space-y-5">
      {brands.length === 0 ? (
        <div className="text-sm text-text-muted py-4">
          No brands. Run <code className="px-1 rounded bg-bg-elevated font-mono">pnpm brand:seed</code>.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Field label="Brand">
            <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={isPending}>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Platform">
            <Select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              disabled={isPending}
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            onClick={createAccount}
            variant="accent"
            disabled={isPending || !brandId}
            loading={isPending}
            icon={!isPending && <Plus size={14} />}
          >
            Create account
          </Button>
        </div>
      )}

      {proxiesAvailable === 0 && brands.length > 0 && (
        <div className="text-[12px] text-[color:var(--status-warning)] flex items-center gap-1.5">
          ⚠ No proxies in pool. Go to{' '}
          <Link href="/proxies" className="underline">/proxies</Link> → click{' '}
          <strong>Sync from Multilogin</strong> after creating a profile in Multilogin.
        </div>
      )}

      {message && (
        <div
          className={`text-sm flex items-center gap-2 ${
            message.type === 'ok' ? 'text-[color:var(--status-success)]' : 'text-[color:var(--status-danger)]'
          }`}
        >
          {message.type === 'ok' ? '✓' : '⚠'} {message.text}
        </div>
      )}
    </div>
  );
}
