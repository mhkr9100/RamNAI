import React, { forwardRef } from 'react';
import { LoaderCircle } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gray-900 text-white hover:bg-black active:bg-black/90 dark:bg-white dark:text-[#06070a] dark:hover:bg-white/90 dark:active:bg-white/80 border-transparent shadow-sm',
  secondary:
    'bg-black/[0.04] text-slate-700 hover:bg-black/[0.07] hover:text-slate-900 active:bg-black/[0.10] border-black/10 hover:border-black/15 dark:bg-white/[0.06] dark:text-white/80 dark:hover:bg-white/[0.10] dark:hover:text-white dark:active:bg-white/[0.14] dark:border-white/[0.10] dark:hover:border-white/[0.16]',
  ghost:
    'bg-transparent text-slate-500 hover:bg-black/[0.05] hover:text-slate-900 active:bg-black/[0.08] border-transparent dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white/85 dark:active:bg-white/[0.10]',
  danger:
    'bg-[#f87171]/[0.12] text-[#b91c1c] hover:bg-[#f87171]/[0.20] hover:text-[#991b1b] active:bg-[#f87171]/[0.28] border-[#f87171]/[0.20] dark:text-[#fca5a5] dark:hover:text-[#fecaca]',
  brand:
    'bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-white/90 active:bg-black/90 dark:active:bg-white/80 border-transparent shadow-sm',
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-lg',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-4 text-[13px] gap-2 rounded-xl',
  lg: 'h-11 px-5 text-sm gap-2.5 rounded-xl',
};

const iconSizes: Record<ButtonSize, number> = { xs: 12, sm: 13, md: 14, lg: 16 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      icon,
      iconRight,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        className={[
          'inline-flex items-center justify-center border font-medium transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0e1117]',
          'disabled:pointer-events-none disabled:opacity-45',
          'select-none whitespace-nowrap',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth ? 'w-full' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {loading ? (
          <LoaderCircle size={iconSizes[size]} className="animate-spin" />
        ) : icon ? (
          <span className="shrink-0 flex items-center">{icon}</span>
        ) : null}
        {children && <span>{children}</span>}
        {iconRight && !loading ? (
          <span className="shrink-0 flex items-center">{iconRight}</span>
        ) : null}
      </button>
    );
  },
);

Button.displayName = 'Button';
