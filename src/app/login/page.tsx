import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; sent?: string; error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect('/');

  const { return_to, sent, error } = await searchParams;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
        <h1 className="text-2xl font-bold mb-1">Mass Poster</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Internal — sign in with email magic link.
        </p>

        {sent ? (
          <div className="text-sm bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 px-3 py-2.5 rounded">
            ✅ Check your inbox — we sent a magic link to <strong>{sent}</strong>.
            Open it on this device to complete sign-in.
          </div>
        ) : (
          <LoginForm returnTo={return_to ?? '/'} />
        )}

        {error && (
          <div className="mt-4 text-sm bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 px-3 py-2.5 rounded">
            ❌ {decodeURIComponent(error)}
          </div>
        )}

        <p className="mt-6 text-xs text-zinc-500">
          First time? Run{' '}
          <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
            pnpm auth:invite your@email.com
          </code>{' '}
          to attach your user to the workspace, then sign in here.
        </p>
      </div>
    </div>
  );
}
