import React from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  suggestions?: Array<{ label: string; onClick: () => void }>;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  suggestions,
  compact = false,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={[
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
        {icon}
      </div>

      <h3
        className={`mt-4 font-semibold text-white/80 ${compact ? 'text-sm' : 'text-base'}`}
      >
        {title}
      </h3>

      {description && (
        <p
          className={`mt-1.5 max-w-sm text-white/40 ${compact ? 'text-xs' : 'text-sm'} leading-relaxed`}
        >
          {description}
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {suggestions.map((s, i) => (
            <motion.button
              key={i}
              type="button"
              onClick={s.onClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-white/60 transition-colors hover:border-[#7c5cfc]/30 hover:bg-[#7c5cfc]/[0.06] hover:text-white/80"
            >
              {s.label}
            </motion.button>
          ))}
        </div>
      )}

      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
