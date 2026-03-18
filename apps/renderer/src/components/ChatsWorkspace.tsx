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
    ? { label: 'Runtime bridge ready', tone: 'ready' as const }
    : snapshot.runtime.ollamaReady
      ? { label: 'Ollama-ready', tone: 'ready' as const }
      : { label: 'Runtime needed', tone: 'warning' as const };

  const agentThreadStatus = busy
    ? { label: 'Sending', tone: 'active' as const }
    : transcript.length > 0
      ? { label: 'Thread active', tone: 'active' as const }
      : { label: 'Thread empty', tone: 'warning' as const };

  const groupThreadStatus = busy
    ? { label: 'Routing mentions', tone: 'active' as const }
    : transcript.length > 0
      ? { label: 'Thread active', tone: 'active' as const }
      : { label: 'Thread empty', tone: 'warning' as const };

  return (
    <div className="grid min-h-full gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-[32px] border border-white/10 bg-white/5 p-5">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Chats</div>
        <div className="mt-4 space-y-6">
          <EntityListSection<AgentSpec>
            title="Chatbots"
            items={snapshot.agents}
            selectedId={selectedTarget?.type === 'agent' ? selectedTarget.id : null}
            emptyText="No chatbots yet. Ask Prism to create one first."
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
            emptyText="No groups yet. Create one in Spectrum."
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

      <div className="min-w-0 space-y-6">
        {!selectedTarget ? (
          <div className="flex min-h-[720px] items-center justify-center rounded-[32px] border border-white/10 bg-white/5 px-8 text-center text-sm leading-7 text-white/45">
            <div className="max-w-2xl">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/38">Chats</div>
              <div className="mt-3 text-2xl font-semibold text-white">Select a chatbot or group to begin.</div>
              <div className="mt-4">
                {snapshot.agents.length === 0 && snapshot.groups.length === 0
                  ? 'No chats are available yet. Create a chatbot in Prism and it will appear here automatically.'
                  : 'Choose a thread from the left rail or deep-link into one from Spectrum or Work.'}
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
              emptyState={snapshot.runtime.available ? 'Start the first local conversation with this chatbot.' : 'The local runtime is not available yet. Open Settings, check the runtime, then send the first message.'}
            />
            {showTaskComposer ? (
              <TaskComposerCard
                title={`Schedule ${selectedAgent.name}`}
                subtitle="Create a dedicated autonomous run against this chatbot’s local spec. The result will land in Work."
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
              ...(selectedGroup.description ? { description: selectedGroup.description } : {})
            }}
            members={mentionableMembers}
            transcript={transcript}
            busy={busy}
            onSendMessage={(message) => onSendGroupMessage({ groupId: selectedGroup.id, message })}
            {...(selectedThread ? { onResetThread: () => onDeleteThread(selectedThread.id) } : {})}
            emptyState={snapshot.runtime.available ? 'Mention one or more member chatbots with @chatbot-name to route the message manually.' : 'The local runtime is not available yet. Open Settings before sending the first group message.'}
            placeholder="Message the group. Use @chatbot-name to route replies."
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
      <div className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{title}</div>
      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 px-4 py-6 text-sm leading-7 text-white/45">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const active = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${active ? 'border-white/18 bg-white text-black' : 'border-white/10 bg-black/20 text-white hover:border-white/18 hover:bg-white/6'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-2xl border px-3 py-3 ${active ? 'border-black/10 bg-black/5 text-black' : 'border-white/10 bg-white/5 text-white/60'}`}>
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{getLabel(item)}</div>
                    <div className={`mt-1 text-xs leading-6 ${active ? 'text-black/65' : 'text-white/50'}`}>{getBody(item)}</div>
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
