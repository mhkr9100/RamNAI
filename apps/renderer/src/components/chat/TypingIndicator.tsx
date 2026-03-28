import React from 'react';
import { motion } from 'framer-motion';

export interface TypingIndicatorProps {
  agentName?: string;
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  agentName = 'Assistant',
  className = ''
}) => {
  const dotVariants = {
    initial: { y: 0 },
    animate: { y: -4 }
  };

  const transition = {
    duration: 0.5,
    repeat: Infinity,
    repeatType: 'reverse' as const,
    ease: 'easeInOut' as const,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-start my-4 w-full ${className}`}
    >
      <div className="flex items-baseline gap-2 mb-1.5 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
          {agentName}
        </span>
      </div>
      <div className="bg-surface-3 dark:bg-[#141720] rounded-2xl rounded-tl-sm shadow-sm px-4 py-3 flex items-center gap-1.5 h-11">
        <motion.div
          className="w-1.5 h-1.5 bg-slate-400 dark:bg-white/40 rounded-full"
          variants={dotVariants}
          initial="initial"
          animate="animate"
          transition={{ ...transition, delay: 0 }}
        />
        <motion.div
          className="w-1.5 h-1.5 bg-slate-400 dark:bg-white/40 rounded-full"
          variants={dotVariants}
          initial="initial"
          animate="animate"
          transition={{ ...transition, delay: 0.15 }}
        />
        <motion.div
          className="w-1.5 h-1.5 bg-slate-400 dark:bg-white/40 rounded-full"
          variants={dotVariants}
          initial="initial"
          animate="animate"
          transition={{ ...transition, delay: 0.3 }}
        />
        <span className="ml-2 text-xs text-slate-400 dark:text-white/40">{agentName} is thinking...</span>
      </div>
    </motion.div>
  );
};
