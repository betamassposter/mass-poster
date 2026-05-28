'use client';

import { useEffect, useState } from 'react';
import { Search, Plus, Bell, LogOut } from 'lucide-react';
import { CommandPalette } from './command-palette';

interface TopbarProps {
  userEmail: string;
}

export function Topbar({ userEmail }: TopbarProps) {
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="h-14 surface-glass border-b border-border-subtle sticky top-0 z-30 flex items-center px-6 gap-4">
        {/* Search trigger */}
        <button
          onClick={() => setCmdOpen(true)}
          className="
            flex items-center gap-2 px-3 h-8 w-[280px]
            rounded-md bg-bg-elevated border border-border-subtle
            text-text-muted text-[13px]
            hover:border-border-default hover:text-text-secondary transition-colors
          "
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="flex items-center gap-0.5 text-[10px] font-mono text-text-faint">
            <span className="rounded border border-border-default px-1 py-0.5">⌘</span>
            <span className="rounded border border-border-default px-1 py-0.5">K</span>
          </kbd>
        </button>

        <div className="flex-1" />

        {/* Quick actions */}
        <button className="
          inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md
          bg-[color:var(--accent-glow)] border border-[color:var(--accent)]/30
          text-[color:var(--accent)] text-xs font-medium
          hover:bg-[color:var(--accent-faint)] transition-colors
        ">
          <Plus size={13} />
          Generate
        </button>

        <button className="
          relative h-8 w-8 flex items-center justify-center rounded-md
          text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors
        ">
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
        </button>

        <div className="w-px h-6 bg-border-subtle" />

        {/* User */}
        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <div className="text-[12px] font-medium text-text-primary">{userEmail.split('@')[0]}</div>
            <div className="text-[10px] text-text-muted">{userEmail}</div>
          </div>
          <div className="h-8 w-8 rounded-full flex items-center justify-center font-mono text-xs font-bold text-bg-canvas" style={{ background: 'var(--lime)' }}>
            {userEmail.slice(0, 1).toUpperCase()}
          </div>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="h-8 w-8 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </form>
        </div>
      </header>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
