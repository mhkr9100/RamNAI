import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUp,
  Bot,
  ChevronDown,
  Copy,
  History,
  Info,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import type { PrismMode } from '@supreme/shared';
import type { PrismProviderOverrideSettings, ProviderModelPreset } from '@supreme/shared';
import type { TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import { TaskComposerCard } from './TaskComposerCard';
import { PrismProfilePanel } from './PrismProfilePanel';
import { ChatMessage } from './chat/ChatMessage';
import { TypingIndicator } from './chat/TypingIndicator';
import { Button, Badge, Card, Input, SectionLabel, Divider, EmptyState } from './ui';

interface PrismMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: PrismMode | 'work';
}

interface PrismWorkspaceProps {
  snapshot: WorkspaceSnapshot;
  messages: PrismMessage[];
  busy: boolean;
  onSend: (mode: PrismMode, message: string) => Promise<void>;
  onCreateTask: (input: TaskCreateInput) => Promise<void>;
  onClearTranscript: () => void;
  prismOverride?: PrismProviderOverrideSettings | null;
  onSavePrismOverride?: (override: PrismProviderOverrideSettings | null) => Promise<void>;
}

const modes: Array<{
  id: PrismMode | 'task' | 'council';
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  description: string;
}> = [
  { id: 'ask', label: 'ASK PRISM', icon: Sparkles, description: 'Strategy, prompts, architecture' },
  { id: 'create', label: 'CREATE AGENTS', icon: Wand2, description: 'Design from an objective' },
  { id: 'task', label: 'SCHEDULE', icon: Bot, description: 'Queue a background job' },
  { id: 'council', label: 'COUNCIL', icon: Users, description: 'Multi-model debate & consensus' },
];

