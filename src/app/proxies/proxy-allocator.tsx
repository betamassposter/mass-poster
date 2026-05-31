'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Sync mobile/desktop profiles from Multilogin into Mass Poster.
 *
 * Multilogin's `/mobile-profile/create` REST endpoint is HTTP 501 on Pro_10,
 * so profiles must be created in their web UI. Once created there (with a
 * Multilogin-bundled proxy auto-assigned), click Sync here and the profile
 * appears as a proxy row with `validation_status=pending`.
 *
 * Validation runs separately via the per-row Validate button.
 */
export function ProxyAllocator() {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [hint, setHint] = useState(false);

  const sync = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/multilogin/sync', { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Sync failed');
        const s = json.summary ?? {};
        if (s.profiles_total === 0) {
          setHint(true);
          toast.error(
            'No profiles found in Multilogin',
            'Create a mobile profile in Multilogin first, then sync again',
          );
        } else {
          toast.success(
            `Synced ${s.profiles_total} profile(s)`,
            `${s.new} new · ${s.updated} updated · click Validate per row to run IP gate`,
          );
        }
        router.refresh();
      } catch (e) {
        toast.error('Sync failed', (e as Error).message);
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <a
        href="https://app.multilogin.com/en/home/mobile"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary"
        title="Open Multilogin to create a mobile profile"
      >
        <ExternalLink size={11} /> Multilogin UI
      </a>
      <Button
        onClick={sync}
        variant="accent"
        icon={<RefreshCw size={14} className={isPending ? 'animate-spin' : ''} />}
        loading={isPending}
      >
        Sync from Multilogin
      </Button>
      {hint && (
        <div className="absolute mt-12 max-w-md rounded-md surface-elevated p-3 text-[11px] text-text-muted">
          Multilogin's REST API doesn't expose mobile-profile/create on Pro_10. Create the
          profile in their web UI (the link above), then come back and click Sync. The
          profile will appear here with `validation_status=pending` until you click
          Validate on the row.
        </div>
      )}
    </div>
  );
}
