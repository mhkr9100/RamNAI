import React, { useMemo, useRef, useState } from 'react';
import { AtSign, Send, Trash2 } from 'lucide-react';
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
  onResetThread?: () => Promise<void> | void;
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
  emptyState = 'No messages yet.',
  placeholder = 'Message the group',
  sendLabel = 'Send',
  onSendMessage,
  onResetThread
}: GroupChatViewProps) {
  const [draft, setDraft] = useState('');
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const lastManualRoute = useMemo(
    () => [...transcript].reverse().find((message) => message.role === 'user' && message.mentions?.length)?.mentions ?? [],
    [transcript]
  );

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
    <section className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1012]">
      <header className="border-b border-white/8 px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-sm">
              👥
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/38">Group</div>
              <h1 className="mt-1 truncate text-sm font-black uppercase tracking-[0.14em] text-white">{group.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {group.runtimeStatus ? <StatusBadge {...group.runtimeStatus} /> : null}
            {group.threadStatus ? <StatusBadge {...group.threadStatus} /> : null}
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RouteBadge label="Manual" active={group.routingMode !== 'auto'} />
          <RouteBadge label="Auto" active={group.routingMode === 'auto'} />
          <span className="text-[10px] text-white/38">
            {group.routingMode === 'auto' ? 'Auto picks the best fit. Use @name to direct.' : 'Use @name to route replies.'}
          </span>
          {lastManualRoute.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[8px] font-black uppercase tracking-[0.18em] text-white/30">Last</span>
              {lastManualRoute.slice(0, 4).map((mention) => (
                <span
                  key={mention}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-white/62"
                >
                  @{mention}
                </span>
              ))}
            </div>
          ) : null}
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
                  {message.route ? (
                    <span className={`rounded-full border px-2 py-0.5 text-[8px] ${message.role === 'user' ? 'border-black/10 bg-black/5 text-black/50' : 'border-white/10 bg-white/5 text-white/50'}`}>
                      {message.route.mode}
                    </span>
                  ) : null}
                </div>
                <div className={`whitespace-pre-wrap text-sm leading-6 ${message.role === 'user' ? 'text-black/82' : 'text-white/78'}`}>{message.text}</div>
                {message.route?.reason ? (
                  <div className={`mt-2 text-[10px] uppercase tracking-[0.16em] ${message.role === 'user' ? 'text-black/45' : 'text-white/35'}`}>
                    {message.route.reason}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-white/8 px-4 pb-4 pt-3">
        <div className="mx-auto flex max-w-[46rem] flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-white/48">
              <AtSign size={12} />
              Route
            </div>
            {members.length === 0 ? (
              <span className="text-[11px] text-white/35">No members.</span>
            ) : (
              members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => insertMention(member)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
                >
                  @{member.label}
                </button>
              ))
            )}
          </div>

          <div className="flex items-end gap-2.5 rounded-[26px] border border-white/10 bg-[#17191d] px-3 py-2.5">
            <div className="flex-1 space-y-2.5">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={handleChange}
                rows={1}
                className="max-h-[100px] min-h-[42px] w-full resize-none bg-transparent px-1 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/28"
                placeholder={placeholder}
              />
              {mentionRange && mentionMatches.length > 0 ? (
                <div className="rounded-2xl border border-white/8 bg-black/30 p-3">
                  <div className="flex flex-wrap gap-2">
                    {mentionMatches.slice(0, 6).map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => insertMention(member)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/78 transition hover:border-white/20 hover:text-white"
                      >
                        <div className="font-semibold">{member.label}</div>
                        {member.subtitle ? <div className="text-[10px] uppercase tracking-[0.16em] text-white/38">{member.subtitle}</div> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={busy || !onSendMessage || !draft.trim()}
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

function StatusBadge({ label, tone }: NonNullable<GroupChatIdentity['runtimeStatus']>) {
  const className = tone === 'ready'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
    : tone === 'active'
      ? 'border-sky-400/20 bg-sky-400/10 text-sky-200'
      : 'border-amber-400/20 bg-amber-400/10 text-amber-200';

  return <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] ${className}`}>{label}</div>;
}

function RouteBadge({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] ${
        active
          ? 'border-white/12 bg-white text-black'
          : 'border-white/10 bg-white/5 text-white/40'
      }`}
    >
      {label}
    </div>
  );
}
