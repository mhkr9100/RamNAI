import React from 'react';
import { motion } from 'framer-motion';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: string | undefined;
  timestamp?: string | undefined;
  agentName?: string | undefined;
  isStreaming?: boolean | undefined;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  text,
  mode,
  timestamp,
  agentName,
  isStreaming
}) => {
  if (role === 'system') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center my-4"
      >
        <span className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 dark:text-white/40">System</span>
        <div className="max-w-[80%] text-center text-xs text-slate-500 dark:text-white/50">
          {text}
        </div>
      </motion.div>
    );
  }

  const isUser = role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col my-4 w-full ${isUser ? 'items-end' : 'items-start'}`}
    >
      <div className={`flex items-baseline gap-2 mb-1.5 px-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40">
          {isUser ? 'You' : (agentName || 'Assistant')}
        </span>
        {timestamp && (
          <span className="text-[10px] text-slate-400 dark:text-white/30">{timestamp}</span>
        )}
        {mode && !isUser && (
          <span className="rounded bg-black/6 px-1.5 py-0.5 text-[10px] text-[#7c3aed] dark:bg-white/10 dark:text-[#c4b5fd]">
            {mode}
          </span>
        )}
      </div>

      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-gray-900 dark:bg-white text-white dark:text-black rounded-tr-sm'
            : 'bg-surface-3 dark:bg-[#141720] text-slate-900 dark:text-white rounded-tl-sm shadow-sm'
        }`}
      >
        {isUser ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{text}</div>
        ) : (
          <div className="relative">
            <MarkdownRenderer content={text} />
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-slate-400 dark:bg-white/70 ml-1 align-middle animate-pulse" />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
