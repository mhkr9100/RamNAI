import React from 'react';

type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'error' | 'info' | 'outline';
type BadgeSize = 'xs' | 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-white/[0.06] text-white/65 border-white/[0.10]',
  brand: 'bg-[#7c5cfc]/[0.12] text-[#c4b5fd] border-[#7c5cfc]/[0.20]',
  success: 'bg-[#34d399]/[0.12] text-[#6ee7b7] border-[#34d399]/[0.20]',
  warning: 'bg-[#fbbf24]/[0.12] text-[#fde68a] border-[#fbbf24]/[0.20]',
  error: 'bg-[#f87171]/[0.12] text-[#fca5a5] border-[#f87171]/[0.20]',
  info: 'bg-[#38bdf8]/[0.12] text-[#7dd3fc] border-[#38bdf8]/[0.20]',
  outline: 'bg-transparent text-white/55 border-white/[0.12]',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-white/40',
  brand: 'bg-[#7c5cfc]',
  success: 'bg-[#34d399]',
  warning: 'bg-[#fbbf24]',
  error: 'bg-[#f87171]',
  info: 'bg-[#38bdf8]',
  outline: 'bg-white/40',
};

const sizeClasses: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[9px] gap-1',
  sm: 'px-2 py-0.5 text-[10px] gap-1.5',
  md: 'px-2.5 py-1 text-[11px] gap-1.5',
};

export function Badge({
  variant = 'default',
  size = 'sm',
  icon,
  dot = false,
  pulse = false,
  className = '',
  children,
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center border rounded-full font-semibold uppercase tracking-[0.03em] select-none whitespace-nowrap',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotColors[variant]}`}
            />
          )}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} />
        </span>
      )}
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children}
    </span>
  );
}

interface StatusDotProps {
  status: 'online' | 'offline' | 'busy' | 'error';
  label?: string;
  className?: string;
}

const statusColors: Record<StatusDotProps['status'], string> = {
  online: 'bg-[#34d399]',
  offline: 'bg-white/28',
  busy: 'bg-[#fbbf24]',
  error: 'bg-[#f87171]',
};

export function StatusDot({ status, label, className = '' }: StatusDotProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="relative flex h-2 w-2 shrink-0">
        {status === 'online' && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${statusColors[status]}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${statusColors[status]}`} />
      </span>
      {label && (
        <span className="text-[11px] font-medium text-white/55">{label}</span>
      )}
    </span>
  );
}
