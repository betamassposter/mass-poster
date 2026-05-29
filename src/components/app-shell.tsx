'use client';

import { useState } from 'react';
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!session || isPublicRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar (lg+): inline, sticky */}
      <div className="hidden lg:block">
        <Sidebar workspaceName={workspaceName} planLabel={planLabel} />
      </div>

      {/* Mobile drawer (<lg): overlay + slide-in */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="relative z-10 animate-float-in"
            onClick={() => setDrawerOpen(false)}
          >
            <Sidebar workspaceName={workspaceName} planLabel={planLabel} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar userEmail={session.email} onOpenDrawer={() => setDrawerOpen(true)} />
        <main className="flex-1 px-4 md:px-6 lg:px-8 py-6 lg:py-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
