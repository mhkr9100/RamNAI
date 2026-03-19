import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
  children: React.ReactNode;
}

const positionClasses: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

const origins = {
  top: { initial: { opacity: 0, y: 4, scale: 0.96 } },
  bottom: { initial: { opacity: 0, y: -4, scale: 0.96 } },
  left: { initial: { opacity: 0, x: 4, scale: 0.96 } },
  right: { initial: { opacity: 0, x: -4, scale: 0.96 } },
} as const;

export function Tooltip({
  content,
  side = 'top',
  delay = 400,
  className = '',
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            {...origins[side]}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] as const }}
            className={`absolute z-[70] pointer-events-none ${positionClasses[side]} ${className}`}
          >
            <div className="rounded-lg border border-white/[0.12] bg-[#1a1e28] px-2.5 py-1.5 text-[11px] font-medium text-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.5)] whitespace-nowrap">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
