import React, { useMemo, useState } from 'react';
import { Bot, MessageSquareMore, Trash2, Users } from 'lucide-react';
import type { TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import { TaskComposerCard } from './TaskComposerCard';
import type { ChatTarget } from './ChatsWorkspace';

interface SpectrumViewProps {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  onCreateAgentTask: (input: TaskCreateInput) => Promise<void>;
  onUpsertGroup: (group: {
    id?: string;
    name: string;
    description?: string;
    memberAgentIds: string[];
    routingMode: 'auto' | 'manual';
    autoRouteThreshold: number;
    defaultResponderAgentId?: string;
  }) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onOpenChat: (target: ChatTarget) => void;
}

export function SpectrumView({ snapshot, busy, onCreateAgentTask, onUpsertGroup, onDeleteGroup, onOpenChat }: SpectrumViewProps) {
  const [taskAgentId, setTaskAgentId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [routingMode, setRoutingMode] = useState<'auto' | 'manual'>('auto');
  const [defaultResponderAgentId, setDefaultResponderAgentId] = useState('');
  const taskAgent = useMemo(() => snapshot.agents.find((agent) => agent.id === taskAgentId) ?? null, [snapshot.agents, taskAgentId]);

  const toggleMember = (agentId: string) => {
    setSelectedMemberIds((current) => current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId]);
  };

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupName.trim()) return;
    await onUpsertGroup({
      name: groupName.trim(),
      ...(groupDescription.trim() ? { description: groupDescription.trim() } : {}),
      memberAgentIds: selectedMemberIds,
      routingMode,
      autoRouteThreshold: 0.55,
      ...(defaultResponderAgentId ? { defaultResponderAgentId } : {})
    });
    setGroupName('');
    setGroupDescription('');
    setSelectedMemberIds([]);
    setRoutingMode('auto');
    setDefaultResponderAgentId('');
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#0d1012] px-5 py-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Spectrum</div>
          <h1 className="mt-1 text-sm font-black uppercase tracking-[0.14em] text-white">Chatbots & Groups</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <CountPill label="Chatbots" value={snapshot.agents.length} />
          <CountPill label="Groups" value={snapshot.groups.length} />
          <CountPill label="Models" value={snapshot.models.filter((model) => model.installed).length} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Chatbots</div>
              <div className="mt-1 text-sm font-black uppercase tracking-[0.14em] text-white">Saved</div>
            </div>
            <Bot size={18} className="text-white/45" />
          </div>

          {snapshot.agents.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              No chatbots yet.
            </div>
          ) : (
            <div className="space-y-4">
              {snapshot.agents.map((agent) => (
                <div key={agent.id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{agent.persona.role}</div>
                      <div className="mt-1 text-base font-semibold text-white">{agent.name}</div>
                      {agent.description ? <p className="mt-2 text-sm leading-6 text-white/62">{agent.description}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenChat({ type: 'agent', id: agent.id })}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
                      >
                        <MessageSquareMore size={14} />
                        Open Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskAgentId((current) => current === agent.id ? null : agent.id)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
                      >
                        {taskAgentId === agent.id ? 'Close Task' : 'Task'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2.5 md:grid-cols-3">
                    <InfoPill label="Provider" value={agent.providerStrategy.mode.replaceAll('_', ' ')} />
                    <InfoPill label="Tools" value={agent.tools.length ? agent.tools.join(', ') : 'None'} />
                    <InfoPill label="Skills" value={agent.skills.length ? agent.skills.join(', ') : 'None'} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Groups</div>
              <div className="mt-1 text-sm font-black uppercase tracking-[0.14em] text-white">Manage</div>
            </div>
            <Users size={18} className="text-white/45" />
          </div>

          <form onSubmit={handleCreateGroup} className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="space-y-3">
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
                placeholder="Growth Council"
              />
              <textarea
                value={groupDescription}
                onChange={(event) => setGroupDescription(event.target.value)}
                className="min-h-[88px] w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none"
                placeholder="Optional description"
              />
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Members</div>
                <div className="flex flex-wrap gap-2">
                  {snapshot.agents.length === 0 ? (
                    <div className="text-sm text-white/45">No chatbots available.</div>
                  ) : (
                    snapshot.agents.map((agent) => {
                      const selected = selectedMemberIds.includes(agent.id);
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => toggleMember(agent.id)}
                          className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] transition ${selected ? 'bg-white text-black' : 'border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white'}`}
                        >
                          {agent.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Routing</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRoutingMode('auto')}
                      className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] transition ${routingMode === 'auto' ? 'bg-white text-black' : 'border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white'}`}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoutingMode('manual')}
                      className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] transition ${routingMode === 'manual' ? 'bg-white text-black' : 'border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white'}`}
                    >
                      Manual
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Fallback Agent</div>
                  <select
                    value={defaultResponderAgentId}
                    onChange={(event) => setDefaultResponderAgentId(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="">None</option>
                    {snapshot.agents
                      .filter((agent) => selectedMemberIds.includes(agent.id))
                      .map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={busy || !groupName.trim()}
                className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-[9px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-white/90 disabled:opacity-50"
              >
                Save Group
              </button>
            </div>
          </form>

          {snapshot.groups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              No groups yet.
            </div>
          ) : (
            <div className="space-y-3">
              {snapshot.groups.map((group) => (
                <div key={group.id} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold text-white">{group.name}</div>
                      {group.description ? <div className="mt-2 text-sm leading-6 text-white/62">{group.description}</div> : null}
                      <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/38">
                        {group.memberAgentIds.length} member{group.memberAgentIds.length === 1 ? '' : 's'}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/38">
                        {group.routingMode === 'auto' ? `Auto routing · ${Math.round(group.autoRouteThreshold * 100)}%` : 'Manual routing'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenChat({ type: 'group', id: group.id })}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:border-white/20 hover:text-white"
                      >
                        <MessageSquareMore size={14} />
                        Open Chat
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDeleteGroup(group.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-red-100 transition hover:border-red-400/30 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {taskAgent ? (
        <TaskComposerCard
          title={`New Task · ${taskAgent.name}`}
          subtitle=""
          target={{ type: 'agent', agentId: taskAgent.id }}
          defaultMode="task"
          models={snapshot.models}
          busy={busy}
          onCreate={onCreateAgentTask}
        />
      ) : null}
    </div>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/70">
      {label} · {value}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2.5">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{label}</div>
      <div className="mt-1.5 text-sm leading-5 text-white/72">{value}</div>
    </div>
  );
}
