import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}

export function PageHeader({ eyebrow, title, description, back, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-6 flex-wrap">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors mb-2"
          >
            <ChevronLeft size={12} />
            {back.label}
          </Link>
        )}
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1.5">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-text-muted mt-1.5 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
