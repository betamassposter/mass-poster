'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

interface AppShellProps {
  children: React.ReactNode;
  session: { email: string } | null;
  workspaceName: string;
  planLabel: string;
}

function isPublicRoute(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname.startsWith('/auth/')) return true;
  if (pathname.startsWith('/l/')) return true;
  return false;
}

export function AppShell({ children, session, workspaceName, planLabel }: AppShellProps) {
  const pathname = usePathname();

  if (!session || isPublicRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar workspaceName={workspaceName} planLabel={planLabel} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar userEmail={session.email} />
        <main className="flex-1 px-8 py-8 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
