import React, { useEffect, useMemo, useState } from 'react';
import { Bot, BrainCircuit } from 'lucide-react';
import { ChatIcon } from './icons/ChatIcon';
import type { AgentSpec, ChatThread, GroupSpec, GroupRouteMetadata } from '@supreme/shared';
import type { AgentChatInput, GroupChatInput, TaskCreateInput, WorkspaceSnapshot } from '@/lib/electron';
import type { ChatTranscriptMessage } from './chat/types';
import { TaskComposerCard } from './TaskComposerCard';
import { GroupChatView, PersistentChatbotChatView } from './chat';
import { SectionLabel, EmptyState } from './ui';
import { motion } from 'framer-motion';

export interface ChatTarget {
  type: 'agent' | 'group';
  id: string;
}

export interface ChatDraftSeed {
  target: ChatTarget;
  token: string;
  text: string;
}

export interface ActiveChatStreamState {
  scope: 'agent' | 'group';
  targetId: string;
  streamId: string;
  userMessage: string;
  text: string;
  assistantLabel?: string;
  routeMode?: string;
}

interface ChatsWorkspaceProps {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  selectedTarget: ChatTarget | null;
  draftSeed: ChatDraftSeed | null;
  chatStream: ActiveChatStreamState | null;
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
  chatStream,
  onSelectTarget,
  onSendAgentMessage,
  onSendGroupMessage,
  onCreateTask,
  onDeleteThread
}: ChatsWorkspaceProps) {
  const [showTaskComposer, setShowTaskComposer] = useState(false);
  const chatAgents = useMemo(
    () => snapshot.agents.filter((a) => a.slug !== 'prism' && a.id !== 'prism'),
    [snapshot.agents]
  );

  useEffect(() => {
    if (selectedTarget) {
      const stillExists = selectedTarget.type === 'agent'
        ? chatAgents.some((agent) => agent.id === selectedTarget.id)
        : snapshot.groups.some((group) => group.id === selectedTarget.id);
      if (stillExists) {
        return;
      }
    }

    const firstAgent = chatAgents[0];
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
  }, [onSelectTarget, selectedTarget, chatAgents, snapshot.groups]);

  useEffect(() => {
    setShowTaskComposer(false);
  }, [selectedTarget?.id, selectedTarget?.type]);

  const selectedAgent = useMemo(
    () => selectedTarget?.type === 'agent' ? chatAgents.find((agent) => agent.id === selectedTarget.id) ?? null : null,
    [selectedTarget, chatAgents]
  );
  const selectedGroup = useMemo(
    () => selectedTarget?.type === 'group' ? snapshot.groups.find((group) => group.id === selectedTarget.id) ?? null : null,
    [selectedTarget, snapshot.groups]
  );
  const selectedThread = useMemo(
    () => selectedTarget ? findThread(snapshot.chatThreads, selectedTarget) : null,
    [snapshot.chatThreads, selectedTarget]
  );

  const baseTranscript = useMemo(
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

  const streamForSelection =
    chatStream && selectedTarget && chatStream.scope === selectedTarget.type && chatStream.targetId === selectedTarget.id
      ? chatStream
      : null;

  const transcript = useMemo(() => {
    if (!streamForSelection) {
      return baseTranscript;
    }
    const nowTs = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const pendingUser: ChatTranscriptMessage = {
      id: `stream-user-${streamForSelection.streamId}`,
      role: 'user',
      text: streamForSelection.userMessage,
      label: 'You',
      timestamp: nowTs
    };
    const streamingRoute: GroupRouteMetadata | undefined = streamForSelection.routeMode
      ? {
          mode: streamForSelection.routeMode as GroupRouteMetadata['mode'],
          targetType: 'group',
          targetIds: [],
          reason: 'Streaming reply'
        }
      : undefined;
    const pendingAssistant: ChatTranscriptMessage = {
      id: `stream-assistant-${streamForSelection.streamId}`,
      role: 'assistant',
      text: streamForSelection.text,
      timestamp: nowTs,
      ...(streamForSelection.assistantLabel ? { label: streamForSelection.assistantLabel } : {}),
      ...(streamingRoute ? { route: streamingRoute } : {})
    };
    const showAssistantPending =
      streamForSelection.text.length > 0 || Boolean(streamForSelection.assistantLabel);
    return showAssistantPending
      ? [...baseTranscript, pendingUser, pendingAssistant]
      : [...baseTranscript, pendingUser];
  }, [baseTranscript, streamForSelection]);

  const streamingAssistantId =
    streamForSelection && (streamForSelection.text.length > 0 || streamForSelection.assistantLabel)
      ? `stream-assistant-${streamForSelection.streamId}`
      : null;

  const mentionableMembers = useMemo(() => {
    if (!selectedGroup) return [];
    return chatAgents
      .filter((agent) => selectedGroup.memberAgentIds.includes(agent.id))
      .map((agent) => ({
        id: agent.id,
        label: slugify(agent.name),
        subtitle: agent.name,
        handle: `@${slugify(agent.name)}`
      }));
  }, [selectedGroup, chatAgents]);

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
    <div className="flex min-h-full gap-3">
        <aside className="w-64 shrink-0 overflow-hidden rounded-2xl border-r border-black/10 dark:border-white/5 bg-[#F8F9FA] dark:bg-[#111315] flex flex-col">
        <div className="h-14 border-b border-white/[0.06] px-4 shrink-0">
          <div className="flex h-full items-center">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-white/60">Chats</div>
          </div>
        </div>
        <div className="space-y-6 p-3 overflow-y-auto custom-scrollbar flex-1">
          <EntityListSection<AgentSpec>
            title="Agents"
            items={chatAgents}
            selectedId={selectedTarget?.type === 'agent' ? selectedTarget.id : null}
            emptyText="No agents."
            getLabel={(agent) => agent.name}
            getBody={() => ''}
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
            getBody={(group) => `${group.memberAgentIds.length}`}
            icon={<BrainCircuit size={16} />}
            onSelect={(group) => {
              onSelectTarget({ type: 'group', id: group.id });
              setShowTaskComposer(false);
            }}
          />
        </div>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        {!selectedTarget ? (
          <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center rounded-2xl border border-black/5 dark:border-white/5 bg-white dark:bg-white/[0.02] px-8 text-center">
            <EmptyState
              icon={<ChatIcon size={24} className="text-gray-400 dark:text-white/40" />}
              title="Open a chat."
              description={chatAgents.length === 0 && snapshot.groups.length === 0 ? 'Nothing here yet.' : 'Pick one from the left.'}
            />
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
                threadStatus: agentThreadStatus
              }}
              transcript={transcript}
              busy={busy}
              streamingMessageId={streamingAssistantId}
              onSendMessage={(message) => onSendAgentMessage({ agentId: selectedAgent.id, message })}
              onTaskClick={() => setShowTaskComposer((current) => !current)}
              {...(selectedThread ? { onResetThread: () => onDeleteThread(selectedThread.id) } : {})}
              {...(draftSeed && draftSeed.target.type === 'agent' && draftSeed.target.id === selectedAgent.id ? { draftSeed } : {})}
              emptyState=""
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
              routingMode: selectedGroup.routingMode
            }}
            members={mentionableMembers}
            transcript={transcript}
            busy={busy}
            streamingMessageId={streamingAssistantId}
            onSendMessage={(message) => onSendGroupMessage({ groupId: selectedGroup.id, message })}
            {...(selectedThread ? { onResetThread: () => onDeleteThread(selectedThread.id) } : {})}
            emptyState=""
            placeholder="Message"
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
      <SectionLabel className="mb-3 px-1.5">{title}</SectionLabel>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.08] bg-surface-3 px-3 py-4 text-xs leading-5 text-white/45">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item, index) => {
            const active = item.id === selectedId;
            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.2 }}
                type="button"
                onClick={() => onSelect(item)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active 
                    ? 'border-white/[0.12] bg-white/[0.04] text-white' 
                    : 'border-transparent bg-surface-3 text-white hover:border-white/[0.08] hover:bg-surface-4'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg border px-2 py-2 shrink-0 ${active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-black/10 dark:border-white/8 bg-black/5 dark:bg-white/[0.04] text-gray-500 dark:text-white/50'}`}>
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-white/90">{getLabel(item)}</div>
                    {getBody(item) ? <div className={`mt-0.5 line-clamp-2 text-[11px] leading-4 ${active ? 'text-white/70' : 'text-white/40'}`}>{getBody(item)}</div> : null}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}
