'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  value: string;
  label?: string;
  size?: number;
}

export function CopyButton({ value, label = 'copy', size = 11 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (e.g. iframe) — silently noop.
    }
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      className="text-[10px] text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors"
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
      {copied ? 'copied' : label}
    </button>
  );
}
