'use client';

import { Search, X, Filter } from 'lucide-react';
import React, { useState } from 'react';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterChipProps {
  label: string;
  value?: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

export function FilterChip({ label, value, options, onChange }: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`
          inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[12px] font-medium
          transition-colors
          ${
            value
              ? 'border-[color:var(--accent)]/40 bg-[color:var(--accent-glow)] text-[color:var(--accent)]'
              : 'border-border-default bg-bg-elevated text-text-secondary hover:text-text-primary'
          }
        `}
      >
        {label}
        {selected && (
          <>
            <span className="text-text-muted">:</span>
            <span>{selected.label}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="ml-0.5 hover:text-text-primary cursor-pointer"
            >
              <X size={11} />
            </span>
          </>
        )}
        {!selected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 min-w-[160px] surface-elevated rounded-md shadow-[0_12px_32px_rgba(0,0,0,0.5)] overflow-hidden py-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`
                  block w-full text-left px-3 py-1.5 text-[12px]
                  ${
                    value === opt.value
                      ? 'bg-[color:var(--accent-glow)] text-[color:var(--accent)]'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="
          h-8 pl-9 pr-3 text-[12px] w-full
          bg-bg-elevated border border-border-default rounded-md
          text-text-primary placeholder:text-text-muted
          focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/20
        "
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter size={13} className="text-text-muted ml-1 mr-0.5" />
      {children}
    </div>
  );
}
