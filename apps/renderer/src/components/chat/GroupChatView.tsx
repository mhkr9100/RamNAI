import React, { useMemo, useRef, useState } from 'react';
import { AtSign, BrainCircuit, Send, Users2 } from 'lucide-react';
import type { ChatTranscriptMessage, GroupChatIdentity, MentionableParticipant } from './types';

export interface GroupChatViewProps {
  group: GroupChatIdentity;
  members: MentionableParticipant[];
  transcript: ChatTranscriptMessage[];
  busy?: boolean;
  emptyState?: string;
  placeholder?: string;
  sendLabel?: string;
  onSendMessage?: (message: string) => Promise<void> | void;
}

interface MentionRange {
  start: number;
  end: number;
  query: string;
}

export function GroupChatView({
  group,
  members,
  transcript,
  busy = false,
  emptyState = 'No group messages yet.',
  placeholder = 'Compose a note and use @ to mention a teammate or chatbot.',
  sendLabel = 'Send',
  onSendMessage
}: GroupChatViewProps) {
  const [draft, setDraft] = useState('');
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const mentionMatches = useMemo(() => {
    if (!mentionRange) {
      return members;
    }

    const query = mentionRange.query.trim().toLowerCase();
    if (!query) {
      return members;
    }

    return members.filter((member) => {
      const label = member.label.toLowerCase();
      const handle = member.handle?.toLowerCase() || '';
      return label.includes(query) || handle.includes(query);
    });
  }, [members, mentionRange]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextDraft = event.target.value;
    const cursor = event.target.selectionStart ?? nextDraft.length;
    const prefix = nextDraft.slice(0, cursor);
    const triggerIndex = prefix.lastIndexOf('@');
    const token = triggerIndex >= 0 ? prefix.slice(triggerIndex) : '';
    const matchesMentionPattern = /(^|\s)@[\w.-]*$/.test(prefix);

    setDraft(nextDraft);

    if (matchesMentionPattern && token.startsWith('@')) {
      setMentionRange({
        start: triggerIndex,
        end: cursor,
        query: token.slice(1)
      });
      return;
    }

    setMentionRange(null);
  };

  const insertMention = (participant: MentionableParticipant) => {
    const token = `@${participant.label} `;
    const range = mentionRange;
    const nextDraft =
      range && range.start >= 0
        ? `${draft.slice(0, range.start)}${token}${draft.slice(range.end)}`
        : `${draft}${draft && !draft.endsWith(' ') ? ' ' : ''}${token}`;

    setDraft(nextDraft);
    setMentionRange(null);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      const selection = range ? range.start + token.length : nextDraft.length;
      textarea.focus();
      textarea.setSelectionRange(selection, selection);
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy || !onSendMessage) {
      return;
    }

    setDraft('');
    setMentionRange(null);
    await onSendMessage(message);
  };

  return (
    <section className="space-y-8">
      <div className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.10),transparent_34%),linear-gradient(135deg,#0f1215,#090b0d)] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
              <BrainCircuit size={14} /> Group
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white">{group.name}</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/60">
              {group.description || 'Manual @mention collaboration surface for a live group thread.'}
            </p>
          </div>
          <div className="grid w-full gap-3 sm:w-[340px]">
            {[
              ['Group ID', group.id],
              ['Members', String(group.memberCount ?? members.length)],
              ['Composition', onSendMessage ? 'Backend-ready' : 'UI-only preview']
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
            <div className="mt-2 text-2xl font-semibold text-white">Group conversation</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
            <Users2 size={16} />
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
                      ? 'border-sky-400/15 bg-sky-400/10'
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
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-white/8 bg-black/20 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">
                <AtSign size={14} />
                Quick mentions
              </div>
              <div className="flex flex-wrap gap-2">
                {members.length === 0 ? (
                  <div className="text-sm text-white/45">No mention targets configured yet.</div>
                ) : (
                  members.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => insertMention(member)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/70 transition hover:border-white/20 hover:text-white"
                      title={member.subtitle || member.handle || member.label}
                    >
                      @{member.label}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <div className="flex-1 space-y-3">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={handleChange}
                  className="min-h-[148px] w-full rounded-[28px] border border-white/10 bg-black/25 px-5 py-5 text-sm leading-7 text-white outline-none transition focus:border-white/25"
                  placeholder={placeholder}
                />
                {mentionRange && mentionMatches.length > 0 ? (
                  <div className="rounded-3xl border border-white/8 bg-black/30 p-3">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Mention suggestions</div>
                    <div className="flex flex-wrap gap-2">
                      {mentionMatches.slice(0, 6).map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => insertMention(member)}
                          className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/78 transition hover:border-white/20 hover:text-white"
                        >
                          <div className="font-semibold">{member.label}</div>
                          {member.subtitle ? <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">{member.subtitle}</div> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={busy || !onSendMessage || !draft.trim()}
                className="inline-flex xl:w-[220px] items-center justify-center gap-3 rounded-2xl bg-white px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                title={onSendMessage ? sendLabel : 'Wire the backend message handler to enable sending.'}
              >
                {onSendMessage ? (busy ? 'Sending...' : sendLabel) : 'Compose only'}
                <Send size={15} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm leading-6 text-white/48">
            <div>
              Manual @mention composition is fully local. No response is fabricated here.
            </div>
            <div>{onSendMessage ? 'Send hook available.' : 'Send hook pending.'}</div>
          </div>
        </form>
      </section>
    </section>
  );
}

