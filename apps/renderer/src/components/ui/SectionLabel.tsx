import React from 'react';

interface SectionLabelProps {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}

export function SectionLabel({ children, count, action, className = '' }: SectionLabelProps) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/38">
          {children}
        </span>
        {count !== undefined && (
          <span className="inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[9px] font-bold text-white/35">
            {count}
          </span>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
