import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, MessageSquareMore, Play, Search, Send, Trash2, X } from 'lucide-react';
import type { AgentSpec, ArtifactRecord, TaskSpec, WorkItem } from '@supreme/shared';
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

interface WorkViewProps {
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  onDeleteTask: (taskId: string) => Promise<void>;
  onDuplicateTask: (taskId: string) => Promise<void>;
  onRerunTask: (taskId: string) => Promise<void>;
  onDeleteWorkItem: (workItemId: string) => Promise<void>;
  onSendToChat: (item: WorkItem) => void;
  onOpenChat: (target: ChatTarget | 'prism') => void;
  onOpenArtifact: (artifactId: string) => Promise<void>;
}

const listVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function WorkView({
  snapshot,
  busy,
  onDeleteTask,
  onDuplicateTask,
  onRerunTask,
  onDeleteWorkItem,
  onSendToChat,
  onOpenChat,
  onOpenArtifact,
}: WorkViewProps) {
  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskSpec['status']>('all');
  const [kindFilter, setKindFilter] = useState<'all' | 'task' | 'council' | 'artifact'>('all');

  const taskLookup = useMemo(
    () => new Map(snapshot.tasks.map((task) => [task.id, task])),
    [snapshot.tasks],
  );
  const artifactLookup = useMemo(
    () => new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact])),
    [snapshot.artifacts],
  );
  const agentLookup = useMemo(
    () => new Map(snapshot.agents.map((agent) => [agent.id, agent])),
    [snapshot.agents],
  );
  const normalizedQuery = query.trim().toLowerCase();

  const filteredTasks = useMemo(() => {
    return snapshot.tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false;
      }
      if (kindFilter !== 'all' && task.mode !== kindFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const targetLabel = describeTaskTarget(task, agentLookup);
      const searchBody = [
        task.title,
        task.objective,
        targetLabel,
        task.lastError ?? '',
        task.resultSummary ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return searchBody.includes(normalizedQuery);
    });
  }, [agentLookup, kindFilter, normalizedQuery, snapshot.tasks, statusFilter]);

  const filteredWorkItems = useMemo(() => {
    return snapshot.workItems.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (kindFilter !== 'all' && item.type !== kindFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const sourceTask = item.sourceTaskId ? taskLookup.get(item.sourceTaskId) : null;
      const sourceAgent = item.sourceAgentId ? agentLookup.get(item.sourceAgentId) : null;
      const searchBody = [
        item.title,
        item.summary ?? '',
        item.lastError ?? '',
        sourceTask?.title ?? '',
        sourceAgent?.name ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return searchBody.includes(normalizedQuery);
    });
  }, [agentLookup, kindFilter, normalizedQuery, snapshot.workItems, statusFilter, taskLookup]);

  const filtersActive = query.trim().length > 0 || statusFilter !== 'all' || kindFilter !== 'all';

  return (
    <div className="space-y-5">
      <Card variant="elevated" padding="lg" animate={false} className="bg-surface-2">
        <CardHeader
          title="Tasks & Results"
          subtitle="Track scheduled work, inspect results, and send useful outputs back into a chat."
          action={
            <div className="flex flex-wrap gap-2">
              <Badge variant="brand">Tasks {snapshot.tasks.length}</Badge>
              <Badge variant="brand">Runs {snapshot.workItems.length}</Badge>
              <Badge variant="brand">Files {snapshot.artifacts.length}</Badge>
            </div>
          }
        />
      </Card>

      <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
        <SectionLabel
          action={
            filtersActive ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={<X size={14} />}
                onClick={() => {
                  setQuery('');
                  setStatusFilter('all');
                  setKindFilter('all');
                }}
              >
                Clear Filters
              </Button>
            ) : undefined
          }
        >
          Filters
        </SectionLabel>
        <Divider className="my-4" />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr]">
          <Input
            label="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks, results, agents, or errors"
            icon={<Search size={16} />}
          />
          <Select
            label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            options={[
              { value: 'all', label: 'All statuses' },
              ...['draft', 'scheduled', 'queued', 'running', 'done', 'failed', 'cancelled'].map(
                (status) => ({
                  value: status,
                  label: status,
                }),
              ),
            ]}
          />
          <Select
            label="Kind"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}
            options={[
              { value: 'all', label: 'All kinds' },
              { value: 'task', label: 'Task' },
              { value: 'council', label: 'Council' },
              { value: 'artifact', label: 'Artifact results' },
            ]}
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <InfoTile label="Matching Tasks" value={`${filteredTasks.length}`} />
          <InfoTile label="Matching Results" value={`${filteredWorkItems.length}`} />
        </div>
      </Card>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
          <SectionLabel count={filteredTasks.length}>Tasks</SectionLabel>
          <Divider className="my-4" />

          {snapshot.tasks.length === 0 ? (
            <EmptyState
              icon={<Play size={18} className="text-white/45" />}
              title="No tasks yet"
              description="Create a task from Prism or Spectrum to start scheduling work."
              compact
            />
          ) : filteredTasks.length === 0 ? (
            <EmptyState
              icon={<Search size={18} className="text-white/45" />}
              title="No tasks match"
              description="Try widening your filters or clearing the search query."
              compact
            />
          ) : (
            <motion.div
              className="space-y-4"
              variants={listVariants}
              initial="hidden"
              animate="show"
            >
              {filteredTasks.map((task) => (
                <motion.div key={task.id} variants={itemVariants}>
                  <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                    <CardHeader
                      title={task.title}
                      subtitle={describeTaskTarget(task, agentLookup)}
                      action={
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="default">{task.mode}</Badge>
                          <StatusBadge status={task.status} />
                        </div>
                      }
                    />

                    <p className="mt-3 text-sm leading-6 text-white/65">{task.objective}</p>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <InfoTile
                        label="Next Run"
                        value={task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : 'Not scheduled'}
                      />
                      <InfoTile label="Target" value={describeTaskTarget(task, agentLookup)} />
                      <InfoTile label="Artifacts" value={task.outputPolicy.artifactMode} />
                      <InfoTile label="Notifications" value={task.outputPolicy.notificationMode} />
                    </div>

                    {task.lastError ? (
                      <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                        {task.lastError}
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        icon={<MessageSquareMore size={14} />}
                        onClick={() =>
                          onOpenChat(
                            task.target.type === 'prism'
                              ? 'prism'
                              : { type: 'agent', id: task.target.agentId },
                          )
                        }
                      >
                        Open Chat
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        icon={<Copy size={14} />}
                        disabled={busy}
                        onClick={() => onDuplicateTask(task.id)}
                      >
                        Duplicate
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        icon={<Play size={14} />}
                        disabled={busy}
                        onClick={() => onRerunTask(task.id)}
                      >
                        Rerun
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        icon={<Trash2 size={14} />}
                        disabled={busy}
                        onClick={() => onDeleteTask(task.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </Card>

        <Card variant="default" padding="lg" animate={false} className="bg-surface-2">
          <SectionLabel count={filteredWorkItems.length}>Results</SectionLabel>
          <Divider className="my-4" />

          {snapshot.workItems.length === 0 ? (
            <EmptyState
              icon={<Send size={18} className="text-white/45" />}
              title="No results yet"
              description="Completed tasks and their artifacts will appear here."
              compact
            />
          ) : filteredWorkItems.length === 0 ? (
            <EmptyState
              icon={<Search size={18} className="text-white/45" />}
              title="No results match"
              description="Adjust the current filters to reveal more runs or artifacts."
              compact
            />
          ) : (
            <motion.div
              className="space-y-4"
              variants={listVariants}
              initial="hidden"
              animate="show"
            >
              {filteredWorkItems.map((item) => {
                const expanded = expandedWorkId === item.id;
                const sourceTask = item.sourceTaskId ? taskLookup.get(item.sourceTaskId) : null;
                const artifacts = item.artifactIds
                  .map((artifactId) => artifactLookup.get(artifactId))
                  .filter((artifact): artifact is ArtifactRecord => Boolean(artifact));

                return (
                  <motion.div key={item.id} variants={itemVariants}>
                    <Card variant="default" padding="md" animate={false} className="bg-surface-3">
                      <CardHeader
                        title={item.title}
                        subtitle={sourceTask ? `From ${sourceTask.title}` : 'Standalone work item'}
                        action={<StatusBadge status={item.status} />}
                      />

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="default">{item.type}</Badge>
                        <Badge variant="outline">
                          {item.sourceAgentId
                            ? `Routes to ${agentLookup.get(item.sourceAgentId)?.name ?? 'chatbot'}`
                            : 'Routes to Prism'}
                        </Badge>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          icon={<MessageSquareMore size={14} />}
                          onClick={() =>
                            onOpenChat(item.sourceAgentId ? { type: 'agent', id: item.sourceAgentId } : 'prism')
                          }
                        >
                          Open Chat
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedWorkId((current) => (current === item.id ? null : item.id))}
                        >
                          {expanded ? 'Close' : 'Open'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={<Send size={14} />}
                          disabled={!item.summary}
                          onClick={() => onSendToChat(item)}
                        >
                          Send to Chat
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={<Copy size={14} />}
                          disabled={!item.sourceTaskId || busy}
                          onClick={() => (item.sourceTaskId ? onDuplicateTask(item.sourceTaskId) : Promise.resolve())}
                        >
                          Duplicate
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          icon={<Play size={14} />}
                          disabled={!item.sourceTaskId || busy}
                          onClick={() => (item.sourceTaskId ? onRerunTask(item.sourceTaskId) : Promise.resolve())}
                        >
                          Rerun
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          icon={<Trash2 size={14} />}
                          disabled={busy}
                          onClick={() => onDeleteWorkItem(item.id)}
                        >
                          Delete
                        </Button>
                      </div>

                      {expanded ? (
                        <div className="mt-5 space-y-4">
                          {item.summary ? (
                            <div className="whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-surface-1 px-4 py-4 text-sm leading-7 text-white/74">
                              {item.summary}
                            </div>
                          ) : null}

                          {item.lastError ? (
                            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                              {item.lastError}
                            </div>
                          ) : null}

                          {artifacts.length ? (
                            <div className="space-y-3">
                              <SectionLabel count={artifacts.length}>Artifacts</SectionLabel>
                              {artifacts.map((artifact) => (
                                <Card
                                  key={artifact.id}
                                  variant="default"
                                  padding="md"
                                  animate={false}
                                  className="bg-surface-1"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-white">{artifact.title}</div>
                                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
                                        {artifact.kind} / {artifact.relativePath}
                                      </div>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => onOpenArtifact(artifact.id)}
                                    >
                                      Open File
                                    </Button>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          ) : null}

                          <div className="grid gap-3 md:grid-cols-2">
                            <InfoTile label="Updated" value={new Date(item.updatedAt).toLocaleString()} />
                            <InfoTile label="Artifacts" value={`${item.artifactIds.length}`} />
                          </div>
                        </div>
                      ) : null}
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </Card>
      </section>
    </div>
  );
}

function describeTaskTarget(task: TaskSpec, agentLookup: Map<string, AgentSpec>) {
  if (task.target.type === 'prism') {
    return 'Prism';
  }

  return agentLookup.get(task.target.agentId)?.name ?? `Chatbot ${task.target.agentId}`;
}

function StatusBadge({ status }: { status: TaskSpec['status'] | WorkItem['status'] }) {
  const variant: React.ComponentProps<typeof Badge>['variant'] =
    status === 'done'
      ? 'success'
      : status === 'failed'
        ? 'error'
        : status === 'running'
          ? 'warning'
          : status === 'scheduled'
            ? 'info'
            : status === 'queued'
              ? 'info'
              : status === 'cancelled'
                ? 'outline'
                : 'default';

  return <Badge variant={variant}>{status}</Badge>;
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-1 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-white/40">
        {label}
      </div>
      <div className="mt-2 text-sm leading-6 text-white/72">{value}</div>
    </div>
  );
}
