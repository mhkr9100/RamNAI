import React from 'react';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export interface EmptyChatProps {
  agentName?: string;
  agentRole?: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
}

export const EmptyChat: React.FC<EmptyChatProps> = ({
  agentName = 'Raman AI',
  agentRole = 'Start a conversation',
  suggestions = [
    "What can you help me with?",
    "Tell me about your capabilities",
    "Let's get started"
  ],
  onSuggestionClick
}) => {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[400px] px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center text-center max-w-lg"
      >
        <div className="w-16 h-16 bg-surface-3 dark:bg-[#141720] border border-black/8 dark:border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
          <Sparkles className="w-8 h-8 text-emerald-500 dark:text-emerald-300" />
        </div>
        
        <h2 className="mb-2 text-2xl font-semibold text-slate-900 dark:text-white">
          {agentName}
        </h2>
        
        <p className="mb-10 text-sm text-slate-500 dark:text-white/60">
          {agentRole}
        </p>

        <div className="flex flex-col gap-3 w-full max-w-md">
          {suggestions.map((suggestion, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              onClick={() => onSuggestionClick?.(suggestion)}
              className="px-5 py-3 rounded-xl bg-surface-3 dark:bg-[#141720] border border-black/8 dark:border-white/5 text-sm text-slate-700 dark:text-white/80 hover:bg-black/[0.04] dark:hover:bg-white/5 hover:border-black/15 dark:hover:border-white/10 transition-all text-left flex items-center justify-between group"
            >
              <span>{suggestion}</span>
              <span className="text-emerald-500 dark:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity transform -translate-x-2 group-hover:translate-x-0">
                →
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
