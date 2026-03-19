import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, MessageSquareMore, Sparkles, Trash2, Users } from 'lucide-react';
import type { TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import { TaskComposerCard } from './TaskComposerCard';
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
  show: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function SpectrumView({
  snapshot,
  busy,
  onCreateAgentTask,
  onUpsertGroup,
  onDeleteGroup,
  onOpenChat,
}: SpectrumViewProps) {
  const [taskAgentId, setTaskAgentId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [routingMode, setRoutingMode] = useState<'auto' | 'manual'>('auto');
  const [defaultResponderAgentId, setDefaultResponderAgentId] = useState('');

  const taskAgent = useMemo(
    () => snapshot.agents.find((agent) => agent.id === taskAgentId) ?? null,
    [snapshot.agents, taskAgentId],
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

  return (
    <div className="space-y-5">
      <Card variant="elevated" padding="lg" animate={false} className="bg-surface-2">
        <CardHeader
          title="Chatbots & Groups"
          subtitle="Manage saved chatbots, build groups, and route new work without leaving Spectrum."
          icon={<Sparkles size={16} className="text-brand-light" />}
          action={
            <div className="flex flex-wrap gap-2">
              <Badge variant="brand">Chatbots {snapshot.agents.length}</Badge>
              <Badge variant="brand">Groups {snapshot.groups.length}</Badge>
              <Badge variant="brand">
                Models {snapshot.models.filter((model) => model.installed).length}
              </Badge>
            </div>
          }
        />
      </Card>

      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
          <SectionLabel count={snapshot.agents.length} action={<Bot size={16} className="text-white/35" />}>
            Chatbots
          </SectionLabel>
          <Divider className="my-4" />

          {snapshot.agents.length === 0 ? (
            <EmptyState
              icon={<Bot size={18} className="text-white/45" />}
              title="No chatbots yet"
              description="Create your first assistant in Prism, then return here to open chats or schedule work."
              compact
            />
          ) : (
            <motion.div
              className="space-y-4"
              variants={listVariants}
              initial="hidden"
              animate="show"
            >
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
                            icon={<MessageSquareMore size={14} />}
                            onClick={() => onOpenChat({ type: 'agent', id: agent.id })}
                          >
                            Open Chat
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={taskAgentId === agent.id ? 'brand' : 'ghost'}
                            onClick={() => setTaskAgentId((current) => (current === agent.id ? null : agent.id))}
                          >
                            {taskAgentId === agent.id ? 'Close Task' : 'Task'}
                          </Button>
                        </div>
                      }
                    />

                    {agent.description ? (
                      <p className="mt-3 text-sm leading-6 text-white/65">{agent.description}</p>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <InfoTile
                        label="Provider"
                        value={agent.providerStrategy.mode.replaceAll('_', ' ')}
                      />
                      <InfoTile
                        label="Tools"
                        value={agent.tools.length ? agent.tools.join(', ') : 'None'}
                      />
                      <InfoTile
                        label="Skills"
                        value={agent.skills.length ? agent.skills.join(', ') : 'None'}
                      />
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </Card>

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
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Growth Council"
              />

              <label className="block space-y-1.5">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">
                  Description
                </span>
                <textarea
                  value={groupDescription}
                  onChange={(event) => setGroupDescription(event.target.value)}
                  className="min-h-[104px] w-full rounded-xl border border-white/[0.10] bg-surface-1 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90 outline-none transition-all duration-150 placeholder:text-white/25 hover:border-white/[0.16] focus:border-[#7c5cfc]/50 focus:ring-2 focus:ring-[#7c5cfc]/20"
                  placeholder="Optional description"
                />
              </label>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">
                  Members
                </div>
                {snapshot.agents.length === 0 ? (
                  <EmptyState
                    icon={<Bot size={16} className="text-white/45" />}
                    title="No chatbots available"
                    description="Create chatbots first, then add them to a group."
                    compact
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {snapshot.agents.map((agent) => {
                      const selected = selectedMemberIds.includes(agent.id);

                      return (
                        <Button
                          key={agent.id}
                          type="button"
                          size="xs"
                          variant={selected ? 'brand' : 'secondary'}
                          onClick={() => toggleMember(agent.id)}
                        >
                          {agent.name}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/50">
                    Routing
                  </div>
                  <div className="flex gap-2 rounded-2xl border border-white/[0.08] bg-surface-1 p-1">
                    <Button
                      type="button"
                      variant={routingMode === 'auto' ? 'brand' : 'ghost'}
                      size="sm"
                      className="flex-1 justify-center"
                      onClick={() => setRoutingMode('auto')}
                    >
                      Auto
                    </Button>
                    <Button
                      type="button"
                      variant={routingMode === 'manual' ? 'brand' : 'ghost'}
                      size="sm"
                      className="flex-1 justify-center"
                      onClick={() => setRoutingMode('manual')}
                    >
                      Manual
                    </Button>
                  </div>
                </div>

                <Select
                  label="Fallback Agent"
                  value={defaultResponderAgentId}
                  onChange={(event) => setDefaultResponderAgentId(event.target.value)}
                  options={fallbackOptions}
                />
              </div>

              <Button
                type="submit"
                variant="brand"
                size="lg"
                fullWidth
                loading={busy}
                disabled={!groupName.trim()}
              >
                Save Group
              </Button>
            </form>
          </Card>

          <Divider label="Saved Groups" className="my-5" />

          {snapshot.groups.length === 0 ? (
            <EmptyState
              icon={<Users size={18} className="text-white/45" />}
              title="No groups yet"
              description="Create a group to route work across multiple chatbots."
              compact
            />
          ) : (
            <motion.div
              className="space-y-4"
              variants={listVariants}
              initial="hidden"
              animate="show"
            >
              {snapshot.groups.map((group) => (
                <motion.div key={group.id} variants={itemVariants}>
                  <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                    <CardHeader
                      title={group.name}
                      subtitle={`${group.memberAgentIds.length} member${group.memberAgentIds.length === 1 ? '' : 's'}`}
                      action={
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="info">
                            {group.routingMode === 'auto'
                              ? `Auto ${Math.round(group.autoRouteThreshold * 100)}%`
                              : 'Manual'}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            icon={<MessageSquareMore size={14} />}
                            onClick={() => onOpenChat({ type: 'group', id: group.id })}
                          >
                            Open Chat
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            icon={<Trash2 size={14} />}
                            disabled={busy}
                            onClick={() => onDeleteGroup(group.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      }
                    />

                    {group.description ? (
                      <p className="mt-3 text-sm leading-6 text-white/65">{group.description}</p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="default">Members {group.memberAgentIds.length}</Badge>
                      {group.defaultResponderAgentId ? (
                        <Badge variant="outline">Fallback Set</Badge>
                      ) : (
                        <Badge variant="outline">No Fallback</Badge>
                      )}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </Card>
      </section>

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
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-1 px-3.5 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-white/72">{value}</div>
    </div>
  );
}
