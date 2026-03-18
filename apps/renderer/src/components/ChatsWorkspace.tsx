import React, { useEffect, useMemo, useState } from 'react';
import { Bot, BrainCircuit } from 'lucide-react';
import type { AgentSpec, ChatThread, GroupSpec } from '@supreme/shared';
import type { AgentChatInput, GroupChatInput, TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import { TaskComposerCard } from './TaskComposerCard';
import { GroupChatView, PersistentChatbotChatView } from './chat';

export interface ChatTarget {
  type: 'agent' | 'group';
  id: string;
}

export interface ChatDraftSeed {
  target: ChatTarget;
  token: string;
  text: string;
}

interface ChatsWorkspaceProps {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  selectedTarget: ChatTarget | null;
  draftSeed: ChatDraftSeed | null;
  onSelectTarget: (target: ChatTarget | null) => void;
  onSendAgentMessage: (input: AgentChatInput) => Promise<void>;
  onSendGroupMessage: (input: GroupChatInput) => Promise<void>;
  onCreateTask: (input: TaskCreateInput) => Promise<void>;
  onDeleteThread: (threadId: string) => Promise<void>;
}

export function ChatsWorkspace({
  snapshot,
  busy,
  selectedTarget,
  draftSeed,
  onSelectTarget,
  onSendAgentMessage,
  onSendGroupMessage,
  onCreateTask,
  onDeleteThread
}: ChatsWorkspaceProps) {
  const [showTaskComposer, setShowTaskComposer] = useState(false);

  useEffect(() => {
    if (selectedTarget) {
      const stillExists = selectedTarget.type === 'agent'
        ? snapshot.agents.some((agent) => agent.id === selectedTarget.id)
        : snapshot.groups.some((group) => group.id === selectedTarget.id);
      if (stillExists) {
        return;
      }
    }

    const firstAgent = snapshot.agents[0];
    if (firstAgent) {
      onSelectTarget({ type: 'agent', id: firstAgent.id });
      return;
    }

    const firstGroup = snapshot.groups[0];
    if (firstGroup) {
      onSelectTarget({ type: 'group', id: firstGroup.id });
      return;
    }

    onSelectTarget(null);
  }, [onSelectTarget, selectedTarget, snapshot.agents, snapshot.groups]);

  useEffect(() => {
    setShowTaskComposer(false);
  }, [selectedTarget?.id, selectedTarget?.type]);

  const selectedAgent = useMemo(
    () => selectedTarget?.type === 'agent' ? snapshot.agents.find((agent) => agent.id === selectedTarget.id) ?? null : null,
    [selectedTarget, snapshot.agents]
  );
  const selectedGroup = useMemo(
    () => selectedTarget?.type === 'group' ? snapshot.groups.find((group) => group.id === selectedTarget.id) ?? null : null,
    [selectedTarget, snapshot.groups]
  );
  const selectedThread = useMemo(
    () => selectedTarget ? findThread(snapshot.chatThreads, selectedTarget) : null,
    [snapshot.chatThreads, selectedTarget]
  );

  const transcript = useMemo(
    () => (selectedThread?.messages ?? []).map((entry) => ({
      id: entry.id,
      role: entry.role,
      text: entry.text,
      ...(entry.authorLabel ? { label: entry.authorLabel } : {}),
      ...(entry.mentions?.length ? { mentions: entry.mentions } : {}),
      ...(entry.route ? { route: entry.route } : {}),
      timestamp: new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    })),
    [selectedThread]
  );

  const mentionableMembers = useMemo(() => {
    if (!selectedGroup) return [];
    return snapshot.agents
      .filter((agent) => selectedGroup.memberAgentIds.includes(agent.id))
      .map((agent) => ({
        id: agent.id,
        label: slugify(agent.name),
        subtitle: agent.name,
        handle: `@${slugify(agent.name)}`
      }));
  }, [selectedGroup, snapshot.agents]);

  const runtimeStatus = snapshot.runtime.runtimeBridgeReady
    ? { label: 'Ready', tone: 'ready' as const }
    : snapshot.runtime.ollamaReady
      ? { label: 'Local', tone: 'ready' as const }
      : { label: 'Check', tone: 'warning' as const };

  const agentThreadStatus = busy
    ? { label: 'Sending', tone: 'active' as const }
    : transcript.length > 0
      ? { label: 'Active', tone: 'active' as const }
      : { label: 'Empty', tone: 'warning' as const };

  const groupThreadStatus = busy
    ? { label: 'Sending', tone: 'active' as const }
    : transcript.length > 0
      ? { label: 'Active', tone: 'active' as const }
      : { label: 'Empty', tone: 'warning' as const };

  return (
    <div className="grid min-h-full gap-3 xl:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1012]">
        <div className="h-14 border-b border-white/8 px-4">
          <div className="flex h-full items-center">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/38">Chats</div>
          </div>
        </div>
        <div className="space-y-4 p-3">
          <EntityListSection<AgentSpec>
            title="Chatbots"
            items={snapshot.agents}
            selectedId={selectedTarget?.type === 'agent' ? selectedTarget.id : null}
            emptyText="No chatbots."
            getLabel={(agent) => agent.name}
            getBody={(agent) => agent.description}
            icon={<Bot size={16} />}
            onSelect={(agent) => {
              onSelectTarget({ type: 'agent', id: agent.id });
              setShowTaskComposer(false);
            }}
          />
          <EntityListSection<GroupSpec>
            title="Groups"
            items={snapshot.groups}
            selectedId={selectedTarget?.type === 'group' ? selectedTarget.id : null}
            emptyText="No groups."
            getLabel={(group) => group.name}
            getBody={(group) => group.description || `${group.memberAgentIds.length} members`}
            icon={<BrainCircuit size={16} />}
            onSelect={(group) => {
              onSelectTarget({ type: 'group', id: group.id });
              setShowTaskComposer(false);
            }}
          />
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {!selectedTarget ? (
          <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center rounded-[28px] border border-white/10 bg-[#0d1012] px-8 text-center">
            <div className="max-w-md">
              <div className="text-[9px] font-black uppercase tracking-[0.22em] text-white/38">Chats</div>
              <div className="mt-3 text-lg font-semibold text-white">Open a chat.</div>
              <div className="mt-3 text-sm leading-6 text-white/45">
                {snapshot.agents.length === 0 && snapshot.groups.length === 0
                  ? 'Nothing here yet.'
                  : 'Pick one from the left.'}
              </div>
            </div>
          </div>
        ) : selectedAgent ? (
          <>
            <PersistentChatbotChatView
              chatbot={{
                id: selectedAgent.id,
                name: selectedAgent.name,
                role: selectedAgent.persona.role,
                modelLabel: describeProviderStrategy(selectedAgent),
                providerLabel: selectedAgent.providerStrategy.mode.replaceAll('_', ' '),
                runtimeStatus,
                threadStatus: agentThreadStatus,
                ...(selectedAgent.description ? { description: selectedAgent.description } : {})
              }}
              transcript={transcript}
              busy={busy}
              onSendMessage={(message) => onSendAgentMessage({ agentId: selectedAgent.id, message })}
              onTaskClick={() => setShowTaskComposer((current) => !current)}
              {...(selectedThread ? { onResetThread: () => onDeleteThread(selectedThread.id) } : {})}
              {...(draftSeed && draftSeed.target.type === 'agent' && draftSeed.target.id === selectedAgent.id ? { draftSeed } : {})}
              emptyState={snapshot.runtime.available ? 'Start the chat.' : 'Check Settings if messages are not sending.'}
            />
            {showTaskComposer ? (
              <TaskComposerCard
                title={`New Task · ${selectedAgent.name}`}
                subtitle=""
                target={{ type: 'agent', agentId: selectedAgent.id }}
                defaultMode="task"
                models={snapshot.models}
                busy={busy}
                onCreate={onCreateTask}
              />
            ) : null}
          </>
        ) : selectedGroup ? (
          <GroupChatView
            group={{
              id: selectedGroup.id,
              name: selectedGroup.name,
              memberCount: selectedGroup.memberAgentIds.length,
              runtimeStatus,
              threadStatus: groupThreadStatus,
              routingMode: selectedGroup.routingMode,
              ...(selectedGroup.description ? { description: selectedGroup.description } : {})
            }}
            members={mentionableMembers}
            transcript={transcript}
            busy={busy}
            onSendMessage={(message) => onSendGroupMessage({ groupId: selectedGroup.id, message })}
            {...(selectedThread ? { onResetThread: () => onDeleteThread(selectedThread.id) } : {})}
            emptyState={snapshot.runtime.available ? (selectedGroup.routingMode === 'auto' ? 'Message the group. Routing will pick the best fit.' : 'Route with @mentions.') : 'Check Settings if messages are not sending.'}
            placeholder={selectedGroup.routingMode === 'auto' ? 'Message the group' : 'Message the group with @mentions'}
          />
        ) : null}
      </div>
    </div>
  );
}

function findThread(threads: ChatThread[], target: ChatTarget) {
  return threads.find((thread) => thread.targetType === target.type && thread.targetId === target.id) ?? null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function describeProviderStrategy(agent: AgentSpec) {
  if (agent.providerStrategy.mode === 'fixed') {
    return `${agent.providerStrategy.provider}:${agent.providerStrategy.modelId}`;
  }
  if (agent.providerStrategy.mode === 'user_override') {
    return `${agent.providerStrategy.defaultProvider}:${agent.providerStrategy.defaultModelId}`;
  }
  return agent.providerStrategy.preferredLocalModelIds[0] ?? 'automatic local model';
}

function EntityListSection<T extends { id: string }>({
  title,
  items,
  selectedId,
  emptyText,
  getLabel,
  getBody,
  icon,
  onSelect
}: {
  title: string;
  items: T[];
  selectedId: string | null;
  emptyText: string;
  getLabel: (item: T) => string;
  getBody: (item: T) => string;
  icon: React.ReactNode;
  onSelect: (item: T) => void;
}) {
  return (
    <div>
      <div className="mb-2 px-1.5 text-[8px] font-black uppercase tracking-[0.26em] text-white/24">{title}</div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 bg-black/20 px-3 py-4 text-xs leading-5 text-white/45">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-0.5">
          {items.map((item) => {
            const active = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${active ? 'border-white/12 bg-white text-black' : 'border-transparent bg-transparent text-white hover:border-white/10 hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg border px-2 py-2 ${active ? 'border-black/10 bg-black/5 text-black' : 'border-white/10 bg-white/5 text-white/50'}`}>
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-black uppercase tracking-[0.08em]">{getLabel(item)}</div>
                    <div className={`mt-0.5 line-clamp-2 text-[10px] leading-4 ${active ? 'text-black/65' : 'text-white/42'}`}>{getBody(item)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
