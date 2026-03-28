import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, MessageSquareMore, Trash2, Users } from 'lucide-react';
import type { WorkspaceSnapshot } from '@/lib/electron';
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

interface GroupsWorkspaceProps {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
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

export function GroupsWorkspace({
  snapshot,
  busy,
  onUpsertGroup,
  onDeleteGroup,
  onOpenChat,
}: GroupsWorkspaceProps) {
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [routingMode, setRoutingMode] = useState<'auto' | 'manual'>('auto');
  const [defaultResponderAgentId, setDefaultResponderAgentId] = useState('');

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupName.trim()) return;
    await onUpsertGroup({
      name: groupName.trim(),
      ...(groupDescription.trim() ? { description: groupDescription.trim() } : {}),
      memberAgentIds: selectedMemberIds,
      routingMode,
      autoRouteThreshold: 0.7, // Add slider if customizable
      ...(defaultResponderAgentId ? { defaultResponderAgentId } : {}),
    });
    setGroupName('');
    setGroupDescription('');
    setSelectedMemberIds([]);
    setRoutingMode('auto');
    setDefaultResponderAgentId('');
  };

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const fallbackOptions = [
    { label: 'None', value: '' },
    ...snapshot.agents.filter((a) => selectedMemberIds.includes(a.id)).map((a) => ({ label: `Fallback: ${a.name}`, value: a.id })),
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-8 pb-32 custom-scrollbar">
      <div className="mx-auto w-full max-w-4xl space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-display font-medium tracking-tight text-slate-900 dark:text-white">Groups</h1>
          <p className="text-[15px] leading-relaxed text-slate-500 dark:text-white/60">
            Create multi-agent chat environments where agents auto-route messages and collaborate.
          </p>
        </header>

        <section className="space-y-6">
          <Card variant="default" padding="lg" animate={false} className="bg-surface-1 dark:bg-surface-2 shadow-sm">
            <SectionLabel count={snapshot.groups.length} action={<Users size={16} className="text-slate-400 dark:text-white/35" />}>
              Groups
            </SectionLabel>
            <Divider className="my-4 border-black/5 dark:border-white/10" />

            <Card variant="default" padding="md" animate={false} className="bg-white dark:bg-surface-3 shadow-none border-black/5 dark:border-white/[0.04]">
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <Input
                  label="Group Name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Growth Council"
                />
                <label className="block space-y-1.5">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500 dark:text-white/50">
                    Description
                  </span>
                  <textarea
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    className="min-h-[80px] w-full rounded-xl border border-black/10 dark:border-white/[0.10] bg-white dark:bg-surface-1 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-900 dark:text-white/90 outline-none transition-all duration-150 placeholder:text-slate-400 dark:placeholder:text-white/25 hover:border-black/20 dark:hover:border-white/[0.16] focus:border-brand/50 focus:ring-2 focus:ring-brand/20"
                    placeholder="Optional description"
                  />
                </label>
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500 dark:text-white/50">Members</div>
                  {snapshot.agents.length === 0 ? (
                    <EmptyState icon={<Bot size={16} className="text-slate-400 dark:text-white/45" />} title="No agents" compact />
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
                    <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500 dark:text-white/50">Routing</div>
                    <div className="flex gap-2 rounded-2xl border border-black/10 dark:border-white/[0.08] bg-white dark:bg-surface-1 p-1">
                      <Button type="button" variant={routingMode === 'auto' ? 'brand' : 'ghost'} size="sm" className="flex-1 justify-center" onClick={() => setRoutingMode('auto')}>Auto</Button>
                      <Button type="button" variant={routingMode === 'manual' ? 'brand' : 'ghost'} size="sm" className="flex-1 justify-center" onClick={() => setRoutingMode('manual')}>Manual</Button>
                    </div>
                  </div>
                  <Select label="Fallback Agent" value={defaultResponderAgentId} onChange={(e) => setDefaultResponderAgentId(e.target.value)} options={fallbackOptions} />
                </div>
                <Button type="submit" variant="brand" size="lg" fullWidth loading={busy} disabled={!groupName.trim()}>Save Group</Button>
              </form>
            </Card>

            <Divider label="Saved Groups" className="my-5 border-black/5 dark:border-white/10" />

            {snapshot.groups.length === 0 ? (
              <EmptyState icon={<Users size={18} className="text-slate-400 dark:text-white/45" />} title="No groups" compact />
            ) : (
              <motion.div className="space-y-4" variants={listVariants} initial="hidden" animate="show">
                {snapshot.groups.map((group) => (
                  <motion.div key={group.id} variants={itemVariants}>
                    <Card variant="default" padding="md" animate={false} className="bg-white dark:bg-surface-3 shadow-none border-black/5 dark:border-white/[0.04]">
                      <CardHeader
                        title={group.name}
                        action={
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="info">{group.routingMode === 'auto' ? `Auto ${Math.round(group.autoRouteThreshold * 100)}%` : 'Manual'}</Badge>
                            <Button type="button" size="sm" variant="secondary" icon={<MessageSquareMore size={14} />} onClick={() => onOpenChat({ type: 'group', id: group.id })}>Chat</Button>
                            <Button type="button" size="sm" variant="danger" icon={<Trash2 size={14} />} disabled={busy} onClick={() => onDeleteGroup(group.id)}>Delete</Button>
                          </div>
                        }
                      />
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
