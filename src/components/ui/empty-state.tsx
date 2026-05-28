import Link from 'next/link';
import React from 'react';

interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  cta?: {
    label: string;
    href?: string;
    onClick?: () => void;
    variant?: 'accent' | 'secondary';
  };
  secondary?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  secondary,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center py-12 px-6 ${className}`}>
      {Icon && (
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[color:var(--accent-glow)] mb-4">
          <Icon size={20} className="text-[color:var(--accent)]" />
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-text-muted mt-1.5 max-w-md mx-auto">{description}</p>
      )}
      {(cta || secondary) && (
        <div className="mt-5 flex items-center gap-2">
          {cta &&
            (cta.href ? (
              <Link
                href={cta.href}
                className={
                  cta.variant === 'accent'
                    ? 'inline-flex h-9 items-center px-4 rounded-md bg-[color:var(--accent)] text-bg-canvas text-sm font-medium hover:bg-[color:var(--accent-strong)] transition-colors'
                    : 'inline-flex h-9 items-center px-4 rounded-md bg-bg-hover border border-border-default text-text-primary text-sm font-medium hover:bg-bg-active transition-colors'
                }
              >
                {cta.label}
              </Link>
            ) : (
              <button
                onClick={cta.onClick}
                className={
                  cta.variant === 'accent'
                    ? 'inline-flex h-9 items-center px-4 rounded-md bg-[color:var(--accent)] text-bg-canvas text-sm font-medium hover:bg-[color:var(--accent-strong)] transition-colors'
                    : 'inline-flex h-9 items-center px-4 rounded-md bg-bg-hover border border-border-default text-text-primary text-sm font-medium hover:bg-bg-active transition-colors'
                }
              >
                {cta.label}
              </button>
            ))}
          {secondary &&
            (secondary.href ? (
              <Link
                href={secondary.href}
                className="inline-flex h-9 items-center px-4 rounded-md text-text-secondary text-sm font-medium hover:bg-bg-hover transition-colors"
              >
                {secondary.label}
              </Link>
            ) : (
              <button
                onClick={secondary.onClick}
                className="inline-flex h-9 items-center px-4 rounded-md text-text-secondary text-sm font-medium hover:bg-bg-hover transition-colors"
              >
                {secondary.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
