import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Cpu,
  Globe,
  MessageSquareMore,
  Plug,
  Search,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import type { TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import { CAPABILITY_DEFINITIONS } from '@raman-ai/shared';
import { TaskComposerCard } from './TaskComposerCard';
import { AgentProfilePanel } from './AgentProfilePanel';
import type { ChatTarget } from './ChatsWorkspace';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Divider,
  EmptyState,
  Input,
  SectionLabel,
  Select,
} from './ui';

type DirectoryTab = 'agents' | 'capabilities' | 'models';

interface DirectoryViewProps {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  onCreateAgentTask: (input: TaskCreateInput) => Promise<void>;
  onDeleteAgent?: (agentId: string) => Promise<void>;
  onOpenChat: (target: ChatTarget) => void;
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

const CAPABILITY_ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  web_search: Globe,
  thinking: Sparkles,
  code_execution: Terminal,
  file_management: Wrench,
  shell: Terminal,
  browser: Globe,
  api_calls: Plug,
  mcp: Zap,
};

const CAPABILITY_CATALOG = CAPABILITY_DEFINITIONS.map((def) => ({
  ...def,
  icon: CAPABILITY_ICON_MAP[def.id] ?? Zap,
}));

export function DirectoryView({
  snapshot,
  busy,
  onCreateAgentTask,
  onDeleteAgent,
  onOpenChat,
}: DirectoryViewProps) {
  const [activeTab, setActiveTab] = useState<DirectoryTab>('agents');
  const [taskAgentId, setTaskAgentId] = useState<string | null>(null);
  const [profileAgentId, setProfileAgentId] = useState<string | null>(null);


  const taskAgent = useMemo(
    () => snapshot.agents.find((agent) => agent.id === taskAgentId) ?? null,
    [snapshot.agents, taskAgentId],
  );

  const profileAgent = useMemo(
    () => snapshot.agents.find((agent) => agent.id === profileAgentId) ?? null,
    [snapshot.agents, profileAgentId],
  );


  const allCapabilities = useMemo(() => {
    const used = new Set<string>();
    for (const agent of snapshot.agents) {
      for (const tool of agent.tools) used.add(tool);
      for (const skill of agent.skills) used.add(skill);
    }
    return CAPABILITY_CATALOG.map((cap) => ({
      ...cap,
      active: used.has(cap.id),
      agentCount: snapshot.agents.filter(
        (a) => a.tools.includes(cap.id) || a.skills.includes(cap.id),
      ).length,
    }));
  }, [snapshot.agents]);

  const tabs: Array<{ id: DirectoryTab; label: string; count: number }> = [
    { id: 'agents', label: 'AGENTS', count: snapshot.agents.length },
    { id: 'capabilities', label: 'CAPABILITIES', count: allCapabilities.filter((c) => c.active).length },
    { id: 'models', label: 'AI MODELS', count: snapshot.models.filter((m) => m.installed).length },
  ];

  return (
    <div className="space-y-5">
      {/* Header with tabs */}
      <Card variant="elevated" padding="lg" animate={false} className="bg-surface-2">
        <CardHeader
          title="Agents"
          icon={<Cpu size={16} className="text-brand-light" />}
          action={
            <div className="flex flex-wrap gap-2">
              <Badge variant="brand">Agents {snapshot.agents.length}</Badge>

              <Badge variant="brand">Models {snapshot.models.filter((m) => m.installed).length}</Badge>
            </div>
          }
        />
        <div className="mt-4 flex items-center rounded-xl border border-black/8 dark:border-white/[0.06] bg-surface-0/50 p-0.5">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'relative flex-1 rounded-lg px-4 py-2 text-xs font-semibold tracking-[0.04em] transition-all duration-150',
                  active ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/65',
                ].join(' ')}
              >
                {active && (
                  <motion.div
                    layoutId="directory-tab"
                    className="absolute inset-0 rounded-lg bg-brand/[0.12] border border-brand/20"
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {tab.label}
                  <span className={`text-[10px] ${active ? 'text-brand-light' : 'text-slate-400 dark:text-white/25'}`}>
                    {tab.count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* AGENTS tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'agents' && (
          <motion.div
            key="agents"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
              {/* Agent list */}
              <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
                <SectionLabel count={snapshot.agents.length} action={<Bot size={16} className="text-white/35" />}>
                  Agents
                </SectionLabel>
                <Divider className="my-4" />

                {snapshot.agents.length === 0 ? (
                  <EmptyState
                    icon={<Bot size={18} className="text-white/45" />}
                    title="No agents yet"
                    compact
                  />
                ) : (
                  <motion.div className="space-y-4" variants={listVariants} initial="hidden" animate="show">
                    {snapshot.agents.map((agent) => (
                      <motion.div key={agent.id} variants={itemVariants}>
                        <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                          <CardHeader
                            title={agent.name}
                            action={
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setProfileAgentId(agent.id)}
                                >
                                  Profile
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  icon={<MessageSquareMore size={14} />}
                                  onClick={() => onOpenChat({ type: 'agent', id: agent.id })}
                                >
                                  Chat
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={taskAgentId === agent.id ? 'brand' : 'ghost'}
                                  onClick={() => setTaskAgentId((c) => (c === agent.id ? null : agent.id))}
                                >
                                  {taskAgentId === agent.id ? 'Close' : 'Task'}
                                </Button>
                              </div>
                            }
                          />
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {[...agent.tools, ...agent.skills].map((cap) => (
                              <Badge key={cap} variant="outline" size="xs">{cap}</Badge>
                            ))}
                            {agent.tools.length === 0 && agent.skills.length === 0 && (
                              <span className="text-[11px] text-slate-400 dark:text-white/30">No capabilities</span>
                            )}
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </Card>


            </section>
          </motion.div>
        )}

        {/* CAPABILITIES tab */}
        {activeTab === 'capabilities' && (
          <motion.div
            key="capabilities"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {allCapabilities.map((cap) => {
                const Icon = cap.icon;
                return (
                  <Card key={cap.id} variant="default" padding="lg" animate={false} className="bg-surface-2">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${cap.active ? 'border-brand/20 bg-brand/10' : 'border-black/8 dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.04]'}`}>
                        <Icon size={18} className={cap.active ? 'text-brand-light' : 'text-slate-400 dark:text-white/40'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{cap.label}</h3>
                          <Badge variant={cap.active ? 'success' : 'outline'} size="xs">
                            {cap.active ? 'Active' : 'Available'}
                          </Badge>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <Badge variant="default" size="xs">{cap.category}</Badge>
                          {cap.agentCount > 0 && (
                            <span className="text-[11px] text-slate-400 dark:text-white/30">{cap.agentCount} agent{cap.agentCount !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {/* Placeholder for extensibility */}
              <Card variant="default" padding="lg" animate={false} className="bg-surface-2 border-dashed">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/8 dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02]">
                    <Plug size={18} className="text-slate-300 dark:text-white/25" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-400 dark:text-white/50">More Skills</h3>
                  </div>
                </div>
              </Card>
            </section>
          </motion.div>
        )}

        {/* AI MODELS tab */}
        {activeTab === 'models' && (
          <motion.div
            key="models"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.models.map((model) => (
                <Card key={model.id} variant="default" padding="lg" animate={false} className="bg-surface-2">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${model.installed ? 'border-[#34d399]/20 bg-[#34d399]/10' : 'border-black/8 dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.04]'}`}>
                      <Cpu size={18} className={model.installed ? 'text-[#34d399]' : 'text-slate-400 dark:text-white/40'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{model.label}</h3>
                        <Badge variant={model.installed ? 'success' : 'default'} size="xs">
                          {model.installed ? 'Installed' : 'Available'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] font-mono text-slate-400 dark:text-white/35 truncate">{model.id}</p>
                    </div>
                  </div>
                </Card>
              ))}

              {snapshot.models.length === 0 && (
                <div className="col-span-full">
                <EmptyState
                  icon={<Cpu size={18} className="text-slate-400 dark:text-white/45" />}
                  title="No models"
                  compact
                />
                </div>
              )}
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task composer */}
      {taskAgent ? (
        <TaskComposerCard
          title={`New Task - ${taskAgent.name}`}
          subtitle=""
          target={{ type: 'agent', agentId: taskAgent.id }}
          defaultMode="task"
          models={snapshot.models}
          busy={busy}
          onCreate={onCreateAgentTask}
        />
      ) : null}

      {/* Agent Profile Panel */}
      <AgentProfilePanel
        agent={profileAgent}
        open={profileAgentId !== null}
        onClose={() => setProfileAgentId(null)}
        onOpenChat={(agentId) => {
          setProfileAgentId(null);
          onOpenChat({ type: 'agent', id: agentId });
        }}
        {...(onDeleteAgent ? { onDeleteAgent } : {})}
      />
    </div>
  );
}
