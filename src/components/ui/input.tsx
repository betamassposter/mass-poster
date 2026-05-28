import React from 'react';

/**
 * Form inputs — match the dark editorial design.
 */

const BASE_CLASS = `
  w-full bg-bg-elevated text-text-primary placeholder:text-text-faint
  border border-border-default rounded-md
  px-3 py-2 text-sm
  transition-colors duration-150
  focus:border-[color:var(--accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30
  disabled:opacity-50 disabled:cursor-not-allowed
`;

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className = '', invalid, ...props }, ref) => (
  <input
    ref={ref}
    className={`${BASE_CLASS} ${invalid ? 'border-[color:var(--status-danger)]/60' : ''} ${className}`}
    {...props}
  />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className = '', children, ...props }, ref) => (
  <select
    ref={ref}
    className={`${BASE_CLASS} cursor-pointer pr-8 ${className}`}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = '', ...props }, ref) => (
  <textarea
    ref={ref}
    className={`${BASE_CLASS} font-mono resize-y min-h-[80px] ${className}`}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary tracking-wide">
        {label}
        {required && <span className="text-[color:var(--status-danger)]">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-[color:var(--status-danger)] flex items-center gap-1">
          ⚠ {error}
        </p>
      )}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
