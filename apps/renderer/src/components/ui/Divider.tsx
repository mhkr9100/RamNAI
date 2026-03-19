import React from 'react';

interface DividerProps {
  label?: string;
  className?: string;
  vertical?: boolean;
}

export function Divider({ label, className = '', vertical = false }: DividerProps) {
  if (vertical) {
    return <div className={`w-px self-stretch bg-white/[0.08] ${className}`} />;
  }

  if (label) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/25 select-none">
          {label}
        </span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>
    );
  }

  return <div className={`h-px w-full bg-white/[0.08] ${className}`} />;
}
