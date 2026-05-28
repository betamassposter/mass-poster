'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Users,
  Link as LinkIcon,
  FileText,
  Activity,
  KeyRound,
  Webhook,
  Sparkles,
  Settings,
  Calendar,
  Network,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string | number;
}

const PRIMARY: NavItem[] = [
  { href: '/', label: 'Overview', icon: Home },
  { href: '/brands', label: 'Brands', icon: Sparkles },
  { href: '/accounts', label: 'Accounts', icon: Users },
  { href: '/proxies', label: 'Proxies', icon: Network },
  { href: '/content', label: 'Content', icon: FileText },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/links', label: 'Links', icon: LinkIcon },
];

const SECONDARY: NavItem[] = [
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ workspaceName, planLabel }: { workspaceName: string; planLabel: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <aside className="w-[232px] flex-shrink-0 surface-elevated border-r border-border-subtle flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="h-14 px-5 flex items-center border-b border-border-subtle">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--accent)] text-bg-canvas font-bold text-sm">
            M
            <span
              className="absolute inset-0 rounded-md opacity-60 blur-md -z-10"
              style={{ background: 'var(--accent)' }}
            />
          </span>
          <span className="font-semibold tracking-tight text-[15px]">Mass Poster</span>
        </Link>
      </div>

      {/* Workspace switcher */}
      <div className="px-3 py-3 border-b border-border-subtle">
        <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-bg-hover hover:bg-bg-active transition-colors text-left">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-bg-card text-text-secondary text-xs font-mono font-medium">
            {workspaceName.slice(0, 2).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{workspaceName}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider">{planLabel}</div>
          </div>
          <ChevronToggle />
        </button>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <div className="h-px bg-border-subtle my-4 mx-1.5" />

        <div className="px-2 pb-1.5 text-[10px] uppercase tracking-[0.1em] text-text-faint font-medium">
          Developer
        </div>
        {SECONDARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      {/* Footer status */}
      <div className="px-3 py-3 border-t border-border-subtle">
        <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-text-muted">
          <span className="relative flex h-2 w-2">
            <span
              className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full"
              style={{ background: 'var(--status-success)' }}
            />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--status-success)' }} />
          </span>
          All providers healthy
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`
        relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] font-medium
        transition-colors duration-150
        ${
          active
            ? 'bg-bg-hover text-text-primary'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover/50'
        }
      `}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full"
          style={{ background: 'var(--accent)' }}
        />
      )}
      <Icon size={16} className={active ? 'text-[color:var(--accent)]' : 'text-text-muted'} />
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-active text-text-muted font-mono">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function ChevronToggle() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-muted flex-shrink-0">
      <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
