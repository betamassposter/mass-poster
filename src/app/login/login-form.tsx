'use client';

import { useState, useTransition } from 'react';

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
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm">
        <span className="block text-zinc-500 mb-1">Email</span>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          placeholder="you@example.com"
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={isPending || !email}
        className="w-full rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? 'Sending…' : 'Send magic link'}
      </button>
      {error && (
        <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
      )}
    </form>
  );
}
