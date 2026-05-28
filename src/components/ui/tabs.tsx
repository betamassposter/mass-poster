'use client';

import { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: 'underline' | 'pills';
}

export function Tabs({ tabs, active, onChange, className = '', variant = 'underline' }: TabsProps) {
  if (variant === 'pills') {
    return (
      <div className={`inline-flex p-0.5 rounded-md bg-bg-elevated border border-border-subtle ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`
                inline-flex items-center gap-1.5 h-7 px-3 rounded text-xs font-medium
                transition-colors
                ${
                  isActive
                    ? 'bg-bg-card text-text-primary shadow-[0_1px_0_oklch(1_0_0_/_0.06)]'
                    : 'text-text-muted hover:text-text-secondary'
                }
              `}
            >
              {Icon && <Icon size={12} />}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-[10px] font-mono ${isActive ? 'text-text-muted' : 'text-text-faint'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-6 border-b border-border-subtle ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              relative pb-3 inline-flex items-center gap-2 text-sm font-medium transition-colors
              ${isActive ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'}
            `}
          >
            {Icon && <Icon size={14} />}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-bg-hover text-text-secondary' : 'bg-bg-elevated text-text-muted'
                }`}
              >
                {tab.count}
              </span>
            )}
            {isActive && (
              <span
                className="absolute -bottom-px left-0 right-0 h-0.5 rounded-t"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function useTabs(defaultTab: string) {
  const [active, setActive] = useState(defaultTab);
  return { active, setActive };
}
