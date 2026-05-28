'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

const EVENT_TYPES = [
  { id: 'post.scheduled', label: 'Post scheduled' },
  { id: 'post.published', label: 'Post published' },
  { id: 'post.failed', label: 'Post failed' },
  { id: 'post.dead_letter', label: 'Post dead-letter (max retries)' },
  { id: 'account.created', label: 'Account created' },
  { id: 'account.warmup_completed', label: 'Account warmup completed' },
  { id: 'account.banned', label: 'Account banned' },
  { id: 'content.generated', label: 'Content generated' },
  { id: 'content.approved', label: 'Content approved' },
  { id: 'tracking_link.clicked', label: 'Tracking link clicked' },
  { id: 'viral.detected', label: 'Viral velocity detected' },
];

export function WebhookCreator() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [secretShown, setSecretShown] = useState<{ secret: string; url: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const toggleEvent = (id: string) =>
    setSelectedEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  const create = () => {
    startTransition(async () => {
      try {
        // Use the public API with workspace session (this endpoint is dual-purpose)
        const res = await fetch('/api/v1/webhooks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Use a session-trust pathway later — for now, only API key works.
            // We'll add session-auth path next.
            Authorization: `Bearer __internal_session__`,
          },
          body: JSON.stringify({ url, event_types: selectedEvents, description }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        toast.success('Webhook created');
        setSecretShown({ secret: json.secret, url });
        setOpen(false);
        setUrl('');
        setDescription('');
        setSelectedEvents([]);
        router.refresh();
      } catch (e) {
        toast.error('Failed to create webhook', (e as Error).message);
      }
    });
  };

  const copySecret = async () => {
    if (!secretShown) return;
    await navigator.clipboard.writeText(secretShown.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} variant="accent" icon={<Plus size={14} />}>
          Add webhook
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New webhook endpoint"
        description="POST signed payloads to your URL on selected events. HMAC-SHA256 signature in X-Mass-Poster-Signature."
        size="lg"
        footer={
          <>
            <Button onClick={() => setOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              onClick={create}
              variant="accent"
              loading={isPending}
              disabled={!url}
            >
              Create webhook
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Endpoint URL" required hint="HTTPS endpoint that will receive POST requests">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-server.com/webhooks/mp"
            />
          </Field>

          <Field label="Description" hint="Helps you identify this webhook in the list">
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="n8n production · slack alerts · ..."
            />
          </Field>

          <Field
            label="Subscribed events"
            hint={selectedEvents.length === 0 ? 'Leave empty to subscribe to all events' : `${selectedEvents.length} selected`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[280px] overflow-y-auto p-1 -m-1">
              {EVENT_TYPES.map((e) => {
                const selected = selectedEvents.includes(e.id);
                return (
                  <label
                    key={e.id}
                    className={`
                      flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer
                      transition-colors text-[12px]
                      ${
                        selected
                          ? 'border-[color:var(--accent)]/40 bg-[color:var(--accent-glow)] text-text-primary'
                          : 'border-border-subtle bg-bg-elevated text-text-secondary hover:border-border-default'
                      }
                    `}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleEvent(e.id)}
                      className="accent-[color:var(--accent)]"
                    />
                    <span className="font-mono text-[11px]">{e.id}</span>
                  </label>
                );
              })}
            </div>
          </Field>
        </div>
      </Modal>

      {/* Secret reveal modal */}
      <Modal
        open={!!secretShown}
        onClose={() => setSecretShown(null)}
        title="Save your signing secret"
        description="This secret is shown once. Store it now to verify webhook signatures on your server."
        size="md"
        footer={
          <Button variant="accent" onClick={() => setSecretShown(null)}>
            I&apos;ve saved it
          </Button>
        }
      >
        {secretShown && (
          <div className="space-y-3">
            <div className="text-xs text-text-muted">Endpoint:</div>
            <code className="block w-full px-3 py-2 rounded-md bg-bg-canvas border border-border-subtle font-mono text-[11px] text-text-primary truncate">
              {secretShown.url}
            </code>

            <div className="text-xs text-text-muted mt-4">Secret:</div>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-bg-canvas border border-border-subtle font-mono text-[11px] text-[color:var(--accent)] truncate">
                {secretShown.secret}
              </code>
              <Button onClick={copySecret} variant="secondary" size="md" icon={copied ? <Check size={13} /> : <Copy size={13} />}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div className="surface-elevated rounded-md p-3 text-[11px] mt-3 font-mono text-text-muted">
              <p className="text-text-secondary mb-1.5 font-sans">Verify signatures on your server:</p>
              <pre className="whitespace-pre-wrap">
{`const [t, v1] = signature.split(',').map(s => s.split('=')[1]);
const expected = hmac_sha256(\`\${t}.\${rawBody}\`, secret);
if (timingSafeEqual(v1, expected)) { /* valid */ }`}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
