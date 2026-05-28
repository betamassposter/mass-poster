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
  Video,
  Mic,
  Calendar,
  Zap,
  Activity,
} from 'lucide-react';

const NAV = [
  { id: 'home', label: 'Overview', icon: Home, href: '/' },
  { id: 'brands', label: 'Brands', icon: Sparkles, href: '/brands' },
  { id: 'accounts', label: 'Accounts', icon: Users, href: '/accounts' },
  { id: 'content', label: 'Content', icon: FileText, href: '/content' },
  { id: 'links', label: 'Tracking Links', icon: LinkIcon, href: '/links' },
  { id: 'activity', label: 'Activity', icon: Activity, href: '/activity' },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook, href: '/webhooks' },
  { id: 'keys', label: 'API Keys', icon: KeyRound, href: '/api-keys' },
];

const ACTIONS = [
  { id: 'gen-content', label: 'Generate content', shortcut: 'G C', icon: Sparkles, action: 'gen-content' },
  { id: 'gen-reel', label: 'Generate full reel', shortcut: 'G R', icon: Video, action: 'gen-reel' },
  { id: 'gen-voice', label: 'Test voice synthesis', shortcut: 'G V', icon: Mic, action: 'gen-voice' },
  { id: 'schedule', label: 'Smart-schedule posts', shortcut: 'S S', icon: Calendar, action: 'schedule' },
  { id: 'tick', label: 'Process scheduled queue', shortcut: 'P T', icon: Zap, action: 'tick' },
  { id: 'create-link', label: 'Create tracking link', shortcut: 'C L', icon: LinkIcon, action: 'create-link' },
  { id: 'create-account', label: 'Create new account', shortcut: 'C A', icon: Plus, action: 'create-account' },
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
                      // For now, navigate to action targets; later wire to API
                      const map: Record<string, string> = {
                        'gen-content': '/brands',
                        'gen-reel': '/brands',
                        'create-link': '/links',
                        'create-account': '/accounts',
                      };
                      router.push(map[item.action] ?? '/');
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
