import React, { useMemo, useState } from 'react';
import { Bot, Copy, RotateCcw, Search, Sparkles, Wand2 } from 'lucide-react';
import type { PrismMode, UserMapNode } from '@supreme/shared';
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

const modeCards: Array<{ id: PrismMode | 'task' | 'council'; label: string; body: string }> = [
  { id: 'ask', label: 'Ask', body: 'Use Prism as your strategist, context engineer, and work architect.' },
  { id: 'create', label: 'Create', body: 'Describe the goal once and let Prism design the chatbot spec.' },
  { id: 'task', label: 'Task', body: 'Schedule a one-off or recurring Prism mission into Work.' },
  { id: 'council', label: 'Council', body: 'Run multiple local models and save the judged result into Work.' }
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
      setCopyNotice('Nothing visible to copy.');
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopyNotice('Copied visible transcript.');
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_36%),linear-gradient(135deg,#0f1215,#090b0d)] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/45">
              <Sparkles size={14} /> Prism
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white">Design chatbots, schedule work, and shape the local runtime from one place.</h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/60">
              Prism is your local architect. It can answer directly, create OpenClaw-native chatbot specs, and schedule autonomous work that lands in Work without touching a cloud backend.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:w-[340px]">
            {[
              ['Local Runtime', snapshot.runtime.ollamaReady ? 'Ollama is reachable.' : 'Install or start Ollama to unlock Prism execution.'],
              ['Chatbots', snapshot.agents.length === 0 ? 'No chatbots yet. Use Create to generate one.' : `${snapshot.agents.length} chatbot${snapshot.agents.length === 1 ? '' : 's'} ready.`],
              ['Work Queue', snapshot.tasks.length === 0 ? 'No scheduled tasks yet.' : `${snapshot.tasks.length} task${snapshot.tasks.length === 1 ? '' : 's'} scheduled or saved.`]
            ].map(([title, body]) => (
              <div key={title} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/42">{title}</div>
                <div className="mt-2 text-sm leading-6 text-white/66">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        {modeCards.map((card) => {
          const active = card.id === activeMode;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setActiveMode(card.id)}
              className={`rounded-[28px] border p-5 text-left transition ${active ? 'border-white/20 bg-white text-black shadow-[0_20px_60px_rgba(255,255,255,0.08)]' : 'border-white/10 bg-white/5 text-white hover:border-white/18 hover:bg-white/8'}`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-60">{card.label}</div>
              <div className="mt-3 text-xl font-semibold">{card.label}</div>
              <p className="mt-3 text-sm leading-7 opacity-75">{card.body}</p>
            </button>
          );
        })}
      </section>

      {activeMode === 'task' || activeMode === 'council' ? (
        <TaskComposerCard
          title={activeMode === 'task' ? 'Schedule Prism Work' : 'Schedule a Council Run'}
          subtitle={activeMode === 'task' ? 'Give Prism a mission, pick the run time, and store the output in Work.' : 'Select worker models plus a judge. The final judged answer will be stored as a Work item.'}
          target={{ type: 'prism' }}
          defaultMode={activeMode}
          models={snapshot.models}
          busy={busy}
          onCreate={onCreateTask}
        />
      ) : (
        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Prism Console</div>
                <div className="mt-2 text-2xl font-semibold text-white">{activeMode === 'ask' ? 'Ask Prism' : 'Create a Chatbot'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                {activeMode === 'ask' ? <Sparkles size={16} /> : <Wand2 size={16} />}
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[180px] w-full rounded-[28px] border border-white/10 bg-black/25 px-5 py-5 text-sm leading-7 text-white outline-none transition focus:border-white/25"
                placeholder={activeMode === 'ask' ? 'Example: Help me turn my UserMap into a concise brief for a weekly founder review.' : 'Example: Create a chatbot that tracks Missouri RFP opportunities for my company and writes tight summaries.'}
              />
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm leading-6 text-white/48">
                  {activeMode === 'ask'
                    ? 'Prism answers directly using your local UserMap, groups, and chatbot context.'
                    : 'Prism returns a real local chatbot spec and saves it into Spectrum when generation succeeds.'}
                </div>
                <button type="submit" disabled={busy || !message.trim()} className="inline-flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60">
                  {busy ? 'Running…' : activeMode === 'ask' ? 'Ask Prism' : 'Create Chatbot'}
                  <Bot size={15} />
                </button>
              </div>
            </form>
          </div>
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Current Context</div>
            <div className="mt-4 grid gap-3">
              {[
                { label: 'UserMap Nodes', value: countNodes(snapshot.userMap) },
                { label: 'Extracted Facts', value: snapshot.memoryFacts.length },
                { label: 'Installed Models', value: snapshot.models.filter((model) => model.installed).length },
                { label: 'Saved Chatbots', value: snapshot.agents.length }
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{item.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Prism Transcript</div>
            <div className="mt-2 text-2xl font-semibold text-white">Conversation controls</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => latestUserMessage ? setMessage(latestUserMessage.text) : undefined}
              disabled={!latestUserMessage}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"
            >
              Reuse Last Prompt
            </button>
            <button
              type="button"
              onClick={() => latestAssistantMessage ? navigator.clipboard.writeText(latestAssistantMessage.text) : undefined}
              disabled={!latestAssistantMessage}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"
            >
              Copy Last Reply
            </button>
            <button
              type="button"
              onClick={onClearTranscript}
              disabled={messages.length === 0}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"
            >
              <RotateCcw size={14} className="inline-block mr-2" />
              Clear
            </button>
          </div>
        </div>
        <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_0.8fr_auto_auto]">
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/28" size={16} />
              <input
                value={transcriptQuery}
                onChange={(event) => setTranscriptQuery(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/25 py-4 pl-11 pr-4 text-sm text-white outline-none transition focus:border-white/25"
                placeholder="Search visible transcript text or mode"
              />
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Role</span>
            <select
              value={transcriptRoleFilter}
              onChange={(event) => setTranscriptRoleFilter(event.target.value as typeof transcriptRoleFilter)}
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-sm text-white outline-none"
            >
              <option value="all">All roles</option>
              <option value="user">User</option>
              <option value="assistant">Assistant</option>
              <option value="system">System</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setNewestFirst((current) => !current)}
            className="self-end rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white"
          >
            {newestFirst ? 'Newest First' : 'Oldest First'}
          </button>
          <button
            type="button"
            onClick={() => void copyVisibleTranscript()}
            className="self-end inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white"
          >
            <Copy size={14} />
            Copy Visible
          </button>
        </div>
        {copyNotice ? <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/62">{copyNotice}</div> : null}
        {messages.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
            Prism conversation starts here. Ask directly, create a chatbot, or schedule work into the local queue.
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
            No Prism transcript entries match the current controls.
          </div>
        ) : (
          <div className="space-y-4">
            {visibleMessages.map((messageEntry) => (
              <div key={messageEntry.id} className={`rounded-[28px] border px-5 py-4 ${messageEntry.role === 'user' ? 'border-white/10 bg-black/35' : messageEntry.role === 'assistant' ? 'border-emerald-400/15 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{messageEntry.role} {messageEntry.mode ? `· ${messageEntry.mode}` : ''}</div>
                  <button
                    type="button"
                    onClick={() => setMessage(messageEntry.text)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/70 transition hover:border-white/20 hover:text-white"
                  >
                    Use in Composer
                  </button>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-7 text-white/78">{messageEntry.text}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function countNodes(node: Pick<UserMapNode, 'children'>): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
}
