/**
 * Button — primary / secondary / ghost / destructive variants.
 * Designed to feel responsive: scale 0.98 on active, ring on focus, smooth color change.
 */

import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'accent';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-text-primary text-bg-canvas hover:bg-text-primary/90 focus-visible:ring-text-primary',
  accent:
    'bg-[color:var(--accent)] text-bg-canvas hover:bg-[color:var(--accent-strong)] focus-visible:ring-[color:var(--accent)] shadow-[0_0_0_1px_oklch(0.82_0.16_195/0.3),0_4px_24px_oklch(0.82_0.16_195/0.25)]',
  secondary:
    'bg-bg-hover text-text-primary border border-border-default hover:bg-bg-active hover:border-border-strong',
  ghost:
    'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary',
  destructive:
    'bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger)] border border-[color:var(--status-danger)]/30 hover:bg-[color:var(--status-danger-bg)] hover:border-[color:var(--status-danger)]/50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading,
      icon,
      iconRight,
      className = '',
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center font-medium rounded-md
          transition-all duration-150 ease-out
          active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-canvas
          ${VARIANTS[variant]}
          ${SIZES[size]}
          ${className}
        `}
        {...props}
      >
        {loading ? (
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          icon
        )}
        {children}
        {iconRight}
      </button>
    );
  },
);
Button.displayName = 'Button';
