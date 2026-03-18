import React, { useMemo, useState } from 'react';
import { Bot, FolderKanban, Send, Sparkles } from 'lucide-react';
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
}

export function PersistentChatbotChatView({
  chatbot,
  transcript,
  busy = false,
  emptyState = 'This chatbot has not been sent a message yet.',
  placeholder = 'Ask this chatbot a direct question, hand it a context note, or tell it what to remember.',
  sendLabel = 'Send',
  taskLabel = 'Task',
  onSendMessage,
  onTaskClick
}: PersistentChatbotChatViewProps) {
  const [draft, setDraft] = useState('');

  const transcriptSummary = useMemo(() => {
    const userCount = transcript.filter((message) => message.role === 'user').length;
    const assistantCount = transcript.filter((message) => message.role === 'assistant').length;

    return {
      userCount,
      assistantCount
    };
  }, [transcript]);

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
    <section className="space-y-8">
      <div className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_36%),linear-gradient(135deg,#0f1215,#090b0d)] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
              <Sparkles size={14} /> Chatbot
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white">{chatbot.name}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/60">
              {chatbot.description || 'Persistent chatbot surface with a transcript and composer.'}
            </p>
          </div>
          <div className="grid w-full gap-3 sm:w-[340px]">
            {[
              ['Role', chatbot.role],
              ['Model', chatbot.modelLabel || 'Unspecified'],
              ['Provider', chatbot.providerLabel || 'Unspecified']
            ].map(([title, value]) => (
              <div key={title} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/42">{title}</div>
                <div className="mt-2 text-sm leading-6 text-white/66">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Transcript</div>
            <div className="mt-2 text-2xl font-semibold text-white">Persistent conversation</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
            <Bot size={16} />
          </div>
        </div>

        {transcript.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
            {emptyState}
          </div>
        ) : (
          <div className="space-y-4">
            {transcript.map((message) => (
              <article
                key={message.id}
                className={`rounded-[28px] border px-5 py-4 ${
                  message.role === 'user'
                    ? 'border-white/10 bg-black/35'
                    : message.role === 'assistant'
                      ? 'border-emerald-400/15 bg-emerald-400/10'
                      : 'border-white/10 bg-white/5'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  <span>{message.label || message.role}</span>
                  {message.timestamp ? <span className="text-white/24">· {message.timestamp}</span> : null}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-7 text-white/78">{message.text}</div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-6">
        <div className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Composer</div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-[148px] flex-1 rounded-[28px] border border-white/10 bg-black/25 px-5 py-5 text-sm leading-7 text-white outline-none transition focus:border-white/25"
              placeholder={placeholder}
            />
            <div className="flex gap-3 xl:w-[220px] xl:flex-col">
              <button
                type="button"
                onClick={onTaskClick}
                disabled={!onTaskClick || busy}
                className="inline-flex flex-1 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-white/72 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                title={onTaskClick ? taskLabel : 'Task actions are not wired yet.'}
              >
                <FolderKanban size={15} />
                {taskLabel}
              </button>
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="inline-flex flex-1 items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Sending...' : sendLabel}
                <Send size={15} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm leading-6 text-white/48">
            <div>
              {transcriptSummary.userCount} user message{transcriptSummary.userCount === 1 ? '' : 's'} and {transcriptSummary.assistantCount}{' '}
              assistant message{transcriptSummary.assistantCount === 1 ? '' : 's'} in this thread.
            </div>
            <div>Persistent chatbot chat surface ready for App integration.</div>
          </div>
        </form>
      </section>
    </section>
  );
}

