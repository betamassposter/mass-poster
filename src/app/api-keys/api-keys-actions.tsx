'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

export function ApiKeyCreator() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [env, setEnv] = useState<'live' | 'test'>('live');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toggleScope = (s: string) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const create = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/v1/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, env, scopes }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        setCreatedKey(json.key);
        toast.success('API key created');
      } catch (e) {
        toast.error('Failed to create key', (e as Error).message);
      }
    });
  };

  const close = () => {
    setOpen(false);
    setName('');
    setEnv('live');
    setScopes(['read']);
    setCreatedKey(null);
    setCopied(false);
    router.refresh();
  };

  const copyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)} variant="accent" icon={<Plus size={14} />}>
          Create API key
        </Button>
      </div>

      <Modal
        open={open}
        onClose={createdKey ? () => {} : close}
        title={createdKey ? 'Save your key' : 'New API key'}
        description={
          createdKey
            ? 'This is the only time the full key is shown. Save it now in your secrets manager.'
            : 'Create a workspace-scoped bearer token. Use scopes for least-privilege.'
        }
        size="md"
        footer={
          createdKey ? (
            <Button onClick={close} variant="accent">
              I&apos;ve saved it
            </Button>
          ) : (
            <>
              <Button onClick={close} variant="ghost">
                Cancel
              </Button>
              <Button onClick={create} variant="accent" loading={isPending} disabled={!name || scopes.length === 0}>
                Create key
              </Button>
            </>
          )
        }
      >
        {createdKey ? (
          <div className="space-y-3">
            <div className="text-xs text-text-muted mb-1">Your key</div>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-bg-canvas border border-border-subtle font-mono text-[11px] text-[color:var(--accent)] break-all">
                {createdKey}
              </code>
              <Button onClick={copyKey} variant="secondary" size="md" icon={copied ? <Check size={13} /> : <Copy size={13} />}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div className="surface-elevated rounded-md p-3 text-[11px] mt-3 font-mono text-text-muted">
              <p className="text-text-secondary mb-1.5 font-sans">Use it:</p>
              <pre>{`curl https://your-app/api/v1/content \\
  -H "Authorization: Bearer ${createdKey.slice(0, 20)}..."`}</pre>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Name" required hint="Helps you identify this key in the list">
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="n8n production, slack alerts, ..."
                autoFocus
              />
            </Field>

            <Field label="Environment">
              <Select value={env} onChange={(e) => setEnv(e.target.value as 'live' | 'test')}>
                <option value="live">Live (mp_live_...)</option>
                <option value="test">Test (mp_test_...)</option>
              </Select>
            </Field>

            <Field label="Scopes" required>
              <div className="flex gap-2">
                {(['read', 'write', 'admin'] as const).map((s) => {
                  const selected = scopes.includes(s);
                  return (
                    <label
                      key={s}
                      className={`
                        flex-1 cursor-pointer flex items-center justify-center gap-2 px-3 py-2 rounded-md border
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
                        onChange={() => toggleScope(s)}
                        className="accent-[color:var(--accent)]"
                      />
                      <span className="font-mono uppercase tracking-wider text-[10px]">{s}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}

export function RevokeButton({ keyId, keyName }: { keyId: string; keyName: string }) {
  const toast = useToast();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/keys/${keyId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Revoke failed');
      toast.info(`Key "${keyName}" revoked`);
      router.refresh();
    } catch (e) {
      toast.error('Revoke failed', (e as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-[11px] text-text-muted hover:text-[color:var(--status-danger)] transition-colors"
      >
        Revoke
      </button>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Revoke API key?"
        description={`"${keyName}" will stop working immediately. Apps using it will get 401.`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirming(false)} variant="ghost" disabled={busy}>
              Cancel
            </Button>
            <Button onClick={revoke} variant="destructive" loading={busy}>
              Revoke
            </Button>
          </>
        }
      >
        <div className="text-sm text-text-secondary">
          This action cannot be undone. Create a new key if you need to restore access.
        </div>
      </Modal>
    </>
  );
}
