import React, { useEffect, useState, useRef } from 'react';
import { FolderKanban, Info, Send, Trash2 } from 'lucide-react';
import type { ChatTranscriptMessage, PersistentChatbotIdentity } from './types';
import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';
import { EmptyChat } from './EmptyChat';
import { Button, Badge } from '../ui';
import { motion } from 'framer-motion';

export interface PersistentChatbotChatViewProps {
  chatbot: PersistentChatbotIdentity;
  transcript: ChatTranscriptMessage[];
  busy?: boolean;
  /** When set, that transcript row is the in-flight streamed assistant reply */
  streamingMessageId?: string | null;
  emptyState?: string;
  placeholder?: string;
  sendLabel?: string;
  taskLabel?: string;
  onSendMessage: (message: string) => Promise<void> | void;
  onTaskClick?: () => void;
  onProfileClick?: () => void;
  onResetThread?: () => Promise<void> | void;
  draftSeed?: { token: string; text: string } | null;
}

export function PersistentChatbotChatView({
  chatbot,
  transcript,
  busy = false,
  streamingMessageId = null,
  emptyState = 'No messages yet.',
  placeholder = 'Message this agent...',
  sendLabel = 'Send',
  taskLabel = 'Task',
  onSendMessage,
  onTaskClick,
  onProfileClick,
  onResetThread,
  draftSeed
}: PersistentChatbotChatViewProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!draftSeed) return;
    setDraft((current) => (current ? `${current}\n\n${draftSeed.text}` : draftSeed.text));
  }, [draftSeed]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, busy]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) {
      return;
    }

    setDraft('');
    await onSendMessage(message);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setDraft(suggestion);
  };

  return (
    <section className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-black/8 bg-surface-2 dark:border-white/[0.08]">
      <header className="shrink-0 border-b border-black/8 bg-surface-1 px-4 py-3 dark:border-white/[0.06]">
        <div className="flex h-full flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/8 bg-surface-3 text-sm dark:border-white/[0.08]">
              🤖
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500 dark:text-white/40">{chatbot.role}</div>
              <h1 className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white/90">{chatbot.name}</h1>
              {(chatbot.description || chatbot.providerLabel || chatbot.modelLabel) ? (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {chatbot.description ? (
                    <span className="max-w-[20rem] truncate text-xs text-slate-500 dark:text-white/45">
                      {chatbot.description}
                    </span>
                  ) : null}
                  {chatbot.providerLabel ? (
                    <Badge variant="outline" size="xs">{chatbot.providerLabel}</Badge>
                  ) : null}
                  {chatbot.modelLabel ? (
                    <Badge variant="default" size="xs">{chatbot.modelLabel}</Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {chatbot.runtimeStatus ? <StatusBadge {...chatbot.runtimeStatus} /> : null}
            {chatbot.threadStatus ? <StatusBadge {...chatbot.threadStatus} /> : null}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onProfileClick}
              disabled={!onProfileClick}
              icon={<Info size={12} />}
            >
              Profile
            </Button>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => onResetThread?.()}
              disabled={!onResetThread || busy}
              icon={<Trash2 size={12} />}
            >
              Reset
            </Button>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar scroll-smooth">
        {transcript.length === 0 ? (
          <EmptyChat 
            agentName={chatbot.name} 
            agentRole={chatbot.role} 
            onSuggestionClick={handleSuggestionClick}
          />
        ) : (
          <motion.div layout className="space-y-2">
            {transcript.map((message) => (
              streamingMessageId && message.id === streamingMessageId && busy && message.role === 'assistant' && !message.text.trim() ? (
                <TypingIndicator key={message.id} agentName={message.label || chatbot.name} />
              ) : (
                <ChatMessage
                  key={message.id}
                  role={message.role as any}
                  text={message.text}
                  agentName={message.label || (message.role !== 'user' ? chatbot.name : undefined)}
                  timestamp={message.timestamp}
                  isStreaming={Boolean(streamingMessageId && message.id === streamingMessageId && busy)}
                />
              )
            ))}
            {busy && !streamingMessageId ? (
              <TypingIndicator agentName={chatbot.name} />
            ) : null}
          </motion.div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-black/8 bg-surface-2 px-6 pb-6 pt-4 dark:border-white/[0.06]">
        <div className="mx-auto max-w-[46rem]">
          <div className="flex items-end gap-3 rounded-2xl border border-black/8 bg-surface-3 px-3 py-2.5 shadow-sm transition-colors focus-within:border-brand/50 focus-within:bg-surface-4 dark:border-white/[0.08]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onTaskClick}
              disabled={!onTaskClick || busy}
              icon={<FolderKanban size={16} />}
              className="mb-0.5 !px-2"
              title={taskLabel}
            />
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim() && !busy) {
                    const event = new Event('submit', { bubbles: true, cancelable: true });
                    e.currentTarget.form?.dispatchEvent(event);
                  }
                }
              }}
              rows={1}
              className="max-h-[160px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 dark:text-white/90 dark:placeholder:text-white/30"
              placeholder={placeholder}
            />
            <Button
              type="submit"
              variant={draft.trim() ? "brand" : "secondary"}
              size="sm"
              disabled={busy || !draft.trim()}
              icon={<Send size={15} />}
              className="mb-0.5 !px-2.5"
              title={sendLabel}
            />
          </div>
        </div>
      </form>
    </section>
  );
}

function StatusBadge({ label, tone }: NonNullable<PersistentChatbotIdentity['runtimeStatus']>) {
  const variant = tone === 'ready'
    ? 'success'
    : tone === 'active'
      ? 'info'
      : 'warning';

  return <Badge variant={variant} size="xs">{label}</Badge>;
}