export function PrismWorkspace({
  snapshot,
  messages,
  busy,
  onSend,
  onCreateTask,
  onClearTranscript,
  prismOverride,
  onSavePrismOverride,
}: PrismWorkspaceProps) {
  const [activeMode, setActiveMode] = useState<PrismMode | 'task' | 'council'>('ask');
  const [message, setMessage] = useState('');
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [transcriptRoleFilter, setTranscriptRoleFilter] = useState<'all' | PrismMessage['role']>(
    'all',
  );
  const [newestFirst, setNewestFirst] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim() || activeMode === 'task' || activeMode === 'council') return;
    const next = message.trim();
    setMessage('');
    await onSend(activeMode, next);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit(event);
    }
  };

  const visibleMessages = useMemo(() => {
    const query = transcriptQuery.trim().toLowerCase();
    const filtered = messages.filter((entry) => {
      if (transcriptRoleFilter !== 'all' && entry.role !== transcriptRoleFilter) return false;
      if (!query) return true;
      return (
        entry.text.toLowerCase().includes(query) ||
        (entry.mode ?? '').toLowerCase().includes(query)
      );
    });
    return newestFirst ? [...filtered].reverse() : filtered;
  }, [messages, newestFirst, transcriptQuery, transcriptRoleFilter]);

  const latestUserMessage = useMemo(
    () => [...messages].reverse().find((entry) => entry.role === 'user'),
    [messages],
  );

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((entry) => entry.role === 'assistant'),
    [messages],
  );

  const copyVisibleTranscript = async () => {
    const text = visibleMessages
      .map((entry) => `[${entry.role}${entry.mode ? ` · ${entry.mode}` : ''}] ${entry.text}`)
      .join('\n\n');
    if (!text.trim()) {
      setCopyNotice('Nothing to copy.');
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopyNotice('Copied.');
    setTimeout(() => setCopyNotice(null), 2000);
  };

  const activeConfig = modes.find((m) => m.id === activeMode) ?? modes[0]!;

  return (
    <div className="space-y-4">
      <section className="flex min-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-1">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.08]">
              <Sparkles size={16} className="text-brand-light" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white">{activeConfig.label}</h2>
              <p className="text-[11px] text-white/35">{activeConfig.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode pills */}
            <div className="flex items-center rounded-xl border border-white/[0.06] bg-surface-0/50 p-0.5">
              {modes.map((mode) => {
                const active = mode.id === activeMode;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setActiveMode(mode.id)}
                    className={[
                      'relative rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150',
                      active ? 'text-white' : 'text-white/45 hover:text-white/70',
                    ].join(' ')}
                  >
                    {active && (
                      <motion.div
                        layoutId="prism-mode"
                        className="absolute inset-0 rounded-lg bg-brand/[0.15] border border-brand/20"
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      />
                    )}
                    <span className="relative z-10">{mode.label}</span>
                  </button>
                );
              })}
            </div>

            <Divider vertical className="h-6 mx-1" />

            <Button
              variant={showHistory ? 'secondary' : 'ghost'}
              size="xs"
              icon={<History size={13} />}
              onClick={() => setShowHistory((v) => !v)}
            >
              History
            </Button>
            <Button
              variant={showDetails ? 'secondary' : 'ghost'}
              size="xs"
              icon={<Info size={13} />}
              onClick={() => setShowDetails((v) => !v)}
            >
              Details
            </Button>
            <Button
              variant="ghost"
              size="xs"
              icon={<Sparkles size={13} />}
              onClick={() => setShowProfile(true)}
            >
              Profile
            </Button>
          </div>
        </header>

        {/* Expandable panels */}
        <AnimatePresence>
          {(showHistory || showDetails) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-b border-white/[0.06]"
            >
              <div className="px-5 py-4">
                <div
                  className={`grid gap-4 ${showHistory && showDetails ? 'xl:grid-cols-[minmax(0,1fr)_300px]' : ''}`}
                >
                  {showHistory && (
                    <Card variant="ghost" padding="md" animate={false}>
                      <div className="mb-3 flex items-center justify-between">
                        <SectionLabel>History</SectionLabel>
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={<RotateCcw size={12} />}
                          onClick={onClearTranscript}
                          disabled={messages.length === 0}
                        >
                          Clear
                        </Button>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_auto_auto]">
                        <Input
                          inputSize="sm"
                          icon={<Search size={13} />}
                          value={transcriptQuery}
                          onChange={(e) => setTranscriptQuery(e.target.value)}
                          placeholder="Search messages"
                        />
                        <select
                          value={transcriptRoleFilter}
                          onChange={(e) =>
                            setTranscriptRoleFilter(e.target.value as typeof transcriptRoleFilter)
                          }
                          className="h-8 rounded-lg border border-white/[0.10] bg-surface-1 px-2.5 text-xs text-white/80 outline-none"
                        >
                          <option value="all">All roles</option>
                          <option value="user">User</option>
                          <option value="assistant">Assistant</option>
                          <option value="system">System</option>
                        </select>
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={<ChevronDown size={12} />}
                          onClick={() => setNewestFirst((v) => !v)}
                        >
                          {newestFirst ? 'Newest' : 'Oldest'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={<Copy size={12} />}
                          onClick={() => void copyVisibleTranscript()}
                        >
                          {copyNotice ?? 'Copy'}
                        </Button>
                      </div>
                    </Card>
                  )}

                  {showDetails && (
                    <Card variant="ghost" padding="md" animate={false}>
                      <SectionLabel className="mb-3">Workspace</SectionLabel>
                      <div className="grid grid-cols-2 gap-2">
                        <StatCard label="Agents" value={snapshot.agents.length} />
                        <StatCard label="Groups" value={snapshot.groups.length} />
                        <StatCard label="Tasks" value={snapshot.tasks.length} />
                        <StatCard label="UserMap" value={countNodes(snapshot.userMap)} />
                        <StatCard
                          label="Models"
                          value={snapshot.models.filter((m) => m.installed).length}
                        />
                      </div>
                      <div className="mt-3 flex gap-2">
                        {latestUserMessage && (
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={<Bot size={12} />}
                            onClick={() => setMessage(latestUserMessage.text)}
                            fullWidth
                          >
                            Reuse prompt
                          </Button>
                        )}
                        {latestAssistantMessage && (
                          <Button
                            variant="ghost"
                            size="xs"
                            icon={<Copy size={12} />}
                            onClick={() =>
                              void navigator.clipboard.writeText(latestAssistantMessage.text)
                            }
                            fullWidth
                          >
                            Copy reply
                          </Button>
                        )}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Task/Council composer */}
        {activeMode === 'task' || activeMode === 'council' ? (
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            {activeMode === 'council' && (
              <div className="mb-4 rounded-2xl border border-[#a78bfa]/15 bg-[#a78bfa]/[0.04] px-5 py-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <Users size={16} className="text-[#a78bfa]" />
                  <span className="text-sm font-semibold text-[#a78bfa]">Multi-Model Council</span>
                </div>
                <p className="text-[12px] leading-relaxed text-white/45">
                  Multiple models evaluate the same brief independently, critique each other, and synthesize the strongest recommendation. Use this for high-stakes decisions.
                </p>
              </div>
            )}
            <TaskComposerCard
              title={activeMode === 'task' ? 'Schedule Task' : 'Council Session'}
              subtitle={activeMode === 'task' ? 'Queue a background job for Prism or an agent.' : 'Configure models, objective, and schedule for the council.'}
              target={{ type: 'prism' }}
              defaultMode={activeMode}
              models={snapshot.models}
              busy={busy}
              onCreate={onCreateTask}
            />
          </div>
        ) : (
          <>
            {/* Chat area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">
              {visibleMessages.length === 0 ? (
                <EmptyState
                  icon={
                    activeMode === 'ask' ? (
                      <Sparkles size={22} className="text-brand-light" />
                    ) : (
                      <Wand2 size={22} className="text-brand-light" />
                    )
                  }
                  title={activeMode === 'ask' ? 'Ask Prism' : 'Create Agents'}
                  description={
                    activeMode === 'ask'
                      ? 'Get help with objectives, workflows, prompts, and system design.'
                      : 'Design a focused agent or group from one clear objective.'
                  }
                  suggestions={
                    activeMode === 'ask'
                      ? [
                          {
                            label: 'What can you help me with?',
                            onClick: () => setMessage('What can you help me with?'),
                          },
                          {
                            label: 'Analyze my UserMap context',
                            onClick: () =>
                              setMessage(
                                'Analyze my UserMap and suggest what agents would be useful.',
                              ),
                          },
                          {
                            label: 'How does Prism work?',
                            onClick: () =>
                              setMessage(
                                'Explain how Prism creates and manages agent blueprints.',
                              ),
                          },
                        ]
                      : [
                          {
                            label: 'Research assistant for my field',
                            onClick: () =>
                              setMessage(
                                'Create a research agent that can search the web and analyze findings based on my profile.',
                              ),
                          },
                          {
                            label: 'Daily briefing agent',
                            onClick: () =>
                              setMessage(
                                'Create an agent that gives me a daily briefing on topics relevant to my work.',
                              ),
                          },
                          {
                            label: 'Writing editor',
                            onClick: () =>
                              setMessage(
                                'Create a writing assistant that reviews and improves my drafts.',
                              ),
                          },
                        ]
                  }
                />
              ) : (
                <div className="mx-auto max-w-[46rem] space-y-1">
                  {visibleMessages.map((entry) => (
                    <ChatMessage
                      key={entry.id}
                      role={entry.role}
                      text={entry.text}
                      {...(entry.mode != null ? { mode: entry.mode } : {})}
                      agentName="Prism"
                    />
                  ))}
                  {busy && <TypingIndicator agentName="Prism" />}
                </div>
              )}
            </div>

            {/* Composer */}
            <form onSubmit={handleSubmit} className="border-t border-white/[0.06] px-5 pb-4 pt-3">
              <div className="mx-auto max-w-[46rem]">
                <div className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-surface-3 px-3 py-2 transition-colors focus-within:border-brand/30">
                  <div className="flex-1">
                    <textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      className="max-h-[120px] min-h-[40px] w-full resize-none bg-transparent px-1 py-2 text-sm leading-relaxed text-white outline-none placeholder:text-white/25"
                      placeholder={
                        activeMode === 'ask'
                          ? 'Ask Prism anything...'
                          : 'Describe the agent you want to create...'
                      }
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !message.trim()}
                    className={[
                      'mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-150',
                      message.trim()
                        ? 'bg-brand text-white hover:bg-brand-hover shadow-glow'
                        : 'bg-white/[0.04] text-white/20',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    ].join(' ')}
                    title={activeMode === 'ask' ? 'Send' : 'Create'}
                  >
                    <ArrowUp size={15} />
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[10px] text-white/20">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </form>
          </>
        )}
      </section>
      {/* Prism Profile Panel */}
      {onSavePrismOverride && (
        <PrismProfilePanel
          open={showProfile}
          onClose={() => setShowProfile(false)}
          prismOverride={prismOverride ?? null}
          models={snapshot.models}
          onSavePrismOverride={onSavePrismOverride}
          busy={busy}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-1 px-3 py-2.5">
      <div className="text-[10px] font-medium text-white/35">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function countNodes(node: WorkspaceSnapshot['userMap']): number {
  const countTree = (tree: WorkspaceSnapshot['userMap']['privateTree']): number =>
    1 + tree.children.reduce((total: number, child) => total + countTree(child), 0);
  return countTree(node.privateTree) + countTree(node.publicTree);
}
