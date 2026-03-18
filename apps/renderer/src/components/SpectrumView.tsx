import React, { useMemo, useState } from 'react';
import { Bot, BrainCircuit, MessageSquareMore, Sparkles, Trash2 } from 'lucide-react';
import type { TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import { TaskComposerCard } from './TaskComposerCard';
import type { ChatTarget } from './ChatsWorkspace';

interface SpectrumViewProps {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  onCreateAgentTask: (input: TaskCreateInput) => Promise<void>;
  onUpsertGroup: (group: { id?: string; name: string; description?: string; memberAgentIds: string[] }) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onOpenChat: (target: ChatTarget) => void;
}

export function SpectrumView({ snapshot, busy, onCreateAgentTask, onUpsertGroup, onDeleteGroup, onOpenChat }: SpectrumViewProps) {
  const [taskAgentId, setTaskAgentId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const taskAgent = useMemo(() => snapshot.agents.find((agent) => agent.id === taskAgentId) ?? null, [snapshot.agents, taskAgentId]);

  const toggleMember = (agentId: string) => {
    setSelectedMemberIds((current) => current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId]);
  };

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupName.trim()) return;
    await onUpsertGroup({
      name: groupName.trim(),
      description: groupDescription.trim(),
      memberAgentIds: selectedMemberIds
    });
    setGroupName('');
    setGroupDescription('');
    setSelectedMemberIds([]);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_26%),linear-gradient(135deg,#0d1013,#090b0d)] p-8">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/42">
              <Sparkles size={14} /> Spectrum
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight text-white">Spectrum is now the management surface, not the place where chatbots are manually created.</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/60">
              Chatbots are designed through Prism and stored locally. Spectrum reflects what Prism has deployed, shows local model availability, and lets you schedule work against existing chatbots when you need a dedicated run.
            </p>
          </div>
          <div className="grid gap-3">
            {[
              ['Chatbots', snapshot.agents.length === 0 ? 'No chatbots deployed yet.' : `${snapshot.agents.length} deployed locally.`],
              ['Groups', snapshot.groups.length === 0 ? 'No groups yet. Group collaboration arrives once chatbots exist.' : `${snapshot.groups.length} saved locally.`],
              ['Installed Models', `${snapshot.models.filter((model) => model.installed).length} model${snapshot.models.filter((model) => model.installed).length === 1 ? '' : 's'} available.`]
            ].map(([title, body]) => (
              <div key={title} className="rounded-3xl border border-white/8 bg-white/5 p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">{title}</div>
                <div className="mt-2 text-sm leading-6 text-white/66">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Chatbots</div>
              <div className="mt-2 text-2xl font-semibold text-white">Deployed by Prism</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
              <Bot size={16} />
            </div>
          </div>
          {snapshot.agents.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              No chatbots exist yet. Ask Prism to create one, then come back here to inspect its local spec and schedule dedicated work.
            </div>
          ) : (
            <div className="space-y-4">
              {snapshot.agents.map((agent) => (
                <div key={agent.id} className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{agent.persona.role}</div>
                      <div className="mt-2 text-2xl font-semibold text-white">{agent.name}</div>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">{agent.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => onOpenChat({ type: 'agent', id: agent.id })} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white">
                        <MessageSquareMore size={14} />
                        Open Chat
                      </button>
                      <button type="button" onClick={() => setTaskAgentId((current) => current === agent.id ? null : agent.id)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white">
                        {taskAgentId === agent.id ? 'Close Task' : 'Schedule Task'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <InfoPill label="Provider Strategy" value={agent.providerStrategy.mode.replaceAll('_', ' ')} />
                    <InfoPill label="Tools" value={agent.tools.length ? agent.tools.join(', ') : 'None yet'} />
                    <InfoPill label="Skills" value={agent.skills.length ? agent.skills.join(', ') : 'None yet'} />
                  </div>
                  <div className="mt-4 rounded-3xl border border-white/8 bg-white/5 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">System Instructions</div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/72">{agent.persona.systemInstructions}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Groups</div>
              <div className="mt-2 text-2xl font-semibold text-white">Manual @mention collaboration</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
              <BrainCircuit size={16} />
            </div>
          </div>
          <form onSubmit={handleCreateGroup} className="rounded-3xl border border-white/8 bg-black/20 p-4">
            <div className="mb-4 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Add Group</div>
            <div className="space-y-3">
              <input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
                placeholder="Growth Council"
              />
              <textarea
                value={groupDescription}
                onChange={(event) => setGroupDescription(event.target.value)}
                className="min-h-[92px] w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-7 text-white outline-none"
                placeholder="Describe what this group is for."
              />
              <div className="grid gap-2">
                {snapshot.agents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/12 bg-white/5 px-4 py-4 text-sm leading-7 text-white/45">
                    Create chatbots in Prism first, then add them to a group here.
                  </div>
                ) : (
                  snapshot.agents.map((agent) => (
                    <label key={agent.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-white/70">
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(agent.id)}
                        onChange={() => toggleMember(agent.id)}
                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                      />
                      <div>
                        <div className="font-semibold text-white">{agent.name}</div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">@{agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <button
                type="submit"
                disabled={busy || !groupName.trim()}
                className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save Group
              </button>
            </div>
          </form>
          <div className="mt-5 space-y-3">
            {snapshot.groups.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
                Groups are empty right now. Create one above, then use manual @mentions inside Chats.
              </div>
            ) : (
              snapshot.groups.map((group) => (
                <div key={group.id} className="rounded-3xl border border-white/8 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Group</div>
                      <div className="mt-2 text-lg font-semibold text-white">{group.name}</div>
                      <div className="mt-2 text-sm leading-7 text-white/58">{group.description || 'No description yet.'}</div>
                      <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/38">{group.memberAgentIds.length} members</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {group.memberAgentIds.map((agentId) => {
                          const member = snapshot.agents.find((agent) => agent.id === agentId);
                          if (!member) return null;
                          const handle = `@${member.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
                          return (
                            <div key={agentId} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
                              {handle}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenChat({ type: 'group', id: group.id })}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white"
                      >
                        <MessageSquareMore size={14} />
                        Open Chat
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDeleteGroup(group.id)}
                        className="rounded-2xl border border-red-400/20 bg-red-400/10 px-3 py-3 text-red-100 transition hover:border-red-400/30 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-6 rounded-3xl border border-white/8 bg-black/20 p-4">
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Local Model Inventory</div>
            <div className="space-y-2">
              {snapshot.models.map((model) => (
                <div key={model.id} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-sm text-white/70">
                  <div>
                    <div className="font-semibold text-white">{model.label}</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">{model.id}</div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${model.installed ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/8 text-white/45'}`}>
                    {model.installed ? 'Installed' : 'Preset'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {taskAgent ? (
        <TaskComposerCard
          title={`Schedule ${taskAgent.name}`}
          subtitle="Create a dedicated autonomous run against this chatbot’s own local spec. The output will land in Work and can be sent back into Prism chat later."
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{label}</div>
      <div className="mt-2 text-sm leading-6 text-white/72">{value}</div>
    </div>
  );
}
