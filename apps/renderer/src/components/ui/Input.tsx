import React, { forwardRef } from 'react';

type InputSize = 'sm' | 'md' | 'lg';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: InputSize;
  label?: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const sizeClasses: Record<InputSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-9 px-3.5 text-[13px] rounded-xl',
  lg: 'h-11 px-4 text-sm rounded-xl',
};

const iconPadding: Record<InputSize, string> = {
  sm: 'pl-8',
  md: 'pl-9',
  lg: 'pl-10',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = 'md', label, hint, error, icon, iconRight, className = '', id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const descriptionId = inputId ? `${inputId}-description` : undefined;
    const hasError = Boolean(error);

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500 dark:text-white/50"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/28">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={hasError}
            aria-describedby={(hint || error) ? descriptionId : undefined}
            className={[
              'w-full bg-white dark:bg-[#0a0c10] text-slate-900 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/25 outline-none border transition-all duration-150',
              hasError
                ? 'border-[#f87171]/40 focus:border-[#f87171]/60 focus:ring-2 focus:ring-[#f87171]/20'
                : 'border-black/10 hover:border-black/18 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/[0.10] dark:hover:border-white/[0.16]',
              sizeClasses[inputSize],
              icon ? iconPadding[inputSize] : '',
              iconRight ? 'pr-9' : '',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            {...rest}
          />
          {iconRight && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/35">
              {iconRight}
            </span>
          )}
        </div>
        {(hint || error) && (
          <p
            id={descriptionId}
            className={`text-[11px] ${hasError ? 'text-[#ef4444] dark:text-[#fca5a5]' : 'text-slate-500 dark:text-white/35'}`}
            {...(hasError ? { role: 'alert' } : {})}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className = '', id, ...rest }, ref) => {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const descriptionId = textareaId ? `${textareaId}-description` : undefined;
    const hasError = Boolean(error);

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500 dark:text-white/50"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={hasError}
          aria-describedby={(hint || error) ? descriptionId : undefined}
          className={[
            'w-full bg-white dark:bg-[#0a0c10] text-slate-900 dark:text-white/90 placeholder:text-slate-400 dark:placeholder:text-white/25 outline-none border transition-all duration-150',
            'min-h-[80px] resize-none rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed',
            hasError
              ? 'border-[#f87171]/40 focus:border-[#f87171]/60 focus:ring-2 focus:ring-[#f87171]/20'
              : 'border-black/10 hover:border-black/18 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/[0.10] dark:hover:border-white/[0.16]',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        />
        {(hint || error) && (
          <p
            id={descriptionId}
            className={`text-[11px] ${hasError ? 'text-[#ef4444] dark:text-[#fca5a5]' : 'text-slate-500 dark:text-white/35'}`}
            {...(hasError ? { role: 'alert' } : {})}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: InputSize;
  label?: string;
  hint?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ inputSize = 'md', label, hint, options, className = '', id, ...rest }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const descriptionId = selectId ? `${selectId}-description` : undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500 dark:text-white/50"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-describedby={hint ? descriptionId : undefined}
          className={[
            'w-full bg-white dark:bg-[#0a0c10] text-slate-900 dark:text-white/90 outline-none border transition-all duration-150',
            'border-black/10 hover:border-black/18 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/[0.10] dark:hover:border-white/[0.16]',
            sizeClasses[inputSize],
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {hint && <p id={descriptionId} className="text-[11px] text-slate-500 dark:text-white/35">{hint}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
