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

type SpectrumTab = 'agents' | 'capabilities' | 'models';

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

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

const CAPABILITY_CATALOG = [
  { id: 'web_search', label: 'Web Search', icon: Globe, description: 'Search the internet for real-time information', category: 'Skill' },
  { id: 'thinking', label: 'Thinking', icon: Sparkles, description: 'Extended reasoning and analysis', category: 'Skill' },
  { id: 'code_execution', label: 'Code Execution', icon: Terminal, description: 'Run code in sandboxed environments', category: 'Skill' },
  { id: 'file_management', label: 'File Management', icon: Wrench, description: 'Read, write, and manage local files', category: 'Skill' },
  { id: 'shell', label: 'Shell Commands', icon: Terminal, description: 'Execute system shell commands', category: 'Skill' },
  { id: 'browser', label: 'Browser Automation', icon: Globe, description: 'Navigate web pages and interact with elements', category: 'Skill' },
  { id: 'api_calls', label: 'API Integration', icon: Plug, description: 'Make HTTP requests to external APIs', category: 'Plugin' },
  { id: 'mcp', label: 'MCP Protocol', icon: Zap, description: 'Model Context Protocol tool integration', category: 'MCP' },
];

export function SpectrumView({
  snapshot,
  busy,
  onCreateAgentTask,
  onUpsertGroup,
  onDeleteGroup,
  onOpenChat,
}: SpectrumViewProps) {
  const [activeTab, setActiveTab] = useState<SpectrumTab>('agents');
  const [taskAgentId, setTaskAgentId] = useState<string | null>(null);
  const [profileAgentId, setProfileAgentId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [routingMode, setRoutingMode] = useState<'auto' | 'manual'>('auto');
  const [defaultResponderAgentId, setDefaultResponderAgentId] = useState('');

  const taskAgent = useMemo(
    () => snapshot.agents.find((agent) => agent.id === taskAgentId) ?? null,
    [snapshot.agents, taskAgentId],
  );

  const profileAgent = useMemo(
    () => snapshot.agents.find((agent) => agent.id === profileAgentId) ?? null,
    [snapshot.agents, profileAgentId],
  );

  const fallbackOptions = useMemo(
    () => [
      { value: '', label: 'None' },
      ...snapshot.agents
        .filter((agent) => selectedMemberIds.includes(agent.id))
        .map((agent) => ({ value: agent.id, label: agent.name })),
    ],
    [selectedMemberIds, snapshot.agents],
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

  const toggleMember = (agentId: string) => {
    setSelectedMemberIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
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
      ...(defaultResponderAgentId ? { defaultResponderAgentId } : {}),
    });
    setGroupName('');
    setGroupDescription('');
    setSelectedMemberIds([]);
    setRoutingMode('auto');
    setDefaultResponderAgentId('');
  };

  const tabs: Array<{ id: SpectrumTab; label: string; count: number }> = [
    { id: 'agents', label: 'AGENTS', count: snapshot.agents.length },
    { id: 'capabilities', label: 'CAPABILITIES', count: allCapabilities.filter((c) => c.active).length },
    { id: 'models', label: 'AI MODELS', count: snapshot.models.filter((m) => m.installed).length },
  ];

  return (
    <div className="space-y-5">
      {/* Header with tabs */}
      <Card variant="elevated" padding="lg" animate={false} className="bg-surface-2">
        <CardHeader
          title="Spectrum"
          subtitle="Agents, capabilities, and AI models in your workspace."
          icon={<Cpu size={16} className="text-brand-light" />}
          action={
            <div className="flex flex-wrap gap-2">
              <Badge variant="brand">Agents {snapshot.agents.length}</Badge>
              <Badge variant="brand">Groups {snapshot.groups.length}</Badge>
              <Badge variant="brand">Models {snapshot.models.filter((m) => m.installed).length}</Badge>
            </div>
          }
        />
        <div className="mt-4 flex items-center rounded-xl border border-white/[0.06] bg-surface-0/50 p-0.5">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'relative flex-1 rounded-lg px-4 py-2 text-xs font-semibold tracking-[0.04em] transition-all duration-150',
                  active ? 'text-white' : 'text-white/40 hover:text-white/65',
                ].join(' ')}
              >
                {active && (
                  <motion.div
                    layoutId="spectrum-tab"
                    className="absolute inset-0 rounded-lg bg-brand/[0.12] border border-brand/20"
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {tab.label}
                  <span className={`text-[10px] ${active ? 'text-brand-light' : 'text-white/25'}`}>
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
                    description="Create your first agent in Prism, then return here to manage them."
                    compact
                  />
                ) : (
                  <motion.div className="space-y-4" variants={listVariants} initial="hidden" animate="show">
                    {snapshot.agents.map((agent) => (
                      <motion.div key={agent.id} variants={itemVariants}>
                        <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                          <CardHeader
                            title={agent.name}
                            subtitle={agent.persona.role}
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
                          {agent.description ? (
                            <p className="mt-3 text-sm leading-6 text-white/65">{agent.description}</p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {[...agent.tools, ...agent.skills].map((cap) => (
                              <Badge key={cap} variant="outline" size="xs">{cap}</Badge>
                            ))}
                            {agent.tools.length === 0 && agent.skills.length === 0 && (
                              <span className="text-[11px] text-white/30">No capabilities</span>
                            )}
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </Card>

              {/* Groups */}
              <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
                <SectionLabel count={snapshot.groups.length} action={<Users size={16} className="text-white/35" />}>
                  Groups
                </SectionLabel>
                <Divider className="my-4" />

                <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                  <form onSubmit={handleCreateGroup} className="space-y-4">
                    <Input
                      label="Group Name"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Growth Council"
                    />
                    <label className="block space-y-1.5">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">
                        Description
                      </span>
                      <textarea
                        value={groupDescription}
                        onChange={(e) => setGroupDescription(e.target.value)}
                        className="min-h-[80px] w-full rounded-xl border border-white/[0.10] bg-surface-1 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90 outline-none transition-all duration-150 placeholder:text-white/25 hover:border-white/[0.16] focus:border-[#7c5cfc]/50 focus:ring-2 focus:ring-[#7c5cfc]/20"
                        placeholder="Optional description"
                      />
                    </label>
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">Members</div>
                      {snapshot.agents.length === 0 ? (
                        <EmptyState icon={<Bot size={16} className="text-white/45" />} title="No agents available" description="Create agents first." compact />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {snapshot.agents.map((agent) => (
                            <Button key={agent.id} type="button" size="xs" variant={selectedMemberIds.includes(agent.id) ? 'brand' : 'secondary'} onClick={() => toggleMember(agent.id)}>
                              {agent.name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">Routing</div>
                        <div className="flex gap-2 rounded-2xl border border-white/[0.08] bg-surface-1 p-1">
                          <Button type="button" variant={routingMode === 'auto' ? 'brand' : 'ghost'} size="sm" className="flex-1 justify-center" onClick={() => setRoutingMode('auto')}>Auto</Button>
                          <Button type="button" variant={routingMode === 'manual' ? 'brand' : 'ghost'} size="sm" className="flex-1 justify-center" onClick={() => setRoutingMode('manual')}>Manual</Button>
                        </div>
                      </div>
                      <Select label="Fallback Agent" value={defaultResponderAgentId} onChange={(e) => setDefaultResponderAgentId(e.target.value)} options={fallbackOptions} />
                    </div>
                    <Button type="submit" variant="brand" size="lg" fullWidth loading={busy} disabled={!groupName.trim()}>Save Group</Button>
                  </form>
                </Card>

                <Divider label="Saved Groups" className="my-5" />

                {snapshot.groups.length === 0 ? (
                  <EmptyState icon={<Users size={18} className="text-white/45" />} title="No groups yet" description="Create a group to route work across agents." compact />
                ) : (
                  <motion.div className="space-y-4" variants={listVariants} initial="hidden" animate="show">
                    {snapshot.groups.map((group) => (
                      <motion.div key={group.id} variants={itemVariants}>
                        <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                          <CardHeader
                            title={group.name}
                            subtitle={`${group.memberAgentIds.length} member${group.memberAgentIds.length === 1 ? '' : 's'}`}
                            action={
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="info">{group.routingMode === 'auto' ? `Auto ${Math.round(group.autoRouteThreshold * 100)}%` : 'Manual'}</Badge>
                                <Button type="button" size="sm" variant="secondary" icon={<MessageSquareMore size={14} />} onClick={() => onOpenChat({ type: 'group', id: group.id })}>Chat</Button>
                                <Button type="button" size="sm" variant="danger" icon={<Trash2 size={14} />} disabled={busy} onClick={() => onDeleteGroup(group.id)}>Delete</Button>
                              </div>
                            }
                          />
                          {group.description ? <p className="mt-3 text-sm leading-6 text-white/65">{group.description}</p> : null}
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
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${cap.active ? 'border-brand/20 bg-brand/10' : 'border-white/[0.08] bg-white/[0.04]'}`}>
                        <Icon size={18} className={cap.active ? 'text-brand-light' : 'text-white/40'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">{cap.label}</h3>
                          <Badge variant={cap.active ? 'success' : 'outline'} size="xs">
                            {cap.active ? 'Active' : 'Available'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[12px] text-white/45 leading-relaxed">{cap.description}</p>
                        <div className="mt-3 flex items-center gap-3">
                          <Badge variant="default" size="xs">{cap.category}</Badge>
                          {cap.agentCount > 0 && (
                            <span className="text-[11px] text-white/30">{cap.agentCount} agent{cap.agentCount !== 1 ? 's' : ''}</span>
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
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <Plug size={18} className="text-white/25" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white/50">More Skills</h3>
                    <p className="mt-1 text-[12px] text-white/30 leading-relaxed">
                      100+ AgentSkills available. Configure in agent profiles.
                    </p>
                    <div className="mt-3">
                      <Badge variant="outline" size="xs">Extensible</Badge>
                    </div>
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
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${model.installed ? 'border-[#34d399]/20 bg-[#34d399]/10' : 'border-white/[0.08] bg-white/[0.04]'}`}>
                      <Cpu size={18} className={model.installed ? 'text-[#34d399]' : 'text-white/40'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white truncate">{model.label}</h3>
                        <Badge variant={model.installed ? 'success' : 'default'} size="xs">
                          {model.installed ? 'Installed' : 'Available'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] font-mono text-white/35 truncate">{model.id}</p>
                    </div>
                  </div>
                </Card>
              ))}

              {snapshot.models.length === 0 && (
                <div className="col-span-full">
                  <EmptyState
                    icon={<Cpu size={18} className="text-white/45" />}
                    title="No models"
                    description="Install models via Settings to get started."
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
      />
    </div>
  );
}
