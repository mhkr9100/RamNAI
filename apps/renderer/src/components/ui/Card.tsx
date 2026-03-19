import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

type CardVariant = 'default' | 'elevated' | 'outline' | 'ghost' | 'brand';

interface CardProps extends HTMLMotionProps<'div'> {
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  animate?: boolean;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-[#141720] border border-white/[0.08]',
  elevated: 'bg-[#1a1e28] border border-white/[0.10] shadow-[0_4px_12px_rgba(0,0,0,0.4)]',
  outline: 'bg-transparent border border-white/[0.10] hover:border-white/[0.16]',
  ghost: 'bg-white/[0.03] border border-transparent',
  brand: 'bg-[#7c5cfc]/[0.08] border border-[#7c5cfc]/[0.20]',
};

const paddingClasses: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  variant = 'default',
  padding = 'md',
  animate = true,
  className = '',
  children,
  ...rest
}: CardProps) {
  const motionProps = animate
    ? {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] as const },
      }
    : {};

  return (
    <motion.div
      className={[
        'rounded-2xl transition-colors duration-150',
        variantClasses[variant],
        paddingClasses[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...motionProps}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, icon, action, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white/90 truncate">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-white/45 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface CardSectionProps {
  label?: string;
  children: React.ReactNode;
  className?: string;
}

export function CardSection({ label, children, className = '' }: CardSectionProps) {
  return (
    <div className={className}>
      {label && (
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-white/38">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
