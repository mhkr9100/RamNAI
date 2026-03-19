import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AtSign, Send, Trash2 } from 'lucide-react';
import type { ChatTranscriptMessage, GroupChatIdentity, MentionableParticipant } from './types';
import { ChatMessage } from './ChatMessage';
import { TypingIndicator } from './TypingIndicator';
import { EmptyChat } from './EmptyChat';
import { Button, Badge } from '../ui';
import { motion } from 'framer-motion';

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript.length, busy]);

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
    <section className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-2">
      <header className="border-b border-white/[0.06] bg-surface-1 px-4 py-3.5 shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-surface-3 text-sm">
              👥
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-white/40">Group</div>
              <h1 className="mt-0.5 truncate text-sm font-semibold text-white/90">{group.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {group.runtimeStatus ? <StatusBadge {...group.runtimeStatus} /> : null}
            {group.threadStatus ? <StatusBadge {...group.threadStatus} /> : null}
            <Button
              type="button"
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RouteBadge label="Manual" active={group.routingMode !== 'auto'} />
          <RouteBadge label="Auto" active={group.routingMode === 'auto'} />
          <span className="text-[11px] text-white/40 ml-1">
            {group.routingMode === 'auto' ? 'Auto picks the best fit. Use @name to direct.' : 'Use @name to route replies.'}
          </span>
          {lastManualRoute.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 ml-4 border-l border-white/[0.08] pl-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-white/30">Last</span>
              {lastManualRoute.slice(0, 4).map((mention) => (
                <Badge key={mention} variant="default" size="xs">
                  @{mention}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar scroll-smooth">
        {transcript.length === 0 ? (
          <EmptyChat 
            agentName={group.name}
            agentRole={`Group with ${group.memberCount} members`}
            onSuggestionClick={(s) => setDraft(s)}
          />
        ) : (
          <motion.div layout className="space-y-4">
            {transcript.map((message) => (
              <div key={message.id} className="flex flex-col">
                <ChatMessage
                  role={message.role as any}
                  text={message.text}
                  agentName={message.label || (message.role !== 'user' ? group.name : undefined)}
                  timestamp={message.timestamp}
                  mode={message.route?.mode}
                />
                {message.route?.reason ? (
                  <div className={`mt-1 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} px-2`}>
                    <Badge variant="info" size="xs">
                      {message.route.reason}
                    </Badge>
                  </div>
                ) : null}
              </div>
            ))}
            {busy && (
              <TypingIndicator agentName="Group" />
            )}
          </motion.div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-white/[0.06] bg-surface-2 px-6 pb-6 pt-4 shrink-0">
        <div className="mx-auto flex max-w-[46rem] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 px-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-surface-3 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.04em] text-white/50">
              <AtSign size={12} />
              Route
            </div>
            {members.length === 0 ? (
              <span className="text-[11px] text-white/40 ml-1">No members.</span>
            ) : (
              members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => insertMention(member)}
                  className="rounded-full border border-white/[0.08] bg-surface-3 px-2.5 py-1 text-[11px] font-medium text-white/70 transition-colors hover:border-brand/40 hover:bg-brand/10 hover:text-brand-light"
                >
                  @{member.label}
                </button>
              ))
            )}
          </div>

          <div className="flex items-end gap-3 rounded-2xl border border-white/[0.08] bg-surface-3 px-3 py-2.5 shadow-sm transition-colors focus-within:border-brand/50 focus-within:bg-surface-4 relative">
            <div className="flex-1 space-y-2.5">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={handleChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (draft.trim() && !busy && onSendMessage) {
                      const event = new Event('submit', { bubbles: true, cancelable: true });
                      e.currentTarget.form?.dispatchEvent(event);
                    }
                  }
                }}
                rows={1}
                className="max-h-[160px] min-h-[40px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-relaxed text-white/90 outline-none placeholder:text-white/30"
                placeholder={placeholder}
              />
              {mentionRange && mentionMatches.length > 0 ? (
                <div className="absolute bottom-full left-0 mb-2 w-full max-w-sm rounded-xl border border-white/[0.10] bg-surface-4 p-2 shadow-xl z-10">
                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                    {mentionMatches.slice(0, 6).map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => insertMention(member)}
                        className="rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-white/[0.06] hover:border-white/[0.08]"
                      >
                        <div className="text-sm font-medium text-white/90">{member.label}</div>
                        {member.subtitle ? <div className="text-[10px] uppercase tracking-[0.04em] text-white/40 mt-0.5">{member.subtitle}</div> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <Button
              type="submit"
              variant={draft.trim() ? "brand" : "secondary"}
              size="sm"
              disabled={busy || !onSendMessage || !draft.trim()}
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

function StatusBadge({ label, tone }: NonNullable<GroupChatIdentity['runtimeStatus']>) {
  const variant = tone === 'ready'
    ? 'success'
    : tone === 'active'
      ? 'info'
      : 'warning';

  return <Badge variant={variant} size="xs">{label}</Badge>;
}

function RouteBadge({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <Badge variant={active ? 'brand' : 'outline'} size="xs">
      {label}
    </Badge>
  );
}
