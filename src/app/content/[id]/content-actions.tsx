'use client';

import { CheckCircle2, XCircle, Calendar, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useRouter } from 'next/navigation';

export function ContentActions({ contentId, status }: { contentId: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function setStatus(newStatus: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/content/${contentId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      toast.success(`Marked as ${newStatus}`);
      router.refresh();
    } catch (err) {
      toast.error('Update failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status !== 'approved' && (
        <Button
          onClick={() => setStatus('approved')}
          size="sm"
          variant="accent"
          icon={<CheckCircle2 size={13} />}
          loading={busy}
        >
          Approve
        </Button>
      )}
      {status !== 'rejected' && (
        <Button
          onClick={() => setStatus('rejected')}
          size="sm"
          variant="ghost"
          icon={<XCircle size={13} />}
          disabled={busy}
        >
          Reject
        </Button>
      )}
      <Button size="sm" variant="secondary" icon={<Calendar size={13} />}>
        Schedule
      </Button>
    </div>
  );
}
