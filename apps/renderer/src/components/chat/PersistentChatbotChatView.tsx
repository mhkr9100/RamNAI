import React, { useEffect, useState } from 'react';
import { FolderKanban, Send, Trash2 } from 'lucide-react';
import type { ChatTranscriptMessage, PersistentChatbotIdentity } from './types';

export interface PersistentChatbotChatViewProps {
  chatbot: PersistentChatbotIdentity;
  transcript: ChatTranscriptMessage[];
  busy?: boolean;
  emptyState?: string;
  placeholder?: string;
  sendLabel?: string;
  taskLabel?: string;
  onSendMessage: (message: string) => Promise<void> | void;
  onTaskClick?: () => void;
  onResetThread?: () => Promise<void> | void;
  draftSeed?: { token: string; text: string } | null;
}

export function PersistentChatbotChatView({
  chatbot,
  transcript,
  busy = false,
  emptyState = 'No messages yet.',
  placeholder = 'Message this chatbot',
  sendLabel = 'Send',
  taskLabel = 'Task',
  onSendMessage,
  onTaskClick,
  onResetThread,
  draftSeed
}: PersistentChatbotChatViewProps) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!draftSeed) return;
    setDraft((current) => (current ? `${current}\n\n${draftSeed.text}` : draftSeed.text));
  }, [draftSeed]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) {
      return;
    }

    setDraft('');
    await onSendMessage(message);
  };

  return (
    <section className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1012]">
      <header className="h-14 border-b border-white/8 px-4">
        <div className="flex h-full flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm">
              🤖
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/38">{chatbot.role}</div>
              <h1 className="mt-1 truncate text-sm font-black uppercase tracking-[0.14em] text-white">{chatbot.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {chatbot.runtimeStatus ? <StatusBadge {...chatbot.runtimeStatus} /> : null}
            {chatbot.threadStatus ? <StatusBadge {...chatbot.threadStatus} /> : null}
            <button
              type="button"
              onClick={() => onResetThread?.()}
              disabled={!onResetThread || busy}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"
            >
              <Trash2 size={14} />
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
        {transcript.length === 0 ? (
          <div className="flex h-full min-h-[240px] items-center justify-center rounded-[24px] border border-dashed border-white/12 bg-black/20 px-6 text-center text-sm leading-6 text-white/45">
            {busy ? 'Sending…' : emptyState}
          </div>
        ) : (
          <div className="space-y-2.5">
            {transcript.map((message) => (
              <article
                key={message.id}
                className={`rounded-[24px] border px-4 py-3 ${
                  message.role === 'user'
                    ? 'ml-auto max-w-[78%] border-white/10 bg-white text-black'
                    : message.role === 'assistant'
                      ? 'max-w-[84%] border-white/10 bg-black/30'
                      : 'max-w-[84%] border-white/10 bg-white/5'
                }`}
              >
                <div className={`mb-2 flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] ${message.role === 'user' ? 'text-black/45' : 'text-white/38'}`}>
                  <span>{message.label || message.role}</span>
                  {message.timestamp ? <span>{message.timestamp}</span> : null}
                </div>
                <div className={`whitespace-pre-wrap text-sm leading-6 ${message.role === 'user' ? 'text-black/82' : 'text-white/78'}`}>{message.text}</div>
              </article>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-white/8 px-4 pb-4 pt-3">
        <div className="mx-auto max-w-[46rem]">
          <div className="flex items-end gap-2.5 rounded-[26px] border border-white/10 bg-[#17191d] px-3 py-2.5">
            <button
              type="button"
              onClick={onTaskClick}
              disabled={!onTaskClick || busy}
              className="mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-white/55 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              title={taskLabel}
            >
              <FolderKanban size={15} />
            </button>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={1}
              className="max-h-[100px] min-h-[42px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/28"
              placeholder={placeholder}
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className={`mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                draft.trim()
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-white/5 text-white/25'
              } disabled:cursor-not-allowed disabled:opacity-60`}
              title={sendLabel}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function StatusBadge({ label, tone }: NonNullable<PersistentChatbotIdentity['runtimeStatus']>) {
  const className = tone === 'ready'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
    : tone === 'active'
      ? 'border-sky-400/20 bg-sky-400/10 text-sky-200'
      : 'border-amber-400/20 bg-amber-400/10 text-amber-200';

  return <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] ${className}`}>{label}</div>;
}
