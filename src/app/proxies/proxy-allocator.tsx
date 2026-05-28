'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

const COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'IT', label: 'Italy' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'PL', label: 'Poland' },
  { code: 'BR', label: 'Brazil' },
  { code: 'MX', label: 'Mexico' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
];

export function ProxyAllocator() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(5);
  const [country, setCountry] = useState('IT');
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/proxy/rent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count, country }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        const summary = json.summary ?? {};
        toast.success(
          `Allocated ${json.count ?? count} ${country} proxies`,
          `Clean ${summary.clean ?? 0} · Dirty ${summary.dirty ?? 0} · Error ${summary.error ?? 0}`,
        );
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error('Allocation failed', (e as Error).message);
      }
    });
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="accent"
        icon={<Plus size={14} />}
      >
        Allocate proxies
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Allocate mobile proxies"
        description="Multilogin Mobile Proxies. Each new proxy is automatically validated against the IP reputation gate before being marked usable."
        size="md"
        footer={
          <>
            <Button onClick={() => setOpen(false)} variant="ghost" disabled={isPending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              variant="accent"
              loading={isPending}
              icon={<ShieldCheck size={13} />}
            >
              Allocate + validate
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="How many" hint="Each proxy adds vendor cost — start small.">
            <Input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </Field>
          <Field label="Country" required hint="Mobile carrier in this country. Pick the one the brand targets.">
            <Select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label} ({c.code})
                </option>
              ))}
            </Select>
          </Field>
          <div className="surface-elevated rounded-md p-3 text-[11px] text-text-muted">
            After allocation, every proxy is routed through:
            <ul className="mt-1.5 space-y-0.5 text-text-secondary">
              <li>· ZeroBounce IP reputation API (fraud_score, blacklists, Tor/VPN flags)</li>
              <li>
                · browserleaks.com/ip (real scrape via headless Chromium through the proxy —
                geo, ASN, proxy/hosting flags, blacklists, DNS leak, WebRTC leak)
              </li>
            </ul>
            Proxies that don&apos;t come back 100% clean on both sources are quarantined and
            cannot be bound to accounts in strict mode.
          </div>
        </div>
      </Modal>
    </>
  );
}
