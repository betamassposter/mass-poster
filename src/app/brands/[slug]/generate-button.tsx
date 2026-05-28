'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Sparkles } from 'lucide-react';

type Platform = 'instagram' | 'tiktok' | 'youtube_shorts' | 'linkedin' | 'x';

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X (Twitter)' },
];

export function GenerateButton({ brandSlug }: { brandSlug: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [count, setCount] = useState(3);
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    provider: string;
    inserted_count: number;
    cost_eur: number;
    duration_ms: number;
    quality_summary?: { passed: number; warned: number; rejected: number };
  } | null>(null);

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
        setSuccess({
          provider: json.provider,
          inserted_count: json.inserted_count,
          cost_eur: json.cost_eur ?? 0,
          duration_ms: json.duration_ms ?? 0,
          quality_summary: json.quality_summary,
        });
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Count">
          <Input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={isPending}
            className="w-20"
          />
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
          onClick={onClick}
          disabled={isPending}
          loading={isPending}
          variant="accent"
          icon={!isPending && <Sparkles size={14} />}
        >
          Generate {count} {count === 1 ? 'idea' : 'ideas'}
        </Button>
      </div>

      {success && (
        <div className="surface-elevated rounded-md p-3.5 border-[color:var(--status-success)]/30">
          <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--status-success)] mb-2">
            ✓ {success.inserted_count} ideas inserted
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Metric label="Provider" value={success.provider} mono />
            <Metric label="Cost" value={`€${success.cost_eur.toFixed(4)}`} mono />
            <Metric label="Duration" value={`${success.duration_ms}ms`} mono />
            {success.quality_summary && (
              <Metric
                label="Quality"
                value={
                  <span className="flex gap-1.5 font-mono text-[11px]">
                    <span className="text-[color:var(--status-success)]">✓{success.quality_summary.passed}</span>
                    {success.quality_summary.warned > 0 && (
                      <span className="text-[color:var(--status-warning)]">⚠{success.quality_summary.warned}</span>
                    )}
                    {success.quality_summary.rejected > 0 && (
                      <span className="text-[color:var(--status-danger)]">✗{success.quality_summary.rejected}</span>
                    )}
                  </span>
                }
              />
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-[color:var(--status-danger)] flex items-center gap-1.5">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-faint mb-0.5">{label}</div>
      <div className={`text-text-secondary ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
