import React, { useMemo, useState } from 'react';
import { Copy, MessageSquareMore, Play, Send, Trash2 } from 'lucide-react';
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
  const taskLookup = useMemo(() => new Map(snapshot.tasks.map((task) => [task.id, task])), [snapshot.tasks]);
  const artifactLookup = useMemo(() => new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact])), [snapshot.artifacts]);
  const agentLookup = useMemo(() => new Map(snapshot.agents.map((agent) => [agent.id, agent])), [snapshot.agents]);

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_28%),linear-gradient(135deg,#0d1014,#090b0d)] p-8">
        <div className="grid gap-6 xl:grid-cols-3">
          {[
            ['Scheduled Tasks', snapshot.tasks.length],
            ['Work Items', snapshot.workItems.length],
            ['Artifacts', snapshot.artifacts.length]
          ].map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-white/8 bg-white/5 p-5">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">{label}</div>
              <div className="mt-3 text-4xl font-semibold text-white">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="mb-5 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Tasks</div>
          {snapshot.tasks.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              No scheduled work yet. Use Prism Task or Council to place autonomous runs here.
            </div>
          ) : (
            <div className="space-y-4">
              {snapshot.tasks.map((task) => (
                <div key={task.id} className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{task.mode}</div>
                      <div className="mt-2 text-xl font-semibold text-white">{task.title}</div>
                      <div className="mt-2 text-sm leading-7 text-white/60">{task.objective}</div>
                    </div>
                    <StatusPill status={task.status} />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white"
                    >
                      <MessageSquareMore size={14} />
                      Open Chat
                    </button>
                    <button type="button" disabled={busy} onClick={() => onDuplicateTask(task.id)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"><Copy size={14} />Duplicate</button>
                    <button type="button" disabled={busy} onClick={() => onRerunTask(task.id)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white disabled:opacity-50"><Play size={14} />Rerun</button>
                    <button type="button" disabled={busy} onClick={() => onDeleteTask(task.id)} className="inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-red-100 transition hover:border-red-400/30 disabled:opacity-50"><Trash2 size={14} />Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="mb-5 text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Results & Artifacts</div>
          {snapshot.workItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              Nothing has run yet. Once a scheduled task executes, its result will appear here.
            </div>
          ) : (
            <div className="space-y-4">
              {snapshot.workItems.map((item) => {
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
