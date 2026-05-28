'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZES = {
  sm: 'max-w-[420px]',
  md: 'max-w-[540px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[960px]',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-float-in"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div
        className={`relative w-full ${SIZES[size]} surface-elevated rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.6)] overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="px-6 pt-5 pb-4 border-b border-border-subtle flex items-start justify-between gap-4">
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold">{title}</h2>}
              {description && <p className="text-xs text-text-muted mt-1">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-border-subtle bg-bg-canvas/40 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
