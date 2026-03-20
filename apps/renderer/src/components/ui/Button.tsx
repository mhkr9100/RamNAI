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
    'bg-white text-[#06070a] hover:bg-white/90 active:bg-white/80 border-transparent shadow-sm',
  secondary:
    'bg-white/[0.06] text-white/80 hover:bg-white/[0.10] hover:text-white active:bg-white/[0.14] border-white/[0.10] hover:border-white/[0.16]',
  ghost:
    'bg-transparent text-white/60 hover:bg-white/[0.06] hover:text-white/85 active:bg-white/[0.10] border-transparent',
  danger:
    'bg-[#f87171]/[0.12] text-[#fca5a5] hover:bg-[#f87171]/[0.20] hover:text-[#fecaca] active:bg-[#f87171]/[0.28] border-[#f87171]/[0.20]',
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
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0e1117]',
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
