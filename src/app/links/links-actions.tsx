'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Link as LinkIcon } from 'lucide-react';

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
  origin: _origin,
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

  const offersForBrand = useMemo(() => offers.filter((o) => o.brand_id === brandId), [brandId, offers]);

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
        setResult({ type: 'ok', text: json.short_url });
        router.refresh();
      } catch (e) {
        setResult({ type: 'err', text: (e as Error).message });
      }
    });
  }

  if (brands.length === 0) {
    return (
      <div className="text-sm text-text-muted py-3">
        No brands. Run <code className="font-mono">pnpm brand:seed</code>.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Brand">
          <Select
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              setOfferId('');
            }}
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Offer (optional)">
          <Select value={offerId} onChange={(e) => setOfferId(e.target.value)}>
            <option value="">— none —</option>
            {offersForBrand.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target URL" required>
          <Input type="url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
        </Field>
        <div className="md:col-span-1" />
        <Field label="UTM source">
          <Input type="text" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} />
        </Field>
        <Field label="UTM medium">
          <Input type="text" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} />
        </Field>
        <Field label="UTM campaign">
          <Input type="text" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} />
        </Field>
        <Field label="UTM content (account handle)">
          <Input type="text" value={utmContent} onChange={(e) => setUtmContent(e.target.value)} />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={create}
          variant="accent"
          loading={isPending}
          disabled={!brandId || !targetUrl}
          icon={<LinkIcon size={14} />}
        >
          Create link
        </Button>
        {result && (
          <div
            className={`text-sm flex items-center gap-2 ${
              result.type === 'ok' ? 'text-[color:var(--status-success)]' : 'text-[color:var(--status-danger)]'
            }`}
          >
            {result.type === 'ok' ? (
              <>
                <span>✓</span>
                <code className="font-mono text-[12px] text-[color:var(--accent)]">{result.text}</code>
              </>
            ) : (
              <>⚠ {result.text}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
