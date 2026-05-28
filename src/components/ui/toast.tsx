'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Check, X, AlertCircle, Info } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  show: (toast: Omit<ToastItem, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newToast = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);
      const duration = toast.duration ?? 4500;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    show,
    success: (title, description) => show({ variant: 'success', title, description }),
    error: (title, description) => show({ variant: 'error', title, description, duration: 6000 }),
    info: (title, description) => show({ variant: 'info', title, description }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-[360px] pointer-events-none">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const VARIANT_CONFIG: Record<ToastVariant, { icon: typeof Check; color: string; bg: string }> = {
  success: { icon: Check, color: 'var(--status-success)', bg: 'var(--status-success-bg)' },
  error: { icon: AlertCircle, color: 'var(--status-danger)', bg: 'var(--status-danger-bg)' },
  warning: { icon: AlertCircle, color: 'var(--status-warning)', bg: 'var(--status-warning-bg)' },
  info: { icon: Info, color: 'var(--status-info)', bg: 'var(--status-info-bg)' },
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const cfg = VARIANT_CONFIG[toast.variant];
  const Icon = cfg.icon;

  return (
    <div
      className={`
        pointer-events-auto surface-elevated rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)]
        px-4 py-3 flex items-start gap-3 border
        transition-all duration-200
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
      style={{ borderColor: `${cfg.color}33` }}
    >
      <div
        className="h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary">{toast.title}</div>
        {toast.description && (
          <div className="text-xs text-text-muted mt-0.5 break-words">{toast.description}</div>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="text-text-faint hover:text-text-secondary transition-colors flex-shrink-0 mt-0.5"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside <ToastProvider>');
  return ctx;
}
