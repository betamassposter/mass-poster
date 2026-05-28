'use client';

import { useState, useTransition } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/auth/send-magic-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, return_to: returnTo }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Request failed');
        window.location.href = `/login?sent=${encodeURIComponent(email)}`;
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email">
        <Input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          placeholder="you@example.com"
        />
      </Field>
      <Button
        type="submit"
        disabled={isPending || !email}
        loading={isPending}
        variant="accent"
        size="lg"
        iconRight={<ArrowRight size={14} />}
        className="w-full"
      >
        {isPending ? 'Sending magic link…' : 'Send magic link'}
      </Button>
      {error && (
        <div className="text-xs" style={{ color: 'var(--status-danger)' }}>
          {error}
        </div>
      )}
    </form>
  );
}
