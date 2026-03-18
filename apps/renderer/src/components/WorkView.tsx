import React, { useMemo, useState } from 'react';
import { Copy, MessageSquareMore, Play, Search, Send, Trash2, X } from 'lucide-react';
import type { AgentSpec, ArtifactRecord, TaskSpec, WorkItem } from '@supreme/shared';
import type { WorkspaceSnapshot } from '@/lib/electron';
import type { ChatTarget } from './ChatsWorkspace';

interface WorkViewProps {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  onDeleteTask: (taskId: string) => Promise<void>;
  onDuplicateTask: (taskId: string) => Promise<void>;
  onRerunTask: (taskId: string) => Promise<void>;
  onDeleteWorkItem: (workItemId: string) => Promise<void>;
  onSendToChat: (item: WorkItem) => void;
  onOpenChat: (target: ChatTarget | 'prism') => void;
  onOpenArtifact: (artifactId: string) => Promise<void>;
}

export function WorkView({ snapshot, busy, onDeleteTask, onDuplicateTask, onRerunTask, onDeleteWorkItem, onSendToChat, onOpenChat, onOpenArtifact }: WorkViewProps) {
  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskSpec['status']>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'task' | 'council' | 'artifact'>('all');
  const taskLookup = useMemo(() => new Map(snapshot.tasks.map((task) => [task.id, task])), [snapshot.tasks]);
  const artifactLookup = useMemo(() => new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact])), [snapshot.artifacts]);
  const agentLookup = useMemo(() => new Map(snapshot.agents.map((agent) => [agent.id, agent])), [snapshot.agents]);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredTasks = useMemo(() => {
    return snapshot.tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false;
      }
      if (kindFilter !== 'all' && task.mode !== kindFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const targetLabel = describeTaskTarget(task, agentLookup);
      const searchBody = [task.title, task.objective, targetLabel, task.lastError ?? '', task.resultSummary ?? '']
        .join(' ')
        .toLowerCase();
      return searchBody.includes(normalizedQuery);
    });
  }, [agentLookup, kindFilter, normalizedQuery, snapshot.tasks, statusFilter]);

  const filteredWorkItems = useMemo(() => {
    return snapshot.workItems.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (kindFilter !== 'all' && item.type !== kindFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const sourceTask = item.sourceTaskId ? taskLookup.get(item.sourceTaskId) : null;
      const sourceAgent = item.sourceAgentId ? agentLookup.get(item.sourceAgentId) : null;
      const searchBody = [item.title, item.summary ?? '', item.lastError ?? '', sourceTask?.title ?? '', sourceAgent?.name ?? '']
        .join(' ')
        .toLowerCase();
      return searchBody.includes(normalizedQuery);
    });
  }, [agentLookup, kindFilter, normalizedQuery, snapshot.workItems, statusFilter, taskLookup]);

  const filtersActive = query.trim().length > 0 || statusFilter !== 'all' || kindFilter !== 'all';

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#0d1012] px-5 py-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Work</div>
          <h1 className="mt-1 text-sm font-black uppercase tracking-[0.14em] text-white">Tasks & Results</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ['Tasks', snapshot.tasks.length],
            ['Runs', snapshot.workItems.length],
            ['Files', snapshot.artifacts.length]
          ].map(([label, value]) => (
            <div key={label} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/70">
              {label} · {value}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Filter</div>
            <div className="mt-1 text-sm font-black uppercase tracking-[0.14em] text-white">Search</div>
          </div>
          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
                setKindFilter('all');
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
            >
              <X size={14} />
              Clear Filters
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr]">
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/28" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/25 py-3 pl-10 pr-4 text-sm text-white outline-none transition focus:border-white/20"
                placeholder="Search"
              />
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="all">All statuses</option>
              {['draft', 'scheduled', 'queued', 'running', 'done', 'failed', 'cancelled'].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Kind</span>
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}
              className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="all">All kinds</option>
              <option value="task">Task</option>
              <option value="council">Council</option>
              <option value="artifact">Artifact results</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-2.5 md:grid-cols-2">
          <InfoRow label="Matching Tasks" value={`${filteredTasks.length}`} />
          <InfoRow label="Matching Results" value={`${filteredWorkItems.length}`} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="mb-5 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Tasks · {filteredTasks.length}</div>
          {snapshot.tasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              No tasks yet.
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              No tasks match the current filters.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{task.mode}</div>
                      <div className="mt-1 text-base font-semibold text-white">{task.title}</div>
                      <div className="mt-2 text-sm leading-6 text-white/60">{task.objective}</div>
                    </div>
                    <StatusPill status={task.status} />
                  </div>
                  <div className="mt-3 grid gap-2.5 md:grid-cols-2">
                    <InfoRow label="Next Run" value={task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : 'Not scheduled'} />
                    <InfoRow label="Target" value={describeTaskTarget(task, agentLookup)} />
                    <InfoRow label="Artifacts" value={task.outputPolicy.artifactMode} />
                    <InfoRow label="Notifications" value={task.outputPolicy.notificationMode} />
                  </div>
                  {task.lastError ? <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{task.lastError}</div> : null}
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenChat(task.target.type === 'prism' ? 'prism' : { type: 'agent', id: task.target.agentId })}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
                    >
                      <MessageSquareMore size={14} />
                      Open Chat
                    </button>
                    <button type="button" disabled={busy} onClick={() => onDuplicateTask(task.id)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"><Copy size={14} />Duplicate</button>
                    <button type="button" disabled={busy} onClick={() => onRerunTask(task.id)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"><Play size={14} />Rerun</button>
                    <button type="button" disabled={busy} onClick={() => onDeleteTask(task.id)} className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-red-100 transition hover:border-red-400/30 disabled:opacity-50"><Trash2 size={14} />Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="mb-5 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Results & Artifacts · {filteredWorkItems.length}</div>
          {snapshot.workItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              No results yet.
            </div>
          ) : filteredWorkItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              No results or artifacts match the current filters.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredWorkItems.map((item) => {
                const expanded = expandedWorkId === item.id;
                const sourceTask = item.sourceTaskId ? taskLookup.get(item.sourceTaskId) : null;
                const artifacts = item.artifactIds
                  .map((artifactId) => artifactLookup.get(artifactId))
                  .filter((artifact): artifact is ArtifactRecord => Boolean(artifact));
                return (
                  <div key={item.id} className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{item.type}</div>
                        <div className="mt-2 text-xl font-semibold text-white">{item.title}</div>
                        <div className="mt-2 text-sm text-white/52">{sourceTask ? `From ${sourceTask.title}` : 'Standalone work item'}</div>
                        <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/38">
                          {item.sourceAgentId ? `Routes back to ${agentLookup.get(item.sourceAgentId)?.name ?? 'the originating chatbot'}.` : 'Routes back to Prism.'}
                        </div>
                      </div>
                      <StatusPill status={item.status} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenChat(item.sourceAgentId ? { type: 'agent', id: item.sourceAgentId } : 'prism')}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white"
                      >
                        <MessageSquareMore size={14} />
                        Open Chat
                      </button>
                      <button type="button" onClick={() => setExpandedWorkId((current) => current === item.id ? null : item.id)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white">
                        {expanded ? 'Close' : 'Open'}
                      </button>
                      <button type="button" disabled={!item.summary} onClick={() => onSendToChat(item)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"><Send size={14} />Send to Chat</button>
                      <button type="button" disabled={!item.sourceTaskId || busy} onClick={() => item.sourceTaskId ? onDuplicateTask(item.sourceTaskId) : Promise.resolve()} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"><Copy size={14} />Duplicate</button>
                      <button type="button" disabled={!item.sourceTaskId || busy} onClick={() => item.sourceTaskId ? onRerunTask(item.sourceTaskId) : Promise.resolve()} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"><Play size={14} />Rerun</button>
                      <button type="button" disabled={busy} onClick={() => onDeleteWorkItem(item.id)} className="inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-red-100 transition hover:border-red-400/30 disabled:opacity-50"><Trash2 size={14} />Delete</button>
                    </div>
                    {expanded ? (
                      <div className="mt-5 space-y-4">
                        {item.summary ? <div className="whitespace-pre-wrap rounded-3xl border border-white/8 bg-white/5 px-5 py-4 text-sm leading-7 text-white/74">{item.summary}</div> : null}
                        {item.lastError ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{item.lastError}</div> : null}
                        {artifacts.length ? (
                          <div className="rounded-3xl border border-white/8 bg-white/5 p-4">
                            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Artifacts</div>
                            <div className="space-y-3">
                              {artifacts.map((artifact) => (
                                <div key={artifact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                                  <div>
                                    <div className="text-sm font-semibold text-white">{artifact.title}</div>
                                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/38">{artifact.kind} · {artifact.relativePath}</div>
                                  </div>
                                  <button type="button" onClick={() => onOpenArtifact(artifact.id)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white">
                                    Open File
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="grid gap-3 md:grid-cols-2">
                          <InfoRow label="Updated" value={new Date(item.updatedAt).toLocaleString()} />
                          <InfoRow label="Artifacts" value={`${item.artifactIds.length}`} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function describeTaskTarget(task: TaskSpec, agentLookup: Map<string, AgentSpec>) {
  if (task.target.type === 'prism') {
    return 'Prism';
  }

  return agentLookup.get(task.target.agentId)?.name ?? `Chatbot ${task.target.agentId}`;
}

function StatusPill({ status }: { status: TaskSpec['status'] | WorkItem['status'] }) {
  const tone = status === 'done'
    ? 'bg-emerald-400/10 text-emerald-200 border-emerald-400/20'
    : status === 'failed'
      ? 'bg-red-400/10 text-red-200 border-red-400/20'
      : status === 'running'
        ? 'bg-sky-400/10 text-sky-200 border-sky-400/20'
        : 'bg-white/5 text-white/60 border-white/10';

  return <div className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] ${tone}`}>{status}</div>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{label}</div>
      <div className="mt-2 text-sm leading-6 text-white/70">{value}</div>
    </div>
  );
}
