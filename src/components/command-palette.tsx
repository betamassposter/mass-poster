'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  Home,
  Users,
  Link as LinkIcon,
  FileText,
  Sparkles,
  Webhook,
  KeyRound,
  Plus,
  Calendar,
  Activity,
  Network,
  Settings,
} from 'lucide-react';

const NAV = [
  { id: 'home', label: 'Overview', icon: Home, href: '/' },
  { id: 'brands', label: 'Brands', icon: Sparkles, href: '/brands' },
  { id: 'accounts', label: 'Accounts', icon: Users, href: '/accounts' },
  { id: 'proxies', label: 'Proxies', icon: Network, href: '/proxies' },
  { id: 'content', label: 'Content', icon: FileText, href: '/content' },
  { id: 'schedule', label: 'Schedule', icon: Calendar, href: '/schedule' },
  { id: 'links', label: 'Tracking Links', icon: LinkIcon, href: '/links' },
  { id: 'activity', label: 'Activity', icon: Activity, href: '/activity' },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook, href: '/webhooks' },
  { id: 'keys', label: 'API Keys', icon: KeyRound, href: '/api-keys' },
  { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
];

interface Action {
  id: string;
  label: string;
  shortcut?: string;
  icon: typeof Plus;
  href: string;
}

const ACTIONS: Action[] = [
  { id: 'create-brand', label: 'Create new brand', shortcut: 'C B', icon: Sparkles, href: '/brands/new' },
  { id: 'create-account', label: 'Create new account', shortcut: 'C A', icon: Plus, href: '/accounts' },
  { id: 'allocate-proxy', label: 'Allocate proxies', shortcut: 'A P', icon: Network, href: '/proxies' },
  { id: 'create-link', label: 'Create tracking link', shortcut: 'C L', icon: LinkIcon, href: '/links' },
  { id: 'gen-content', label: 'Generate content for a brand', shortcut: 'G C', icon: FileText, href: '/brands' },
  { id: 'create-key', label: 'Create API key', shortcut: 'C K', icon: KeyRound, href: '/api-keys' },
  { id: 'create-webhook', label: 'Create webhook', shortcut: 'C W', icon: Webhook, href: '/webhooks' },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] animate-float-in"
      onClick={onClose}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'oklch(0 0 0 / 0.55)', backdropFilter: 'blur(4px)' }}
      />
      <div
        className="relative w-full max-w-[600px] surface-glass rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={true} className="">
          <div className="px-4 pt-4 pb-2 border-b border-border-subtle flex items-center gap-2">
            <span className="text-text-muted">⌘</span>
            <Command.Input
              placeholder="Type a command or search…"
              className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted text-[14px] outline-none py-1"
            />
            <kbd className="text-[10px] font-mono text-text-faint rounded border border-border-default px-1.5 py-0.5">ESC</kbd>
          </div>

          <Command.List className="max-h-[400px] overflow-y-auto py-2">
            <Command.Empty className="px-4 py-8 text-center text-sm text-text-muted">
              No results. Try a different query.
            </Command.Empty>

            <Command.Group heading="Navigate">
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.id}
                    value={`nav ${item.label}`}
                    onSelect={() => {
                      router.push(item.href);
                      onClose();
                    }}
                    className="
                      flex items-center gap-3 px-4 py-2 mx-2 rounded-md cursor-pointer
                      text-[13px] text-text-secondary
                      data-[selected=true]:bg-bg-hover data-[selected=true]:text-text-primary
                    "
                  >
                    <Icon size={15} className="text-text-muted" />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[11px] text-text-faint font-mono">{item.href}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>

            <Command.Group heading="Actions">
              {ACTIONS.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.id}
                    value={`action ${item.label}`}
                    onSelect={() => {
                      router.push(item.href);
                      onClose();
                    }}
                    className="
                      flex items-center gap-3 px-4 py-2 mx-2 rounded-md cursor-pointer
                      text-[13px] text-text-secondary
                      data-[selected=true]:bg-bg-hover data-[selected=true]:text-text-primary
                    "
                  >
                    <Icon size={15} className="text-text-muted" />
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="text-[10px] font-mono text-text-faint">{item.shortcut}</kbd>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>
          </Command.List>

          <div className="px-4 py-2 border-t border-border-subtle flex items-center justify-between text-[10px] text-text-faint">
            <div className="flex gap-3">
              <span><kbd className="rounded border border-border-default px-1 mr-1">↑↓</kbd> navigate</span>
              <span><kbd className="rounded border border-border-default px-1 mr-1">↵</kbd> select</span>
            </div>
            <span>Mass Poster</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
