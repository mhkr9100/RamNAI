import React, { useMemo, useState } from 'react';
import { Bot, BrainCircuit, Sparkles } from 'lucide-react';
import type { TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import { TaskComposerCard } from './TaskComposerCard';

interface SpectrumViewProps {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  onCreateAgentTask: (input: TaskCreateInput) => Promise<void>;
}

export function SpectrumView({ snapshot, busy, onCreateAgentTask }: SpectrumViewProps) {
  const [taskAgentId, setTaskAgentId] = useState<string | null>(null);
  const taskAgent = useMemo(() => snapshot.agents.find((agent) => agent.id === taskAgentId) ?? null, [snapshot.agents, taskAgentId]);

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
                    <button type="button" onClick={() => setTaskAgentId((current) => current === agent.id ? null : agent.id)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/70 transition hover:border-white/20 hover:text-white">
                      {taskAgentId === agent.id ? 'Close Task' : 'Schedule Task'}
                    </button>
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
          {snapshot.groups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-6 py-10 text-center text-sm leading-7 text-white/45">
              Groups are empty right now. Once multiple chatbots exist, we can wire manual @mention collaboration on top of their local specs.
            </div>
          ) : (
            <div className="space-y-3">
              {snapshot.groups.map((group) => (
                <div key={group.id} className="rounded-3xl border border-white/8 bg-black/20 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Group</div>
                  <div className="mt-2 text-lg font-semibold text-white">{group.name}</div>
                  <div className="mt-2 text-sm leading-7 text-white/58">{group.description || 'No description yet.'}</div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/38">{group.memberAgentIds.length} members</div>
                </div>
              ))}
            </div>
          )}
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
