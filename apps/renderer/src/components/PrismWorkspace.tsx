import React, { useMemo, useState } from 'react';
import { Bot, Copy, RotateCcw, Search, Sparkles, Wand2 } from 'lucide-react';
import type { PrismMode } from '@supreme/shared';
import type { TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import { TaskComposerCard } from './TaskComposerCard';

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
}

const modeCards: Array<{ id: PrismMode | 'task' | 'council'; label: string }> = [
  { id: 'ask', label: 'Ask' },
  { id: 'create', label: 'Create' },
  { id: 'task', label: 'Task' },
  { id: 'council', label: 'Council' }
];

export function PrismWorkspace({ snapshot, messages, busy, onSend, onCreateTask, onClearTranscript }: PrismWorkspaceProps) {
  const [activeMode, setActiveMode] = useState<PrismMode | 'task' | 'council'>('ask');
  const [message, setMessage] = useState('');
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [transcriptRoleFilter, setTranscriptRoleFilter] = useState<'all' | PrismMessage['role']>('all');
  const [newestFirst, setNewestFirst] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim() || activeMode === 'task' || activeMode === 'council') return;
    const next = message.trim();
    setMessage('');
    await onSend(activeMode, next);
  };

  const visibleMessages = useMemo(() => {
    const query = transcriptQuery.trim().toLowerCase();
    const filtered = messages.filter((entry) => {
      if (transcriptRoleFilter !== 'all' && entry.role !== transcriptRoleFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return entry.text.toLowerCase().includes(query) || (entry.mode ?? '').toLowerCase().includes(query);
    });

    return newestFirst ? [...filtered].reverse() : filtered;
  }, [messages, newestFirst, transcriptQuery, transcriptRoleFilter]);

  const latestUserMessage = useMemo(
    () => [...messages].reverse().find((entry) => entry.role === 'user'),
    [messages]
  );

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((entry) => entry.role === 'assistant'),
    [messages]
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
  };

  const activeTitle = activeMode === 'ask' ? 'Ask' : activeMode === 'create' ? 'Create' : activeMode === 'task' ? 'Task' : 'Council';

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="flex min-h-[calc(100vh-8.5rem)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0d1012]">
        <header className="h-16 border-b border-white/8 px-5">
          <div className="flex h-full flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Sparkles size={16} className="text-white/75" />
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/38">Prism</div>
                <h1 className="mt-1 text-sm font-black uppercase tracking-[0.14em] text-white">{activeTitle}</h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {modeCards.map((card) => {
                const active = card.id === activeMode;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setActiveMode(card.id)}
                    className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] transition ${active ? 'border-white/15 bg-white text-black' : 'border-white/10 bg-white/5 text-white/65 hover:border-white/20 hover:text-white'}`}
                  >
                    {card.label}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {activeMode === 'task' || activeMode === 'council' ? (
          <div className="p-4">
            <TaskComposerCard
              title={activeMode === 'task' ? 'New Task' : 'New Council'}
              subtitle=""
              target={{ type: 'prism' }}
              defaultMode={activeMode}
              models={snapshot.models}
              busy={busy}
              onCreate={onCreateTask}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
              {visibleMessages.length === 0 ? (
                <div className="flex h-full min-h-[280px] items-center justify-center rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 text-center text-sm leading-7 text-white/45">
                  {activeMode === 'ask' ? 'Ask Prism anything.' : 'Describe the chatbot you want.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleMessages.map((entry) => (
                    <article
                      key={entry.id}
                      className={`rounded-3xl border px-4 py-3 ${
                        entry.role === 'user'
                          ? 'ml-auto max-w-[82%] border-white/10 bg-white text-black'
                          : entry.role === 'assistant'
                            ? 'max-w-[88%] border-white/10 bg-black/30'
                            : 'max-w-[88%] border-white/10 bg-white/5'
                      }`}
                    >
                      <div className={`mb-2 flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] ${entry.role === 'user' ? 'text-black/45' : 'text-white/38'}`}>
                        <span>{entry.role}</span>
                        {entry.mode ? <span>{entry.mode}</span> : null}
                      </div>
                      <div className={`whitespace-pre-wrap text-sm leading-6 ${entry.role === 'user' ? 'text-black/82' : 'text-white/78'}`}>{entry.text}</div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-white/8 px-4 pb-5 pt-4">
              <div className="mx-auto max-w-3xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {modeCards.filter((card) => card.id === 'ask' || card.id === 'create').map((card) => {
                    const active = card.id === activeMode;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => setActiveMode(card.id)}
                        className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] transition ${active ? 'border-white/15 bg-white text-black' : 'border-white/10 bg-white/5 text-white/65 hover:border-white/20 hover:text-white'}`}
                      >
                        {card.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-end gap-3 rounded-[28px] border border-white/10 bg-[#17191d] px-3 py-3">
                  <div className="flex-1">
                    <textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      rows={1}
                      className="max-h-[100px] min-h-[44px] w-full resize-none bg-transparent px-1 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/28"
                      placeholder={activeMode === 'ask' ? 'Ask Prism' : 'Create a chatbot'}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !message.trim()}
                    className={`mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition ${
                      message.trim()
                        ? 'bg-white text-black hover:bg-white/90'
                        : 'bg-white/5 text-white/25'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    title={activeMode === 'ask' ? 'Ask Prism' : 'Create Chatbot'}
                  >
                    {activeMode === 'ask' ? <Sparkles size={16} /> : <Wand2 size={16} />}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </section>

      <aside className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">History</div>
            <button
              type="button"
              onClick={onClearTranscript}
              disabled={messages.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"
            >
              <RotateCcw size={12} />
              Clear
            </button>
          </div>
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/28" size={16} />
                <input
                  value={transcriptQuery}
                  onChange={(event) => setTranscriptQuery(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/25 py-3 pl-10 pr-4 text-sm text-white outline-none transition focus:border-white/25"
                  placeholder="Search"
                />
              </div>
            </label>
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Role</span>
              <select
                value={transcriptRoleFilter}
                onChange={(event) => setTranscriptRoleFilter(event.target.value as typeof transcriptRoleFilter)}
                className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="all">All</option>
                <option value="user">User</option>
                <option value="assistant">Assistant</option>
                <option value="system">System</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNewestFirst((current) => !current)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
              >
                {newestFirst ? 'Newest' : 'Oldest'}
              </button>
              <button
                type="button"
                onClick={() => void copyVisibleTranscript()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
              >
                <Copy size={12} />
                Copy
              </button>
            </div>
            {copyNotice ? <div className="text-xs text-white/45">{copyNotice}</div> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Workspace</div>
          <div className="mt-3 grid gap-2.5">
            <InfoCard label="Chatbots" value={`${snapshot.agents.length}`} />
            <InfoCard label="Groups" value={`${snapshot.groups.length}`} />
            <InfoCard label="Tasks" value={`${snapshot.tasks.length}`} />
            <InfoCard label="UserMap Nodes" value={`${countNodes(snapshot.userMap)}`} />
            <InfoCard label="Models" value={`${snapshot.models.filter((model) => model.installed).length}`} />
          </div>
          {latestUserMessage ? (
            <button
              type="button"
              onClick={() => setMessage(latestUserMessage.text)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
            >
              <Bot size={12} />
              Reuse Last Prompt
            </button>
          ) : null}
          {latestAssistantMessage ? (
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(latestAssistantMessage.text)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
            >
              <Copy size={12} />
              Copy Last Reply
            </button>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function countNodes(node: WorkspaceSnapshot['userMap']): number {
  const countTree = (tree: WorkspaceSnapshot['userMap']['privateTree']): number =>
    1 + tree.children.reduce((total: number, child) => total + countTree(child), 0);
  return countTree(node.privateTree) + countTree(node.publicTree);
}
